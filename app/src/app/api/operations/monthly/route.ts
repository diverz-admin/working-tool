import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectRevenues, projectCosts, clients, annualCosts, internalExpenseRequests } from "@/db/schema";
import { eq, and, gte, lte, isNotNull, sql } from "drizzle-orm";
import { monthRange } from "@/lib/month-range";

const REV_FIELDS = {
  assignedTeam:   projects.assignedTeam,
  assignedPerson: projects.assignedPerson,
  startDate:      projects.startDate,
  contractAmount: projects.contractAmount,
  kpiSupply:      projects.kpiSupply,
  kpiTax:         projects.kpiTax,
  clientName:     clients.companyName,
  paymentDate:    sql<string>`MAX(${projectRevenues.paymentDate})`,
  invoiceDate:    sql<string>`MAX(${projectRevenues.invoiceDate})`,
  totalSum:       sql<number>`COALESCE(SUM(${projectRevenues.total}), 0)`,
  supplySum:      sql<number>`COALESCE(SUM(${projectRevenues.supplyPrice}), 0)`,
  taxSum:         sql<number>`COALESCE(SUM(${projectRevenues.tax}), 0)`,
} as const;

const REV_GROUP_BY = [
  projects.id, projects.assignedTeam, projects.assignedPerson, projects.startDate,
  projects.contractAmount, projects.kpiSupply, projects.kpiTax, clients.companyName,
] as const;

export async function GET(req: NextRequest) {
  try {
    const year     = parseInt(req.nextUrl.searchParams.get("year")  ?? String(new Date().getFullYear()));
    const month    = parseInt(req.nextUrl.searchParams.get("month") ?? String(new Date().getMonth() + 1));
    const criteria   = req.nextUrl.searchParams.get("criteria") ?? "캠페인 시작날짜";
    const useBank    = criteria === "통장";
    const useInvoice = criteria === "계산서날짜";
    // 캠페인 시작날짜 = 수주 기준(계약 공급가) / 나머지 = 실적 기준(실제 매출 행)
    const useContract = !useBank && !useInvoice;

    // 매출 날짜: 통장 → 입금 확인일(paymentDate), 계산서 → 발행일(invoiceDate), 그 외 → 캠페인 시작일(startDate)
    // 매입 날짜: 통장 → 승인일(purchaseDate), 계산서 → 발행일(invoiceDate), 그 외(캠페인 시작) → 작업시작일(workStartDate)
    const revDateField  = useBank ? projectRevenues.paymentDate
                        : useInvoice ? projectRevenues.invoiceDate
                        : projects.startDate;
    const costDateField = useBank ? projectCosts.purchaseDate
                        : useInvoice ? projectCosts.invoiceDate
                        : projectCosts.workStartDate;

    const { from, to } = monthRange(year, month);

    // 3 쿼리 병렬 (월간매출 + 월간매입 + 연간SGA)
    const [revData, costData, sgaData] = await Promise.all([
      // 수주 기준: 그 달에 시작한 모든 프로젝트 (매출 행이 아직 없어도 포함) → LEFT JOIN
      // 실적 기준: 그 달 날짜가 기록된 매출 행이 있는 프로젝트만          → INNER JOIN
      (useContract
        ? db.select(REV_FIELDS)
            .from(projects)
            .leftJoin(projectRevenues, eq(projectRevenues.projectId, projects.id))
            .leftJoin(clients, eq(projects.clientId, clients.id))
            .where(and(
              isNotNull(revDateField),
              gte(revDateField, from),
              lte(revDateField, to),
            ))
            .groupBy(...REV_GROUP_BY)
        : db.select(REV_FIELDS)
            .from(projectRevenues)
            .innerJoin(projects, eq(projectRevenues.projectId, projects.id))
            .leftJoin(clients, eq(projects.clientId, clients.id))
            .where(and(
              isNotNull(revDateField),
              gte(revDateField, from),
              lte(revDateField, to),
            ))
            .groupBy(...REV_GROUP_BY)),

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
        workStartDate: projectCosts.workStartDate,
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
      invoiceDate:  p.invoiceDate ?? null,
      paymentDate:  p.paymentDate ?? null,
      clientName:   p.clientName ?? null,
      // 수주 기준은 계약 금액(비어 있을 때만 매출 행으로 대체), 실적 기준은 실제 매출 행 금액
      total:       useContract ? (p.contractAmount ?? Number(p.totalSum  ?? 0)) : Number(p.totalSum  ?? 0),
      supplyPrice: useContract ? (p.kpiSupply      ?? Number(p.supplySum ?? 0)) : Number(p.supplySum ?? 0),
      tax:         useContract ? (p.kpiTax         ?? Number(p.taxSum    ?? 0)) : Number(p.taxSum    ?? 0),
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
