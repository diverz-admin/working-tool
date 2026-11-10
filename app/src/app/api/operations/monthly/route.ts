import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectRevenues, projectCosts, clients, annualCosts } from "@/db/schema";
import { addApprovedExpenses, type CostCell } from "@/lib/expense-costs";
import { eq, and, gte, lte, isNotNull, sql } from "drizzle-orm";
import { monthRange } from "@/lib/month-range";
import { isRevenueConfirmed } from "@/lib/revenue-stats";

const REV_FIELDS = {
  projectId:      projects.id,
  campaignName:   projects.campaignName,
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
  projects.id, projects.campaignName, projects.assignedTeam, projects.assignedPerson, projects.startDate,
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
    // 매입 날짜: 통장·계산서 → 확인일(purchaseDate, 결재 승인일), 그 외(캠페인 시작) → 작업시작일(workStartDate)
    const revDateField  = useBank ? projectRevenues.paymentDate
                        : useInvoice ? projectRevenues.invoiceDate
                        : projects.startDate;
    const costDateField = (useBank || useInvoice) ? projectCosts.purchaseDate   // 매입은 계산서 기준도 확인일(승인일)
                        : projectCosts.workStartDate;

    const { from, to } = monthRange(year, month);

    // 3 쿼리 병렬 (월간매출 + 월간매입 + 연간SGA)
    const [revData, costData, sgaData] = await Promise.all([
      // 수주 기준: 그 달에 시작해 입금확인요청이 확인완료된 프로젝트 (매출 행이 아직 없어도 포함) → LEFT JOIN
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
              isRevenueConfirmed(projects.id),
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
        projectPerson: projects.assignedPerson,
        projectId:    projects.id,
        campaignName: projects.campaignName,
        clientName:   clients.companyName,
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
      .leftJoin(clients, eq(projects.clientId, clients.id))
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
      id:           p.projectId,
      projectId:    p.projectId,
      campaignName: p.campaignName,
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

    // ── 이번 달 판관비 (수동 입력) + 승인된 내부지출 ──
    // annualCosts는 연 단위로 가져오므로 반드시 이번 달만 남긴다 — 카테고리만으로 묶으면 다른 달 값이 섞인다
    const sgaRows: CostCell[] = sgaData
      .filter(r => r.month === month && r.category !== "직접매입(상품)")
      .map(r => ({ year: r.year, month: r.month, category: r.category, item: r.item, amount: r.amount }));
    await addApprovedExpenses(sgaRows, year, { from, to });

    return NextResponse.json({
      revRows,
      costRows: costData,
      sgaRows,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
