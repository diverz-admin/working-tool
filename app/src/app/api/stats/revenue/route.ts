import { NextResponse } from "next/server";
import { db } from "@/db";
import { kpiTargets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fetchRevenueStats, fetchCostStats, parseCriteria } from "@/lib/revenue-stats";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const year      = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));
    const teamParam = searchParams.get("team") ?? "";
    const criteria  = parseCriteria(searchParams.get("criteria"));

    // 매출·매입 집계는 대시보드(/api/dashboard)와 동일한 모듈을 공유한다 (@/lib/revenue-stats)
    const [revenueRows, costRows, kpiRows] = await Promise.all([
      fetchRevenueStats(year, criteria, teamParam || undefined),
      fetchCostStats(year, criteria, teamParam || undefined),
      db.select().from(kpiTargets).where(eq(kpiTargets.year, year)),
    ]);

    const monthlyCosts = Array.from({ length: 12 }, (_, i) => {
      const m = `${year}-${String(i + 1).padStart(2, "0")}`;
      const row = costRows.find((r) => r.month === m);
      return row ? row.total : 0;
    });

    // 팀별 월별 매출 맵 구축
    const teamMonthRevMap = new Map<string, number[]>();

    for (const r of revenueRows) {
      if (!r.dateMonth?.startsWith(`${year}`)) continue;
      const monthIdx = parseInt(r.dateMonth.substring(5, 7)) - 1;
      const team = r.assignedTeam ?? "";
      if (!teamMonthRevMap.has(team)) teamMonthRevMap.set(team, new Array(12).fill(0));
      teamMonthRevMap.get(team)![monthIdx] += r.totalSum;
    }

    // KPI 설정된 팀도 포함 (매출 없어도 KPI 목표가 있으면 표시)
    for (const k of kpiRows) {
      if (k.team && k.team !== "전체" && !teamMonthRevMap.has(k.team)) {
        teamMonthRevMap.set(k.team, new Array(12).fill(0));
      }
    }
    if (teamParam && !teamMonthRevMap.has(teamParam)) {
      teamMonthRevMap.set(teamParam, new Array(12).fill(0));
    }

    const teams = Array.from(teamMonthRevMap.keys()).filter(Boolean) as string[];
    const monthStrs = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);

    const monthly = monthStrs.map((month, idx) => {
      const monthNum = idx + 1;
      const entry: Record<string, string | number> = { month };
      let total = 0;
      let kpiTotal = 0;
      for (const team of teams) {
        const v = teamMonthRevMap.get(team)?.[idx] ?? 0;
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
      yearTotal[team] = (teamMonthRevMap.get(team) ?? []).reduce((s, v) => s + v, 0);
      yearTotal.total += yearTotal[team];
      yearKpi[team]   = kpiRows.filter((k) => k.team === team).reduce((s, k) => s + k.target, 0);
      yearKpi.total  += yearKpi[team];
    }

    const thisMonthNum = new Date().getMonth() + 1;
    const currentMonth: Record<string, number> = { total: 0 };
    const currentKpi:   Record<string, number> = { total: 0 };
    for (const team of teams) {
      currentMonth[team] = teamMonthRevMap.get(team)?.[thisMonthNum - 1] ?? 0;
      currentMonth.total += currentMonth[team];
      const kpi = kpiRows.find((k) => k.month === thisMonthNum && k.team === team);
      currentKpi[team]  = kpi ? kpi.target : 0;
      currentKpi.total += currentKpi[team];
    }
    const kpiAllMonth = kpiRows.find((k) => k.month === thisMonthNum && k.team === "전체");
    if (kpiAllMonth) currentKpi.total = kpiAllMonth.target;

    const prevDate = new Date(year, new Date().getMonth() - 1, 1);
    const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
    const prevMonthIdx = parseInt(prevMonthStr.substring(5, 7)) - 1;
    const prevMonthData: Record<string, number> = { total: 0 };
    for (const team of teams) {
      prevMonthData[team] = teamMonthRevMap.get(team)?.[prevMonthIdx] ?? 0;
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
