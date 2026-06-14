import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectRevenues, projectCosts, kpiTargets } from "@/db/schema";
import { eq, sql, isNotNull, and, inArray } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));
    const criteria = searchParams.get("criteria") ?? "캠페인 시작날짜";
    const useInvoice = criteria === "계산서날짜";

    const monthExpr = useInvoice
      ? sql<string>`TO_CHAR(${projectRevenues.invoiceDate}, 'YYYY-MM')`
      : sql<string>`TO_CHAR(${projects.startDate}, 'YYYY-MM')`;

    const whereClause = useInvoice
      ? and(
          isNotNull(projectRevenues.paymentDate),
          isNotNull(projectRevenues.invoiceDate),
          sql`EXTRACT(YEAR FROM ${projectRevenues.invoiceDate}) = ${year}`,
        )
      : and(
          isNotNull(projectRevenues.paymentDate),
          sql`EXTRACT(YEAR FROM ${projects.startDate}) = ${year}`,
        );

    const rows = await db
      .select({
        month: monthExpr,
        team:  projects.assignedTeam,
        total: sql<number>`COALESCE(SUM(${projectRevenues.total}), 0)`,
      })
      .from(projectRevenues)
      .innerJoin(projects, eq(projects.id, projectRevenues.projectId))
      .where(whereClause)
      .groupBy(monthExpr, projects.assignedTeam)
      .orderBy(monthExpr);

    // KPI 목표
    const kpiRows = await db.select().from(kpiTargets).where(eq(kpiTargets.year, year));

    // 매입 비용 (항상 캠페인 시작일 기준)
    const confirmedProjectIds = db
      .selectDistinct({ projectId: projectRevenues.projectId })
      .from(projectRevenues)
      .where(isNotNull(projectRevenues.paymentDate));

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

    const teams = Array.from(new Set(rows.map((r) => r.team).filter(Boolean))) as string[];
    const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);

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
      entry.total  = total;
      entry.cost   = monthlyCosts[idx];
      entry.profit = total - monthlyCosts[idx];
      return entry;
    });

    const yearTotal: Record<string, number> = { total: 0 };
    const yearKpi:   Record<string, number> = { total: 0 };
    for (const team of teams) {
      yearTotal[team] = rows.filter((r) => r.team === team).reduce((s, r) => s + Number(r.total), 0);
      yearTotal.total += yearTotal[team];
      yearKpi[team]   = kpiRows.filter((k) => k.team === team).reduce((s, k) => s + k.target, 0);
      yearKpi.total  += yearKpi[team];
    }

    const thisMonthNum = new Date().getMonth() + 1;
    const thisMonth    = `${year}-${String(thisMonthNum).padStart(2, "0")}`;
    const currentMonth: Record<string, number> = { total: 0 };
    const currentKpi:   Record<string, number> = { total: 0 };
    for (const team of teams) {
      const row = rows.find((r) => r.month === thisMonth && r.team === team);
      currentMonth[team] = row ? Number(row.total) : 0;
      currentMonth.total += currentMonth[team];
      const kpi = kpiRows.find((k) => k.month === thisMonthNum && k.team === team);
      currentKpi[team]  = kpi ? kpi.target : 0;
      currentKpi.total += currentKpi[team];
    }
    const kpiAllMonth = kpiRows.find((k) => k.month === thisMonthNum && k.team === "전체");
    if (kpiAllMonth) currentKpi.total = kpiAllMonth.target;

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
      monthlyCosts, teams, year,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch revenue stats" }, { status: 500 });
  }
}
