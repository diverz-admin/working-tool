import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectRevenues, projectCosts, clients, annualCosts, internalExpenseRequests } from "@/db/schema";
import { eq, and, gte, lte, isNotNull, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const year     = parseInt(req.nextUrl.searchParams.get("year")  ?? String(new Date().getFullYear()));
    const month    = parseInt(req.nextUrl.searchParams.get("month") ?? String(new Date().getMonth() + 1));
    const criteria = req.nextUrl.searchParams.get("criteria") ?? "캠페인 시작날짜";
    const useBank  = criteria === "통장";

    // 매출 날짜: 통장 → 입금 확인일(paymentDate = 결재확인 승인일), 그 외 → 캠페인 시작일(startDate)
    // 매입 날짜: 통장 → 승인일(purchaseDate),                      그 외 → 계산서 발행일(invoiceDate)
    const revDateField  = useBank ? projectRevenues.paymentDate : projects.startDate;
    const costDateField = useBank ? projectCosts.purchaseDate   : projectCosts.invoiceDate;

    const from = `${year}-${String(month).padStart(2, "0")}-01`;
    const to   = new Date(year, month, 0).toISOString().slice(0, 10);

    // 3 쿼리 병렬 (월간매출 + 월간매입 + 연간SGA)
    const [revData, costData, sgaData] = await Promise.all([
      db.select({
        assignedTeam:   projects.assignedTeam,
        assignedPerson: projects.assignedPerson,
        startDate:      projects.startDate,
        paymentDate:    sql<string>`MAX(${projectRevenues.paymentDate})`,
        contractAmount: projects.contractAmount,
        kpiSupply:      projects.kpiSupply,
        kpiTax:         projects.kpiTax,
        clientName:     clients.companyName,
        totalSum:       sql<number>`COALESCE(SUM(${projectRevenues.total}), 0)`,
        supplySum:      sql<number>`COALESCE(SUM(${projectRevenues.supplyPrice}), 0)`,
        taxSum:         sql<number>`COALESCE(SUM(${projectRevenues.tax}), 0)`,
      })
      .from(projectRevenues)
      .innerJoin(projects, eq(projectRevenues.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(and(
        isNotNull(revDateField),
        gte(revDateField, from),
        lte(revDateField, to),
        // 통장: 결재확인 입금 승인(depositConfirmedAt)된 행만(세금계산서 무관) / 그 외: 입금확인요청(반려 제외) 존재
        useBank
          ? sql`EXISTS (SELECT 1 FROM confirm_requests cr WHERE cr.project_id = ${projectRevenues.projectId} AND cr.row_key = ${projectRevenues.revenueRowId} AND cr.deposit_confirmed_at IS NOT NULL)`
          : sql`EXISTS (SELECT 1 FROM confirm_requests WHERE project_id = ${projects.id} AND status != '반려')`,
      ))
      .groupBy(
        projects.id, projects.assignedTeam, projects.assignedPerson,
        projects.startDate, projects.contractAmount, projects.kpiSupply, projects.kpiTax,
        clients.companyName,
      ),

      db.select({
        id:           projectCosts.id,
        rowNum:       projectCosts.rowNum,
        assignee:     projectCosts.assignee,
        assignedTeam: projects.assignedTeam,
        campaignName: projects.campaignName,
        vendor:       projectCosts.vendor,
        productName:  projectCosts.productName,
        quantity:     projectCosts.quantity,
        supplyPrice:  projectCosts.supplyPrice,
        tax:          projectCosts.tax,
        total:        projectCosts.total,
        startDate:    projects.startDate,
        invoiceDate:  projectCosts.invoiceDate,
        purchaseDate: projectCosts.purchaseDate,
      })
      .from(projectCosts)
      .innerJoin(projects, eq(projectCosts.projectId, projects.id))
      .where(and(
        eq(projectCosts.isApproved, true),
        isNotNull(costDateField),
        gte(costDateField, from),
        lte(costDateField, to),
      ))
      .orderBy(costDateField, projectCosts.rowNum),

      db.select().from(annualCosts).where(eq(annualCosts.year, year)),
    ]);

    const revRows = revData.map(p => ({
      assignedTeam: p.assignedTeam,
      assignee:     p.assignedPerson,
      startDate:    p.startDate,
      invoiceDate:  null as string | null,
      paymentDate:  p.paymentDate ?? null,
      clientName:   p.clientName ?? null,
      // 통장 기준은 실제 입금액(매출 행 합계), 그 외는 계약금 우선
      total:       useBank ? Number(p.totalSum ?? 0)  : (p.contractAmount ?? Number(p.totalSum ?? 0)),
      supplyPrice: useBank ? Number(p.supplySum ?? 0) : (p.kpiSupply      ?? Number(p.supplySum ?? 0)),
      tax:         useBank ? Number(p.taxSum ?? 0)    : (p.kpiTax         ?? Number(p.taxSum    ?? 0)),
    }));

    // ── 승인된 내부지출 → 해당 월 SGA 카테고리별 합산 ──
    let expenseRows: { requestedAt: string | null; amount: number | null; expenseCategory: string | null }[] = [];
    try {
      expenseRows = await db.select({
        requestedAt:     internalExpenseRequests.requestedAt,
        amount:          internalExpenseRequests.amount,
        expenseCategory: internalExpenseRequests.expenseCategory,
      }).from(internalExpenseRequests)
        .where(and(
          eq(internalExpenseRequests.status, "승인"),
          isNotNull(internalExpenseRequests.expenseCategory),
          gte(internalExpenseRequests.requestedAt, from),
          lte(internalExpenseRequests.requestedAt, to),
        ));
    } catch { /* expense_category 컬럼 없으면 무시 */ }

    const baseSgaRows = sgaData.filter(r => r.category !== "직접매입(상품)");
    const sgaMap = new Map(baseSgaRows.map(r => [r.category, { ...r }]));
    for (const r of expenseRows) {
      if (!r.amount || !r.expenseCategory) continue;
      if (sgaMap.has(r.expenseCategory)) {
        sgaMap.get(r.expenseCategory)!.amount += r.amount;
      } else {
        sgaMap.set(r.expenseCategory, { id: "", year, month, category: r.expenseCategory, item: "합계", amount: r.amount, createdAt: new Date(), updatedAt: new Date() });
      }
    }

    return NextResponse.json({
      revRows,
      costRows: costData,
      sgaRows:  Array.from(sgaMap.values()),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
