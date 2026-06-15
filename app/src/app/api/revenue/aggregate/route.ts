import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projectRevenues, projects } from "@/db/schema";
import { isNotNull, and, sql, eq, inArray } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const year     = parseInt(req.nextUrl.searchParams.get("year") ?? String(new Date().getFullYear()));
    const criteria = req.nextUrl.searchParams.get("criteria") ?? "캠페인 시작날짜";
    const useInvoice = criteria === "계산서날짜";

    // 1. 입금 확인된 프로젝트별 매출행 합계 (KPI 없을 때 fallback)
    const revSums = await db
      .select({
        projectId:  projectRevenues.projectId,
        totalSum:   sql<number>`COALESCE(SUM(${projectRevenues.total}), 0)`,
        supplySum:  sql<number>`COALESCE(SUM(${projectRevenues.supplyPrice}), 0)`,
        taxSum:     sql<number>`COALESCE(SUM(${projectRevenues.tax}), 0)`,
        refMonth:   sql<string>`TO_CHAR(MAX(${useInvoice ? projectRevenues.invoiceDate : projectRevenues.paymentDate}), 'YYYY-MM')`,
      })
      .from(projectRevenues)
      .where(
        useInvoice
          ? and(isNotNull(projectRevenues.paymentDate), isNotNull(projectRevenues.invoiceDate))
          : isNotNull(projectRevenues.paymentDate)
      )
      .groupBy(projectRevenues.projectId);

    const confirmedIds = revSums.map(r => r.projectId);
    if (!confirmedIds.length) {
      const monthly = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, total: 0, supplyPrice: 0, tax: 0, count: 0 }));
      return NextResponse.json({ year, monthly, yearTotal: 0, yearSupplyPrice: 0 });
    }

    // 2. KPI 데이터 포함한 프로젝트 조회
    const projectData = await db
      .select({
        id:             projects.id,
        startDate:      projects.startDate,
        contractAmount: projects.contractAmount,
        kpiSupply:      projects.kpiSupply,
        kpiTax:         projects.kpiTax,
      })
      .from(projects)
      .where(
        and(
          inArray(projects.id, confirmedIds),
          sql`EXTRACT(YEAR FROM ${projects.startDate}) = ${year}`,
        )
      );

    const revMap = new Map(revSums.map(r => [r.projectId, r]));

    // 3. JS에서 월별 집계
    const monthly = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1, total: 0, supplyPrice: 0, tax: 0, count: 0,
    }));

    for (const p of projectData) {
      const rev   = revMap.get(p.id);
      const month = useInvoice
        ? (rev?.refMonth ? parseInt(rev.refMonth.substring(5, 7)) - 1 : -1)
        : (p.startDate ? parseInt(p.startDate.substring(5, 7)) - 1 : -1);
      if (month < 0 || month > 11) continue;

      const total  = p.contractAmount ?? Number(rev?.totalSum ?? 0);
      const supply = p.kpiSupply      ?? Number(rev?.supplySum ?? 0);
      const tax    = p.kpiTax         ?? Number(rev?.taxSum    ?? 0);

      monthly[month].total       += total;
      monthly[month].supplyPrice += supply;
      monthly[month].tax         += tax;
      monthly[month].count       += 1;
    }

    const yearTotal       = monthly.reduce((s, m) => s + m.total, 0);
    const yearSupplyPrice = monthly.reduce((s, m) => s + m.supplyPrice, 0);

    return NextResponse.json({ year, monthly, yearTotal, yearSupplyPrice });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
