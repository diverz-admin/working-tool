import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectRevenues, annualCosts, projectCosts, internalExpenseRequests } from "@/db/schema";
import { eq, and, isNotNull, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const year       = parseInt(req.nextUrl.searchParams.get("year") ?? String(new Date().getFullYear()));
    const criteria  = req.nextUrl.searchParams.get("criteria") ?? "캠페인 시작날짜";
    const useSupply  = criteria === "공급가";
    const useBank    = criteria === "통장";
    const useInvoice = criteria === "계산서날짜";

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
      .where(and(
        sql`EXTRACT(YEAR FROM ${projects.startDate}) = ${year}`,
        sql`EXISTS (SELECT 1 FROM confirm_requests WHERE project_id = ${projects.id} AND status != '반려')`,
      ))
      .groupBy(projects.id, projects.assignedTeam, projects.assignedPerson, projects.startDate, projects.contractAmount, projects.kpiSupply),

      db.select().from(annualCosts).where(eq(annualCosts.year, year)),

      db.select({ invoiceDate: projectCosts.invoiceDate, purchaseDate: projectCosts.purchaseDate, total: projectCosts.total })
        .from(projectCosts).where(eq(projectCosts.isApproved, true)),
    ]);

    // 통장 기준: 입금 확인일(paymentDate)이 기록된 매출 행 — 결재확인 입금 승인 시 행에 직접 기록됨 (세금계산서 무관)
    const bankRevRows = useBank
      ? await db.select({
          assignedTeam:   projects.assignedTeam,
          assignedPerson: projects.assignedPerson,
          paymentDate:    projectRevenues.paymentDate,
          total:          projectRevenues.total,
        })
        .from(projectRevenues)
        .innerJoin(projects, eq(projects.id, projectRevenues.projectId))
        .where(and(
          isNotNull(projectRevenues.paymentDate),
          sql`EXTRACT(YEAR FROM ${projectRevenues.paymentDate}) = ${year}`,
        ))
      : [];

    // 계산서 기준: 계산서 발행일(invoiceDate)이 기록된 매출 행 — 결재확인 발행완료 시 행에 직접 기록됨 (입금 무관)
    const invoiceRevRows = useInvoice
      ? await db.select({
          assignedTeam:   projects.assignedTeam,
          assignedPerson: projects.assignedPerson,
          invoiceDate:    projectRevenues.invoiceDate,
          total:          projectRevenues.total,
        })
        .from(projectRevenues)
        .innerJoin(projects, eq(projects.id, projectRevenues.projectId))
        .where(and(
          isNotNull(projectRevenues.invoiceDate),
          sql`EXTRACT(YEAR FROM ${projectRevenues.invoiceDate}) = ${year}`,
        ))
      : [];

    // ── 매출 집계 ──
    const teamMap = new Map<string, Map<string, number[]>>();
    const other   = new Array(12).fill(0);

    // 통장: 입금 확인일·실제 입금액 / 계산서: 발행일·실제 매출 / 그 외: 캠페인 시작일·계약금(또는 공급가)
    const revEntries = useBank
      ? bankRevRows.map(r => ({
          month:  r.paymentDate ? parseInt(r.paymentDate.substring(5, 7)) - 1 : -1,
          amount: r.total ?? 0,
          team:   r.assignedTeam   ?? "",
          person: r.assignedPerson ?? "",
        }))
      : useInvoice
      ? invoiceRevRows.map(r => ({
          month:  r.invoiceDate ? parseInt(r.invoiceDate.substring(5, 7)) - 1 : -1,
          amount: r.total ?? 0,
          team:   r.assignedTeam   ?? "",
          person: r.assignedPerson ?? "",
        }))
      : projectData.map(p => ({
          month:  p.startDate ? parseInt(p.startDate.substring(5, 7)) - 1 : -1,
          amount: useSupply ? (p.kpiSupply ?? Number(p.supplySum)) : (p.contractAmount ?? Number(p.totalSum)),
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

    const TEAM_ORDER = ["경영", "영업 1팀", "영업 2팀"];
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
      // 통장 기준: 승인일(purchaseDate) / 그 외: 계산서 발행일(invoiceDate, 없으면 매입일)
      const dateStr = useBank ? r.purchaseDate : (r.invoiceDate ?? r.purchaseDate);
      if (!dateStr) continue;
      if (parseInt(dateStr.substring(0, 4)) !== year) continue;
      directMonthly[parseInt(dateStr.substring(5, 7)) - 1] += r.total ?? 0;
    }
    const directRows = directMonthly
      .map((amount, i) => ({ year, month: i + 1, category: "직접매입(상품)", item: "합계", amount }))
      .filter(r => r.amount > 0);

    // ── 승인된 내부지출 → SGA 카테고리별 합산 ──
    let expenseRows: { requestedAt: string | null; amount: number | null; expenseCategory: string | null }[] = [];
    try {
      expenseRows = await db.select({
        requestedAt:     internalExpenseRequests.requestedAt,
        amount:          internalExpenseRequests.amount,
        expenseCategory: internalExpenseRequests.expenseCategory,
      }).from(internalExpenseRequests)
        .where(and(eq(internalExpenseRequests.status, "승인"), isNotNull(internalExpenseRequests.expenseCategory)));
    } catch { /* expense_category 컬럼 없으면 무시 */ }

    const allCosts = [...filtered, ...directRows];
    for (const r of expenseRows) {
      if (!r.requestedAt || !r.amount || !r.expenseCategory) continue;
      if (parseInt(r.requestedAt.substring(0, 4)) !== year) continue;
      const month = parseInt(r.requestedAt.substring(5, 7));
      const existing = allCosts.find(c => c.category === r.expenseCategory && c.month === month && c.item === "합계");
      if (existing) {
        existing.amount += r.amount;
      } else {
        allCosts.push({ year, month, category: r.expenseCategory, item: "합계", amount: r.amount });
      }
    }

    return NextResponse.json({ teams, other, costs: allCosts });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
