import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, projects, projectRevenues, memberKpiTargets } from "@/db/schema";
import { and, eq, ne, or, gte, lte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { monthRange } from "@/lib/month-range";
import { isRevenueConfirmed, parseCriteria } from "@/lib/revenue-stats";

/**
 * 회의록 "멤버별 매출 KPI" — 인원이 적은 지금은 팀보다 사람 단위로 목표를 보는 게 맞다.
 *
 * 사람은 프로젝트 담당자(projects.assigned_person)로 잇는다. 매출 행의 assignee는
 * 행마다 따로 적혀 있어 프로젝트 담당과 어긋나는 경우가 있으므로 쓰지 않는다.
 *
 * 금액 규칙은 revenue-brief와 같다.
 *   실적 — 화면에서 고른 기준(캠페인 시작일 = 확인완료된 수주 / 계산서·통장 = 실제 매출 행), 그 달 전체
 *   예상 — 당월 시작 프로젝트의 계약 공급가 (확인 여부 무관, 이미 수주한 금액)
 *   운영중 — 기준일(asOf) 현재 돌고 있는 캠페인 건수
 *   계약 — 당월 시작 프로젝트 중 확인완료된 건수
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const year  = parseInt(searchParams.get("year")  ?? "0");
    const month = parseInt(searchParams.get("month") ?? "0");
    if (!year || !month) return NextResponse.json({ error: "year·month 필요" }, { status: 400 });

    const teamParam = searchParams.get("team") ?? "전체";
    const team      = teamParam === "전체" ? null : teamParam;
    const criteria  = parseCriteria(searchParams.get("criteria"));
    const { from, to } = monthRange(year, month);
    const rawAsOf = searchParams.get("asOf") || new Date().toLocaleDateString("sv-SE");
    const asOf = rawAsOf < from ? from : rawAsOf > to ? to : rawAsOf;

    const [memberRows, targetRows] = await Promise.all([
      db.select({ name: users.name, team: users.team }).from(users)
        .where(and(eq(users.status, "활성"), team ? eq(users.team, team) : undefined)),
      db.select({ memberName: memberKpiTargets.memberName, target: memberKpiTargets.target })
        .from(memberKpiTargets)
        .where(and(eq(memberKpiTargets.year, year), eq(memberKpiTargets.month, month))),
    ]);

    // ── 당월 시작 프로젝트 — 수주 기준 실적과 예상매출의 바탕 ──
    const monthProjects = await db
      .select({
        id: projects.id, person: projects.assignedPerson, kpiSupply: projects.kpiSupply,
        confirmed: isRevenueConfirmed(projects.id),
      })
      .from(projects)
      .where(and(isNotNull(projects.startDate), gte(projects.startDate, from), lte(projects.startDate, to)));

    const monthIds = monthProjects.map(p => p.id);
    const revSumRows = monthIds.length
      ? await db
          .select({ projectId: projectRevenues.projectId, supplySum: sql<number>`COALESCE(SUM(${projectRevenues.supplyPrice}), 0)` })
          .from(projectRevenues)
          .where(inArray(projectRevenues.projectId, monthIds))
          .groupBy(projectRevenues.projectId)
      : [];
    const revSumByProject = new Map(revSumRows.map(r => [r.projectId, Number(r.supplySum ?? 0)]));
    // kpi_supply가 비면 매출 행 공급가 합으로 대체 — revenue-brief와 같은 규칙
    const supplyOf = (p: { id: string; kpiSupply: number | null }) => p.kpiSupply ?? revSumByProject.get(p.id) ?? 0;

    const revenue  = new Map<string, number>();
    const forecast = new Map<string, number>();
    const deals    = new Map<string, number>();   // 확인완료된 당월 시작 계약 건수 — 기준과 무관하게 수주 건수로 센다
    const add = (m: Map<string, number>, k: string | null, v: number) => {
      if (!k) return;
      m.set(k, (m.get(k) ?? 0) + v);
    };

    for (const p of monthProjects) {
      const amount = supplyOf(p);
      add(forecast, p.person, amount);
      if (p.confirmed) add(deals, p.person, 1);
      if (criteria === "캠페인 시작날짜" && p.confirmed) add(revenue, p.person, amount);
    }

    if (criteria !== "캠페인 시작날짜") {
      const dateCol = criteria === "통장" ? projectRevenues.paymentDate : projectRevenues.invoiceDate;
      const rows = await db
        .select({ person: projects.assignedPerson, amount: sql<number>`COALESCE(SUM(${projectRevenues.supplyPrice}), 0)` })
        .from(projectRevenues)
        .innerJoin(projects, eq(projects.id, projectRevenues.projectId))
        .where(and(isNotNull(dateCol), gte(dateCol, from), lte(dateCol, to)))
        .groupBy(projects.assignedPerson);
      for (const r of rows) add(revenue, r.person, Number(r.amount ?? 0));
    }

    // ── 기준일 현재 운영중 — revenue-brief와 같이 날짜 구간으로 판별한다 ──
    const activeRows = await db
      .select({ person: projects.assignedPerson, n: sql<number>`COUNT(*)` })
      .from(projects)
      .where(and(
        ne(projects.status, "리드"),
        isNotNull(projects.startDate),
        lte(projects.startDate, asOf),
        or(isNull(projects.endDate), gte(projects.endDate, asOf)),
      ))
      .groupBy(projects.assignedPerson);
    const active = new Map(activeRows.map(r => [r.person ?? "", Number(r.n)]));

    const targetOf = new Map(targetRows.map(r => [r.memberName, r.target]));

    const members = memberRows.map(m => {
      const t = targetOf.get(m.name) ?? 0;
      return {
        name:     m.name,
        team:     m.team,
        target:   t > 0 ? t : null,
        revenue:  revenue.get(m.name) ?? 0,
        forecast: forecast.get(m.name) ?? 0,
        deals:    deals.get(m.name) ?? 0,
        active:   active.get(m.name) ?? 0,
      };
    });

    // 목표가 있거나 실적이 있는 사람을 앞으로 — 회의에서 매출을 책임지는 사람부터 읽는다
    const weight = (m: (typeof members)[number]) => (m.target ? 2 : 0) + (m.revenue || m.forecast || m.active ? 1 : 0);
    members.sort((a, b) => weight(b) - weight(a) || a.name.localeCompare(b.name, "ko"));

    return NextResponse.json({ year, month, team: teamParam, criteria, asOf, members });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "멤버별 KPI 집계 실패" }, { status: 500 });
  }
}

/** 한 사람의 월 목표를 저장한다. 0 이하·빈 값이면 목표를 지운다. */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const year   = Number(body.year);
    const month  = Number(body.month);
    const member = typeof body.member === "string" ? body.member.trim() : "";
    const target = Math.round(Number(body.target) || 0);
    if (!year || !month || month < 1 || month > 12 || !member) {
      return NextResponse.json({ error: "필수값 누락" }, { status: 400 });
    }

    const where = and(eq(memberKpiTargets.year, year), eq(memberKpiTargets.month, month), eq(memberKpiTargets.memberName, member));
    if (target <= 0) {
      await db.delete(memberKpiTargets).where(where);
      return NextResponse.json({ target: null });
    }

    await db.insert(memberKpiTargets)
      .values({ year, month, memberName: member, target })
      .onConflictDoUpdate({
        target: [memberKpiTargets.year, memberKpiTargets.month, memberKpiTargets.memberName],
        set: { target, updatedAt: new Date() },
      });
    return NextResponse.json({ target });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "멤버 KPI 저장 실패" }, { status: 500 });
  }
}
