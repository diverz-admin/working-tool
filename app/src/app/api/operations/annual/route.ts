import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectRevenues, annualCosts, projectCosts } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const year       = parseInt(req.nextUrl.searchParams.get("year") ?? String(new Date().getFullYear()));
    const criteria  = req.nextUrl.searchParams.get("criteria") ?? "캠페인 시작날짜";
    const useSupply = criteria === "공급가";

    // 3 쿼리 병렬 (연간매출 + 수동비용 + 직접매입)
    const [projectData, manualRows, directCostRows] = await Promise.all([
      db.select({
        id:             projects.id,
        assignedTeam:   projects.assignedTeam,
        assignedPerson: projects.assignedPerson,
        startDate:      projects.startDate,
        contractAmount: projects.contractAmount,
        kpiSupply:      projects.kpiSupply,
        totalSum:       sql<number>`COALESCE(SUM(${projectRevenues.total}), 0)`,
        supplySum:      sql<number>`COALESCE(SUM(${projectRevenues.supplyPrice}), 0)`,
      })
      .from(projects)
      .innerJoin(projectRevenues, eq(projectRevenues.projectId, projects.id))
      .where(
        sql`EXTRACT(YEAR FROM ${projects.startDate}) = ${year}`
      )
      .groupBy(projects.id, projects.assignedTeam, projects.assignedPerson, projects.startDate, projects.contractAmount, projects.kpiSupply),

      db.select().from(annualCosts).where(eq(annualCosts.year, year)),

      db.select({ invoiceDate: projectCosts.invoiceDate, purchaseDate: projectCosts.purchaseDate, total: projectCosts.total })
        .from(projectCosts).where(eq(projectCosts.isApproved, true)),
    ]);

    // ── 매출 집계 ──
    const teamMap = new Map<string, Map<string, number[]>>();
    const other   = new Array(12).fill(0);

    for (const p of projectData) {
      const refDate = p.startDate;
      if (!refDate) continue;
      const month  = parseInt(refDate.substring(5, 7)) - 1;
      const amount = useSupply
        ? (p.kpiSupply ?? Number(p.supplySum))
        : (p.contractAmount ?? Number(p.totalSum));
      const team   = p.assignedTeam   ?? "";
      const person = p.assignedPerson ?? "";

      if (!team) { other[month] += amount; continue; }
      if (!teamMap.has(team)) teamMap.set(team, new Map());
      const pMap = teamMap.get(team)!;
      if (!pMap.has(person || "미지정")) pMap.set(person || "미지정", new Array(12).fill(0));
      pMap.get(person || "미지정")![month] += amount;
    }

    const TEAM_ORDER = ["영업 1팀", "영업 2팀"];
    const teams = Array.from(teamMap.entries())
      .sort(([a], [b]) => {
        const ia = TEAM_ORDER.indexOf(a), ib = TEAM_ORDER.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      })
      .map(([team, pMap]) => ({
        team,
        persons: Array.from(pMap.entries()).map(([person, monthly]) => ({ person, monthly })),
      }));

    // ── 비용 집계 ──
    const filtered     = manualRows.filter(r => r.category !== "직접매입(상품)");
    const directMonthly = new Array(12).fill(0);
    for (const r of directCostRows) {
      const dateStr = r.invoiceDate ?? r.purchaseDate;
      if (!dateStr) continue;
      if (parseInt(dateStr.substring(0, 4)) !== year) continue;
      directMonthly[parseInt(dateStr.substring(5, 7)) - 1] += r.total ?? 0;
    }
    const directRows = directMonthly
      .map((amount, i) => ({ year, month: i + 1, category: "직접매입(상품)", item: "합계", amount }))
      .filter(r => r.amount > 0);

    return NextResponse.json({ teams, other, costs: [...filtered, ...directRows] });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
