import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectRevenues, projectCosts, kpiTargets } from "@/db/schema";
import { eq, sql, isNotNull, and } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));
    const criteria = searchParams.get("criteria") ?? "캠페인 시작날짜";
    const useInvoice = criteria === "계산서날짜";

    // 3개 쿼리 완전 병렬 실행
    const [projectData, kpiRows, costRows] = await Promise.all([
      // 확인된 프로젝트 + revenue 합계 단일 쿼리
      db.select({
          id:             projects.id,
          startDate:      projects.startDate,
          assignedTeam:   projects.assignedTeam,
          contractAmount: projects.contractAmount,
          totalSum:       sql<number>`COALESCE(SUM(${projectRevenues.total}), 0)`,
          refMonth:       sql<string>`TO_CHAR(MAX(${useInvoice ? projectRevenues.invoiceDate : projectRevenues.paymentDate}), 'YYYY-MM')`,
        })
        .from(projects)
        .innerJoin(projectRevenues, eq(projectRevenues.projectId, projects.id))
        .where(
          useInvoice
            ? and(
                isNotNull(projectRevenues.paymentDate),
                isNotNull(projectRevenues.invoiceDate),
                sql`EXTRACT(YEAR FROM ${projects.startDate}) = ${year}`,
              )
            : and(
                isNotNull(projectRevenues.paymentDate),
                sql`EXTRACT(YEAR FROM ${projects.startDate}) = ${year}`,
              )
        )
        .groupBy(projects.id, projects.startDate, projects.assignedTeam, projects.contractAmount),

      db.select().from(kpiTargets).where(eq(kpiTargets.year, year)),

      db.select({
          month: sql<string>`TO_CHAR(${projects.startDate}, 'YYYY-MM')`,
          total: sql<number>`COALESCE(SUM(${projectCosts.total}), 0)`,
        })
        .from(projectCosts)
        .innerJoin(projects, eq(projects.id, projectCosts.projectId))
        .where(and(
          eq(projectCosts.isApproved, true),
          sql`EXTRACT(YEAR FROM ${projects.startDate}) = ${year}`,
        ))
        .groupBy(sql`TO_CHAR(${projects.startDate}, 'YYYY-MM')`),
    ]);

    const monthlyCosts = Array.from({ length: 12 }, (_, i) => {
      const m = `${year}-${String(i + 1).padStart(2, "0")}`;
      const row = costRows.find((r) => r.month === m);
      return row ? Number(row.total) : 0;
    });

    type MonthEntry = { [team: string]: number };
    const teamMonthMap = new Map<string, MonthEntry[]>();

    for (const p of projectData) {
      const monthStr = useInvoice
        ? (p.refMonth ?? "")
        : (p.startDate ? `${year}-${p.startDate.substring(5, 7)}` : "");
      if (!monthStr || !monthStr.startsWith(`${year}`)) continue;

      const monthIdx = parseInt(monthStr.substring(5, 7)) - 1;
      const team  = p.assignedTeam ?? "";
      const total = p.contractAmount ?? Number(p.totalSum ?? 0);

      if (!teamMonthMap.has(team)) {
        teamMonthMap.set(team, Array.from({ length: 12 }, () => ({ total: 0 })));
      }
      teamMonthMap.get(team)![monthIdx].total += total;
    }

    // KPI 설정된 팀도 revenue 없이 포함 (revenue 0 팀이 빠져 전체 합산 데이터가 표시되는 버그 방지)
    for (const k of kpiRows) {
      if (k.team && k.team !== "전체" && !teamMonthMap.has(k.team)) {
        teamMonthMap.set(k.team, Array.from({ length: 12 }, () => ({ total: 0 })));
      }
    }

    const rows: { month: string; team: string | null; total: number }[] = [];
    for (const [team, months] of teamMonthMap.entries()) {
      months.forEach((m, i) => {
        if (m.total > 0) {
          rows.push({ month: `${year}-${String(i + 1).padStart(2, "0")}`, team, total: m.total });
        }
      });
    }

    const teams = Array.from(teamMonthMap.keys()).filter(Boolean) as string[];
    const monthStrs = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);

    const monthly = monthStrs.map((month, idx) => {
      const monthNum = idx + 1;
      const entry: Record<string, string | number> = { month };
      let total = 0;
      let kpiTotal = 0;
      for (const team of teams) {
        const row = rows.find((r) => r.month === month && r.team === team);
        const v = row ? row.total : 0;
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
      yearTotal[team] = rows.filter((r) => r.team === team).reduce((s, r) => s + r.total, 0);
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
      currentMonth[team] = row ? row.total : 0;
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
      prevMonthData[team] = row ? row.total : 0;
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
