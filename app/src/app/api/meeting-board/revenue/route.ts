import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { kpiTargets } from "@/db/schema";
import { and, eq, or, sql } from "drizzle-orm";
import { monthRange } from "@/lib/month-range";
import { isRevenueConfirmed, parseCriteria } from "@/lib/revenue-stats";

/**
 * 정기 회의록 "① 전체 매출" — 회사 전체(팀 구분 없음) 매출을 회의에서 읽는 모양으로 돌려준다.
 *
 *   month   — 이번 달 목표·기준일까지 실적·수주 예상
 *   weeks   — 기준일이 속한 주까지 최근 6주(월~일)의 주간 매출. 이번 주는 기준일까지만 센다
 *   months  — 지난 2달 + 이번 달의 실적·목표 (지난 달은 말일까지 전체, 이번 달은 기준일까지)
 *
 * 금액 규칙은 revenue-brief·revenue-stats와 같다.
 *   캠페인 시작날짜 — 입금확인요청이 확인완료된 프로젝트의 계약 공급가(kpi_supply, 비면 매출 행 공급가 합), 시작일로 귀속
 *   계산서날짜·통장 — 실제 매출 행 공급가, 발행일·입금일로 귀속
 *   수주 예상 — 당월 시작 프로젝트의 계약 공급가 합 (확인 여부 무관)
 * 목표는 kpi_targets — "전체" 행이 있으면 그 값, 없으면 팀 행 합. 0은 미설정으로 본다.
 */

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (s: string, n: number) => {
  const d = new Date(`${s}T00:00:00`);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const mondayOf = (s: string) => addDays(s, -((new Date(`${s}T00:00:00`).getDay() + 6) % 7));

const WEEK_COUNT = 6;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const year  = parseInt(searchParams.get("year")  ?? "0");
    const month = parseInt(searchParams.get("month") ?? "0");
    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: "year·month 필요" }, { status: 400 });
    }
    const criteria = parseCriteria(searchParams.get("criteria"));

    const { from, to } = monthRange(year, month);
    const rawAsOf = searchParams.get("asOf") || new Date().toLocaleDateString("sv-SE");
    const asOf = rawAsOf < from ? from : rawAsOf > to ? to : rawAsOf;

    // 비교할 달 — 지난 2달 + 이번 달 (연도 경계 처리)
    const monthKeys = [2, 1, 0].map(back => {
      const d = new Date(year, month - 1 - back, 1);
      const y = d.getFullYear(), m = d.getMonth() + 1;
      return { year: y, month: m, ...monthRange(y, m) };
    });

    // 주차 — 기준일이 속한 주의 월요일부터 거꾸로 6주
    const lastMonday = mondayOf(asOf);
    const weekStarts = Array.from({ length: WEEK_COUNT }, (_, i) => addDays(lastMonday, -7 * (WEEK_COUNT - 1 - i)));

    // 한 번에 읽을 날짜 범위 — 비교 달의 첫날과 첫 주 월요일 중 이른 날 ~ 이번 달 말일
    const rangeFrom = weekStarts[0] < monthKeys[0].from ? weekStarts[0] : monthKeys[0].from;
    const rangeTo = to;

    // ── 날짜별 매출 ──
    type Row = { ref_date: string; amount: string | number };
    let rows: Row[];
    if (criteria === "캠페인 시작날짜") {
      rows = Array.from(await db.execute<Row>(sql`
        SELECT TO_CHAR(p.start_date, 'YYYY-MM-DD') AS ref_date,
               SUM(COALESCE(p.kpi_supply, rv.supply_sum, 0)) AS amount
        FROM projects p
        LEFT JOIN (
          SELECT project_id, SUM(supply_price) AS supply_sum
          FROM project_revenues GROUP BY project_id
        ) rv ON rv.project_id = p.id
        WHERE p.start_date IS NOT NULL
          AND p.start_date >= ${rangeFrom} AND p.start_date <= ${rangeTo}
          AND ${isRevenueConfirmed(sql`p.id`)}
        GROUP BY 1
      `));
    } else {
      const col = criteria === "계산서날짜" ? sql`r.invoice_date` : sql`r.payment_date`;
      rows = Array.from(await db.execute<Row>(sql`
        SELECT TO_CHAR(${col}, 'YYYY-MM-DD') AS ref_date,
               SUM(COALESCE(r.supply_price, 0)) AS amount
        FROM project_revenues r
        WHERE ${col} IS NOT NULL AND ${col} >= ${rangeFrom} AND ${col} <= ${rangeTo}
        GROUP BY 1
      `));
    }
    const daily = rows.map(r => ({ date: r.ref_date, amount: Number(r.amount ?? 0) }));
    const sumBetween = (a: string, b: string) =>
      daily.reduce((s, r) => (r.date >= a && r.date <= b ? s + r.amount : s), 0);

    // ── 목표 ──
    const kpiRows = await db.select({ year: kpiTargets.year, month: kpiTargets.month, team: kpiTargets.team, target: kpiTargets.target })
      .from(kpiTargets)
      .where(or(...monthKeys.map(k => and(eq(kpiTargets.year, k.year), eq(kpiTargets.month, k.month)))));
    const targetOf = (y: number, m: number): number | null => {
      const mine = kpiRows.filter(r => r.year === y && r.month === m);
      const whole = mine.find(r => r.team === "전체")?.target ?? 0;
      const v = whole > 0 ? whole : mine.filter(r => r.team !== "전체").reduce((s, r) => s + Math.max(r.target, 0), 0);
      return v > 0 ? v : null;
    };

    // ── 수주 예상 — 당월 시작 프로젝트의 계약 공급가 (확인 여부 무관) ──
    const [fc] = Array.from(await db.execute<{ forecast: string | number }>(sql`
      SELECT COALESCE(SUM(COALESCE(p.kpi_supply, rv.supply_sum, 0)), 0) AS forecast
      FROM projects p
      LEFT JOIN (
        SELECT project_id, SUM(supply_price) AS supply_sum
        FROM project_revenues GROUP BY project_id
      ) rv ON rv.project_id = p.id
      WHERE p.start_date IS NOT NULL AND p.start_date >= ${from} AND p.start_date <= ${to}
    `));

    const target = targetOf(year, month);
    const asOfRevenue = sumBetween(from, asOf);
    const daysInMonth = Number(to.slice(8, 10));
    const asOfDay = Number(asOf.slice(8, 10));

    return NextResponse.json({
      year, month, criteria, asOf,
      current: {
        target,
        asOfRevenue,
        monthRevenue: sumBetween(from, to),   // 기준일 이후로 이미 잡힌 것까지 포함
        forecast: Number(fc?.forecast ?? 0),
        asOfDay,
        daysInMonth,
      },
      weeks: weekStarts.map(start => {
        const end = addDays(start, 6);
        const cut = end > asOf ? asOf : end;   // 이번 주는 기준일까지만
        return { start, end, current: start === lastMonday, amount: sumBetween(start, cut) };
      }),
      months: monthKeys.map((k, i) => {
        const current = i === monthKeys.length - 1;
        return {
          year: k.year, month: k.month, current,
          actual: sumBetween(k.from, current ? asOf : k.to),
          target: targetOf(k.year, k.month),
        };
      }),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "전체 매출 집계 실패" }, { status: 500 });
  }
}
