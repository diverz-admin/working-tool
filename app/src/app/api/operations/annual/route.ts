import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectRevenues, annualCosts, projectCosts } from "@/db/schema";
import { addApprovedExpenses, type CostCell } from "@/lib/expense-costs";
import { eq, and, sql } from "drizzle-orm";
import { TEAM_ORDER } from "@/lib/teams";
import { isRevenueConfirmed, fetchConfirmRevenue } from "@/lib/revenue-stats";

export async function GET(req: NextRequest) {
  try {
    const year       = parseInt(req.nextUrl.searchParams.get("year") ?? String(new Date().getFullYear()));
    const criteria  = req.nextUrl.searchParams.get("criteria") ?? "캠페인 시작날짜";
    const useBank    = criteria === "통장";
    const useInvoice = criteria === "계산서날짜";

    // 3 쿼리 병렬 (연간매출 + 수동비용 + 직접매입)
    const [projectData, manualRows, directCostRows] = await Promise.all([
      db.select({
        id:             projects.id,
        assignedTeam:   projects.assignedTeam,
        assignedPerson: projects.assignedPerson,
        startDate:      projects.startDate,
        kpiSupply:      projects.kpiSupply,
        supplySum:      sql<number>`COALESCE(SUM(${projectRevenues.supplyPrice}), 0)`,
      })
      .from(projects)
      .leftJoin(projectRevenues, eq(projectRevenues.projectId, projects.id))
      .where(and(sql`EXTRACT(YEAR FROM ${projects.startDate}) = ${year}`, isRevenueConfirmed(projects.id)))
      .groupBy(projects.id, projects.assignedTeam, projects.assignedPerson, projects.startDate, projects.kpiSupply),

      db.select().from(annualCosts).where(eq(annualCosts.year, year)),

      db.select({ invoiceDate: projectCosts.invoiceDate, purchaseDate: projectCosts.purchaseDate, workStartDate: projectCosts.workStartDate, supplyPrice: projectCosts.supplyPrice })
        .from(projectCosts).where(eq(projectCosts.isApproved, true)),
    ]);

    // 통장·계산서 기준: 결재확인 요청의 입금확인일·계산서 발행일과 요청 금액 — @/lib/revenue-stats 참고
    const confirmRevRows = useBank || useInvoice
      ? await fetchConfirmRevenue(useInvoice ? "invoice" : "deposit", `${year}-01-01`, `${year}-12-31`)
      : [];

    // ── 매출 집계 ──
    const teamMap = new Map<string, Map<string, number[]>>();
    const other   = new Array(12).fill(0);

    // 금액은 항상 공급가 기준.
    // 통장·계산서(실적 기준): 결재확인 요청 공급가를 입금 확인일·발행일 월에 귀속
    // 캠페인 시작일(수주 기준): 입금확인요청이 확인완료된 프로젝트의 계약 공급가를 시작일 월에 귀속
    const revEntries = useBank || useInvoice
      ? confirmRevRows.map(r => {
          const d = useInvoice ? r.invoiceDate : r.paymentDate;
          return {
            month:  d ? parseInt(d.substring(5, 7)) - 1 : -1,
            amount: r.supplyPrice,
            team:   r.assignedTeam   ?? "",
            person: r.assignedPerson ?? "",
          };
        })
      : projectData.map(p => ({
          month:  p.startDate ? parseInt(p.startDate.substring(5, 7)) - 1 : -1,
          amount: p.kpiSupply ?? Number(p.supplySum),
          team:   p.assignedTeam   ?? "",
          person: p.assignedPerson ?? "",
        }));

    for (const e of revEntries) {
      if (e.month < 0) continue;
      const { month, amount, team, person } = e;
      if (!team) { other[month] += amount; continue; }
      if (!teamMap.has(team)) teamMap.set(team, new Map());
      const pMap = teamMap.get(team)!;
      if (!pMap.has(person || "미지정")) pMap.set(person || "미지정", new Array(12).fill(0));
      pMap.get(person || "미지정")![month] += amount;
    }

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
      // 통장·계산서: 확인일(purchaseDate) / 그 외(캠페인 시작·공급가): 작업시작일(workStartDate)
      const dateStr = (useBank || useInvoice) ? r.purchaseDate : r.workStartDate;
      if (!dateStr) continue;
      if (parseInt(dateStr.substring(0, 4)) !== year) continue;
      directMonthly[parseInt(dateStr.substring(5, 7)) - 1] += r.supplyPrice ?? 0;
    }
    const directRows = directMonthly
      .map((amount, i) => ({ year, month: i + 1, category: "직접매입(상품)", item: "합계", amount }))
      .filter(r => r.amount > 0);

    // ── 승인된 내부지출 → SGA 카테고리별 합산 ──
    const allCosts: CostCell[] = [...filtered, ...directRows];
    await addApprovedExpenses(allCosts, year);

    return NextResponse.json({ teams, other, costs: allCosts });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
