import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  users, projects, projectRevenues, projectCosts,
  confirmRequests, paymentRequests, internalExpenseRequests, internalLeaveRequests,
} from "@/db/schema";
import { and, eq, ne, or, gte, lte, inArray, isNotNull, isNull, asc, sql } from "drizzle-orm";
import { monthRange } from "@/lib/month-range";
import { isRevenueConfirmed } from "@/lib/revenue-stats";

/**
 * 정기 회의록 "⑦ 관리팀" — 회사 살림(손익 · 결재 · 세금계산서 · 인사)을 회의에서 읽는 모양으로 돌려준다.
 *
 *   pl       — 지난 3달 + 이번 달(진행 중)의 매출 · 매입 · 마진
 *   focus    — 마진·데이터 점검을 볼 "끝난 달". 이번 달이 끝났으면 이번 달, 아니면 지난달
 *   pending  — 결재 대기: 입금확인 · 매입 · 휴가 · 내부지출 · 입금요청
 *   leaves   — 기준일 이후 다가오는 휴가(대기·승인)
 *   fix      — 정리가 필요한 데이터: 입금일 빈 매출 행 · 금액 없는 내부지출 · 계산서 발행일 없는 입금확인
 *
 * 손익 금액 규칙은 revenue-brief의 "캠페인 시작날짜" 기준과 같다.
 *   매출 — 그 달 시작 프로젝트 중 입금확인요청이 확인완료된 것의 계약 공급가(kpi_supply, 비면 매출 행 공급가 합)
 *   매입 — 승인된 매입 행의 공급가, 작업시작일로 귀속
 * 관리팀 손익은 화면의 매출 기준 선택과 무관하게 항상 이 규칙으로 본다 — 매출과 매입의 귀속 기준이 같아야 마진이 맞는다.
 */

type Ym = { year: number; month: number };
const shift = ({ year, month }: Ym, n: number): Ym => {
  const d = new Date(year, month - 1 + n, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
};
const ymKey = ({ year, month }: Ym) => `${year}-${String(month).padStart(2, "0")}`;
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86400000);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const year  = parseInt(searchParams.get("year")  ?? "0");
    const month = parseInt(searchParams.get("month") ?? "0");
    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: "year·month 필요" }, { status: 400 });
    }

    const cur = { year, month };
    const { from, to } = monthRange(year, month);
    const rawAsOf = searchParams.get("asOf") || new Date().toLocaleDateString("sv-SE");
    const asOf = rawAsOf < from ? from : rawAsOf > to ? to : rawAsOf;
    const monthOver = asOf >= to;

    // 손익 표 — 지난 3달 + 이번 달
    const plMonths = [-3, -2, -1, 0].map(n => shift(cur, n));
    const plFrom = monthRange(plMonths[0].year, plMonths[0].month).from;

    // 마진·점검 기준 달 — 이번 달이 끝났으면 이번 달, 아니면 지난달
    const focus = monthOver ? cur : shift(cur, -1);
    const focusRange = monthRange(focus.year, focus.month);

    // 입금일 점검 범위 — 최근 3달(이번 달 포함) 시작분, 기준일까지
    const unpaidFrom = monthRange(shift(cur, -2).year, shift(cur, -2).month).from;

    // ── 손익: 매출 ──
    const plProjects = await db
      .select({ id: projects.id, startDate: projects.startDate, kpiSupply: projects.kpiSupply })
      .from(projects)
      .where(and(
        isNotNull(projects.startDate), gte(projects.startDate, plFrom), lte(projects.startDate, to),
        isRevenueConfirmed(projects.id),
      ));
    const needSum = plProjects.filter(p => p.kpiSupply === null).map(p => p.id);
    const revSumRows = needSum.length
      ? await db
          .select({ projectId: projectRevenues.projectId, supplySum: sql<number>`COALESCE(SUM(${projectRevenues.supplyPrice}), 0)` })
          .from(projectRevenues)
          .where(inArray(projectRevenues.projectId, needSum))
          .groupBy(projectRevenues.projectId)
      : [];
    const revSumByProject = new Map(revSumRows.map(r => [r.projectId, Number(r.supplySum ?? 0)]));

    const revenueBy = new Map<string, number>();
    for (const p of plProjects) {
      const k = p.startDate!.slice(0, 7);
      revenueBy.set(k, (revenueBy.get(k) ?? 0) + (p.kpiSupply ?? revSumByProject.get(p.id) ?? 0));
    }

    // ── 손익: 매입 ──
    const costMonth = sql<string>`to_char(${projectCosts.workStartDate}, 'YYYY-MM')`;
    const costRows = await db
      .select({ ym: costMonth, amount: sql<number>`COALESCE(SUM(${projectCosts.supplyPrice}), 0)` })
      .from(projectCosts)
      .where(and(
        eq(projectCosts.isApproved, true),
        isNotNull(projectCosts.workStartDate), gte(projectCosts.workStartDate, plFrom), lte(projectCosts.workStartDate, to),
      ))
      .groupBy(costMonth);
    const costBy = new Map(costRows.map(r => [r.ym, Number(r.amount ?? 0)]));

    const pl = plMonths.map(m => {
      const k = ymKey(m);
      const revenue = revenueBy.get(k) ?? 0;
      const cost = costBy.get(k) ?? 0;
      const isCurrent = m.year === year && m.month === month;
      return {
        year: m.year, month: m.month, revenue, cost, margin: revenue - cost,
        rate: revenue ? ((revenue - cost) / revenue) * 100 : null,
        inProgress: isCurrent && !monthOver,
      };
    });

    // ── 결재 대기 ──
    const [confirmWait, costWait, paymentWait, leaveWait, expenseWait] = await Promise.all([
      db.select({ projectName: confirmRequests.projectName, requester: confirmRequests.requester, requestedAt: confirmRequests.requestedAt })
        .from(confirmRequests).where(eq(confirmRequests.status, "대기")).orderBy(asc(confirmRequests.requestedAt)),
      // 손익 표에 들어갈 기간(작업시작일)의 미승인 매입 — 금액이 비거나 0인 자리표시 행은 뺀다
      db.select({ n: sql<number>`COUNT(*)`, supply: sql<number>`COALESCE(SUM(${projectCosts.supplyPrice}), 0)` })
        .from(projectCosts)
        .where(and(
          or(eq(projectCosts.isApproved, false), isNull(projectCosts.isApproved)),
          isNotNull(projectCosts.supplyPrice), ne(projectCosts.supplyPrice, 0),
          isNotNull(projectCosts.workStartDate), gte(projectCosts.workStartDate, plFrom), lte(projectCosts.workStartDate, to),
        )),
      db.select({ n: sql<number>`COUNT(*)` }).from(paymentRequests).where(eq(paymentRequests.status, "대기")),
      db.select({
          requester: internalLeaveRequests.requester, leaveType: internalLeaveRequests.leaveType,
          startDate: internalLeaveRequests.startDate, endDate: internalLeaveRequests.endDate, leaveDays: internalLeaveRequests.leaveDays,
        })
        .from(internalLeaveRequests).where(eq(internalLeaveRequests.status, "대기")).orderBy(asc(internalLeaveRequests.startDate)),
      db.select({ title: internalExpenseRequests.title, requester: internalExpenseRequests.requester, amount: internalExpenseRequests.amount })
        .from(internalExpenseRequests).where(eq(internalExpenseRequests.status, "대기")),
    ]);

    const oldest = confirmWait[0];
    const pending = {
      confirm: {
        count: confirmWait.length,
        oldestDays: oldest?.requestedAt ? Math.max(0, daysBetween(oldest.requestedAt.slice(0, 10), asOf)) : null,
        oldestName: oldest?.projectName ?? null,
        requesters: [...new Set(confirmWait.map(r => r.requester).filter(Boolean))],
      },
      cost: { count: Number(costWait[0]?.n ?? 0), supply: Number(costWait[0]?.supply ?? 0) },
      payment: { count: Number(paymentWait[0]?.n ?? 0) },
      leave: leaveWait.map(l => ({ ...l, leaveDays: Number(l.leaveDays ?? 0) })),
      expense: {
        count: expenseWait.length,
        amount: expenseWait.reduce((s, e) => s + (e.amount ?? 0), 0),
        titles: expenseWait.slice(0, 3).map(e => e.title),
      },
    };

    // ── 다가오는 휴가 — 기준일에 걸쳐 있거나 이후 시작, 반려 제외 ──
    const leaves = await db
      .select({
        requester: internalLeaveRequests.requester, leaveType: internalLeaveRequests.leaveType,
        startDate: internalLeaveRequests.startDate, endDate: internalLeaveRequests.endDate,
        leaveDays: internalLeaveRequests.leaveDays, status: internalLeaveRequests.status,
      })
      .from(internalLeaveRequests)
      .where(and(
        inArray(internalLeaveRequests.status, ["대기", "승인"]),
        sql`COALESCE(${internalLeaveRequests.endDate}, ${internalLeaveRequests.startDate}) >= ${asOf}`,
      ))
      .orderBy(asc(internalLeaveRequests.startDate))
      .limit(10);

    // ── 정리가 필요한 데이터 ──
    const [unpaid, expenseFocus, invoiceFocus] = await Promise.all([
      db.select({ n: sql<number>`COUNT(*)`, supply: sql<number>`COALESCE(SUM(${projectRevenues.supplyPrice}), 0)` })
        .from(projectRevenues)
        .innerJoin(projects, eq(projects.id, projectRevenues.projectId))
        .where(and(
          isNull(projectRevenues.paymentDate),
          isNotNull(projects.startDate), gte(projects.startDate, unpaidFrom), lte(projects.startDate, asOf),
        )),
      db.select({ title: internalExpenseRequests.title, amount: internalExpenseRequests.amount, status: internalExpenseRequests.status })
        .from(internalExpenseRequests)
        .where(and(gte(internalExpenseRequests.requestedAt, focusRange.from), lte(internalExpenseRequests.requestedAt, focusRange.to))),
      // requested_at은 'YYYY-MM-DD' 문자열 — 문자열 비교로 월 범위를 자른다
      db.select({ taxInvoiceDate: confirmRequests.taxInvoiceDate, taxExempt: confirmRequests.taxExempt })
        .from(confirmRequests)
        .where(and(
          eq(confirmRequests.status, "확인완료"),
          gte(confirmRequests.requestedAt, focusRange.from), lte(confirmRequests.requestedAt, `${focusRange.to}~`),
        )),
    ]);

    const noAmount = expenseFocus.filter(e => e.status !== "반려" && !e.amount);
    const noInvoice = invoiceFocus.filter(c => !c.taxInvoiceDate?.trim());
    const fix = {
      unpaidRevenue: {
        count: Number(unpaid[0]?.n ?? 0),
        supply: Number(unpaid[0]?.supply ?? 0),
        fromMonth: Number(unpaidFrom.slice(5, 7)),
      },
      expenseNoAmount: {
        count: noAmount.length,
        total: expenseFocus.length,
        titles: noAmount.slice(0, 3).map(e => e.title),
      },
      invoiceMissing: {
        count: noInvoice.filter(c => !c.taxExempt).length,
        exempt: noInvoice.filter(c => c.taxExempt).length,   // 면세라 발행일이 없어도 되는 건
        total: invoiceFocus.length,
      },
    };

    // ── 담당 — 경영팀 활성 사용자 ──
    const owners = await db.select({ name: users.name, position: users.position, team: users.team })
      .from(users).where(and(eq(users.status, "활성"), eq(users.team, "경영")));

    return NextResponse.json({
      year, month, asOf, monthOver,
      focus: { year: focus.year, month: focus.month },
      owners, pl, pending, leaves: leaves.map(l => ({ ...l, leaveDays: Number(l.leaveDays ?? 0) })), fix,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "관리팀 집계 실패" }, { status: 500 });
  }
}
