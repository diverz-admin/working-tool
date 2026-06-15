import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectRevenues, projectCosts, annualCosts } from "@/db/schema";
import { eq, and, gte, lte, isNotNull, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const year  = parseInt(req.nextUrl.searchParams.get("year")  ?? String(new Date().getFullYear()));
    const month = parseInt(req.nextUrl.searchParams.get("month") ?? String(new Date().getMonth() + 1));

    const from = `${year}-${String(month).padStart(2, "0")}-01`;
    const to   = new Date(year, month, 0).toISOString().slice(0, 10);

    // 5 쿼리 완전 병렬 (기존 4 cold start → 1 cold start)
    const [annualProjectData, annualManualRows, annualDirectCostRows, monthRevData, monthCostData] = await Promise.all([
      // 1. 연간매출 (캠페인 시작날짜 기준)
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
      .where(and(
        isNotNull(projectRevenues.paymentDate),
        sql`EXTRACT(YEAR FROM ${projects.startDate}) = ${year}`,
      ))
      .groupBy(projects.id, projects.assignedTeam, projects.assignedPerson, projects.startDate, projects.contractAmount, projects.kpiSupply),

      // 2. 연간 수동 비용
      db.select().from(annualCosts).where(eq(annualCosts.year, year)),

      // 3. 연간 직접매입 (승인된 매입)
      db.select({ invoiceDate: projectCosts.invoiceDate, purchaseDate: projectCosts.purchaseDate, total: projectCosts.total })
        .from(projectCosts).where(eq(projectCosts.isApproved, true)),

      // 4. 월간 매출 요약 (캠페인 시작날짜 기준)
      db.select({
        assignedTeam:   projects.assignedTeam,
        contractAmount: projects.contractAmount,
        kpiSupply:      projects.kpiSupply,
        kpiTax:         projects.kpiTax,
        totalSum:       sql<number>`COALESCE(SUM(${projectRevenues.total}), 0)`,
        supplySum:      sql<number>`COALESCE(SUM(${projectRevenues.supplyPrice}), 0)`,
        taxSum:         sql<number>`COALESCE(SUM(${projectRevenues.tax}), 0)`,
      })
      .from(projectRevenues)
      .innerJoin(projects, eq(projectRevenues.projectId, projects.id))
      .where(and(
        isNotNull(projectRevenues.paymentDate),
        isNotNull(projects.startDate),
        gte(projects.startDate, from),
        lte(projects.startDate, to),
      ))
      .groupBy(projects.id, projects.assignedTeam, projects.contractAmount, projects.kpiSupply, projects.kpiTax),

      // 5. 월간 매입 요약 (계산서날짜 기준)
      db.select({
        id:           projectCosts.id,
        assignedTeam: projects.assignedTeam,
        total:        projectCosts.total,
        supplyPrice:  projectCosts.supplyPrice,
      })
      .from(projectCosts)
      .innerJoin(projects, eq(projectCosts.projectId, projects.id))
      .where(and(
        eq(projectCosts.isApproved, true),
        isNotNull(projectCosts.invoiceDate),
        gte(projectCosts.invoiceDate, from),
        lte(projectCosts.invoiceDate, to),
      )),
    ]);

    // ── 연간 매출 팀별 집계 ──
    const teamMap = new Map<string, Map<string, number[]>>();
    const other   = new Array(12).fill(0);
    for (const p of annualProjectData) {
      const refDate = p.startDate;
      if (!refDate) continue;
      const m      = parseInt(refDate.substring(5, 7)) - 1;
      const amount = p.contractAmount ?? Number(p.totalSum);
      const team   = p.assignedTeam   ?? "";
      const person = p.assignedPerson ?? "";
      if (!team) { other[m] += amount; continue; }
      if (!teamMap.has(team)) teamMap.set(team, new Map());
      const pMap = teamMap.get(team)!;
      if (!pMap.has(person || "미지정")) pMap.set(person || "미지정", new Array(12).fill(0));
      pMap.get(person || "미지정")![m] += amount;
    }
    const TEAM_ORDER = ["영업 1팀", "영업 2팀"];
    const annualTeams = Array.from(teamMap.entries())
      .sort(([a], [b]) => {
        const ia = TEAM_ORDER.indexOf(a), ib = TEAM_ORDER.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      })
      .map(([team, pMap]) => ({
        team,
        persons: Array.from(pMap.entries()).map(([person, monthly]) => ({ person, monthly })),
      }));

    // ── 연간 비용 집계 ──
    const filtered      = annualManualRows.filter(r => r.category !== "직접매입(상품)");
    const directMonthly = new Array(12).fill(0);
    for (const r of annualDirectCostRows) {
      const dateStr = r.invoiceDate ?? r.purchaseDate;
      if (!dateStr) continue;
      if (parseInt(dateStr.substring(0, 4)) !== year) continue;
      directMonthly[parseInt(dateStr.substring(5, 7)) - 1] += r.total ?? 0;
    }
    const directRows = directMonthly
      .map((amount, i) => ({ year, month: i + 1, category: "직접매입(상품)", item: "합계", amount }))
      .filter(r => r.amount > 0);
    const annualCostsResult = [...filtered, ...directRows];

    // ── 월간 매출 rows ──
    const monthRevRows = monthRevData.map(p => ({
      assignedTeam: p.assignedTeam,
      total:       p.contractAmount ?? Number(p.totalSum ?? 0),
      supplyPrice: p.kpiSupply      ?? Number(p.supplySum ?? 0),
      tax:         p.kpiTax         ?? Number(p.taxSum    ?? 0),
    }));

    return NextResponse.json({
      annualTeams,
      annualOther:  other,
      annualCosts:  annualCostsResult,
      monthRevRows,
      monthCostRows: monthCostData,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
