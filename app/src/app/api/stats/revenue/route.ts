import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectRevenues, projectCosts, kpiTargets } from "@/db/schema";
import { eq, sql, isNotNull, and, inArray } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const yearParam = searchParams.get("year");
    const year = yearParam ? parseInt(yearParam) : new Date().getFullYear();

    // 매출 행 기준: 캠페인 시작일(projects.startDate), 승인된 매출(paymentDate IS NOT NULL)
    const rows = await db
      .select({
        month: sql<string>`TO_CHAR(${projects.startDate}, 'YYYY-MM')`,
        team:  projects.assignedTeam,
        total: sql<number>`COALESCE(SUM(${projectRevenues.total}), 0)`,
      })
      .from(projectRevenues)
      .innerJoin(projects, eq(projects.id, projectRevenues.projectId))
      .where(
        and(
          isNotNull(projectRevenues.paymentDate),
          sql`EXTRACT(YEAR FROM ${projects.startDate}) = ${year}`
        )
      )
      .groupBy(
        sql`TO_CHAR(${projects.startDate}, 'YYYY-MM')`,
        projects.assignedTeam
      )
      .orderBy(
        sql`TO_CHAR(${projects.startDate}, 'YYYY-MM')`
      );

    // KPI 목표 로드
    const kpiRows = await db
      .select()
      .from(kpiTargets)
      .where(eq(kpiTargets.year, year));

    // 매출 확정된 프로젝트 ID 목록 (paymentDate가 있는 매출이 존재하는 프로젝트만)
    const confirmedProjectIds = db
      .selectDistinct({ projectId: projectRevenues.projectId })
      .from(projectRevenues)
      .where(isNotNull(projectRevenues.paymentDate));

    // 캠페인 시작일 기준 월별 승인 매입 비용 — 매출 확정된 캠페인에 한해서만 집계
    const costRows = await db
      .select({
        month: sql<string>`TO_CHAR(${projects.startDate}, 'YYYY-MM')`,
        total: sql<number>`COALESCE(SUM(${projectCosts.total}), 0)`,
      })
      .from(projectCosts)
      .innerJoin(projects, eq(projects.id, projectCosts.projectId))
      .where(
        and(
          eq(projectCosts.isApproved, true),
          inArray(projectCosts.projectId, confirmedProjectIds),
          sql`EXTRACT(YEAR FROM ${projects.startDate}) = ${year}`
        )
      )
      .groupBy(sql`TO_CHAR(${projects.startDate}, 'YYYY-MM')`);

    const monthlyCosts = Array.from({ length: 12 }, (_, i) => {
      const m = `${year}-${String(i + 1).padStart(2, "0")}`;
      const row = costRows.find((r) => r.month === m);
      return row ? Number(row.total) : 0;
    });

    // 팀 목록 추출
    const teams = Array.from(new Set(rows.map((r) => r.team).filter(Boolean))) as string[];

    // 12개월 슬롯
    const months = Array.from({ length: 12 }, (_, i) => {
      const m = String(i + 1).padStart(2, "0");
      return `${year}-${m}`;
    });

    // 월별 데이터 + KPI 집계
    const monthly = months.map((month, idx) => {
      const monthNum = idx + 1;
      const entry: Record<string, string | number> = { month };
      let total = 0;
      let kpiTotal = 0;
      for (const team of teams) {
        const row = rows.find((r) => r.month === month && r.team === team);
        const v = row ? Number(row.total) : 0;
        entry[team] = v;
        total += v;
        const kpi = kpiRows.find((k) => k.month === monthNum && k.team === team);
        const kv = kpi ? kpi.target : 0;
        entry[`kpi_${team}`] = kv;
        kpiTotal += kv;
      }
      const kpiAll = kpiRows.find((k) => k.month === monthNum && k.team === "전체");
      entry.kpiTotal = kpiAll ? kpiAll.target : kpiTotal;
      entry.total = total;
      entry.cost = monthlyCosts[idx];
      entry.profit = total - monthlyCosts[idx];
      return entry;
    });

    // 연 누적
    const yearTotal: Record<string, number> = { total: 0 };
    const yearKpi: Record<string, number> = { total: 0 };
    for (const team of teams) {
      yearTotal[team] = rows.filter((r) => r.team === team).reduce((s, r) => s + Number(r.total), 0);
      yearTotal.total += yearTotal[team];
      yearKpi[team] = kpiRows.filter((k) => k.team === team).reduce((s, k) => s + k.target, 0);
      yearKpi.total += yearKpi[team];
    }

    // 이번 달
    const thisMonthNum = new Date().getMonth() + 1;
    const thisMonth = `${year}-${String(thisMonthNum).padStart(2, "0")}`;
    const currentMonth: Record<string, number> = { total: 0 };
    const currentKpi: Record<string, number> = { total: 0 };
    for (const team of teams) {
      const row = rows.find((r) => r.month === thisMonth && r.team === team);
      currentMonth[team] = row ? Number(row.total) : 0;
      currentMonth.total += currentMonth[team];
      const kpi = kpiRows.find((k) => k.month === thisMonthNum && k.team === team);
      currentKpi[team] = kpi ? kpi.target : 0;
      currentKpi.total += currentKpi[team];
    }
    // 전체 KPI override
    const kpiAllMonth = kpiRows.find((k) => k.month === thisMonthNum && k.team === "전체");
    if (kpiAllMonth) currentKpi.total = kpiAllMonth.target;

    // 지난 달
    const prevDate = new Date(year, new Date().getMonth() - 1, 1);
    const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
    const prevMonthData: Record<string, number> = { total: 0 };
    for (const team of teams) {
      const row = rows.find((r) => r.month === prevMonthStr && r.team === team);
      prevMonthData[team] = row ? Number(row.total) : 0;
      prevMonthData.total += prevMonthData[team];
    }

    return NextResponse.json({
      monthly, yearTotal, yearKpi,
      currentMonth, currentKpi,
      prevMonth: prevMonthData,
      monthlyCosts,
      teams, year,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch revenue stats" }, { status: 500 });
  }
}
