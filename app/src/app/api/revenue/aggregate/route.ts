import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projectRevenues, projects } from "@/db/schema";
import { isNotNull, and, sql, eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const year      = parseInt(req.nextUrl.searchParams.get("year") ?? String(new Date().getFullYear()));
    const criteria  = req.nextUrl.searchParams.get("criteria") ?? "캠페인 시작날짜";
    const useInvoice = criteria === "계산서날짜";

    // 단일 쿼리: 확인된 프로젝트 + KPI + revenue 합계
    const projectData = await db
      .select({
        id:             projects.id,
        startDate:      projects.startDate,
        contractAmount: projects.contractAmount,
        kpiSupply:      projects.kpiSupply,
        kpiTax:         projects.kpiTax,
        totalSum:       sql<number>`COALESCE(SUM(${projectRevenues.total}), 0)`,
        supplySum:      sql<number>`COALESCE(SUM(${projectRevenues.supplyPrice}), 0)`,
        taxSum:         sql<number>`COALESCE(SUM(${projectRevenues.tax}), 0)`,
        refMonth:       sql<string>`TO_CHAR(MAX(${projectRevenues.invoiceDate}), 'YYYY-MM')`,
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
      .groupBy(
        projects.id,
        projects.startDate,
        projects.contractAmount,
        projects.kpiSupply,
        projects.kpiTax,
      );

    if (!projectData.length) {
      const monthly = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, total: 0, supplyPrice: 0, tax: 0, count: 0 }));
      return NextResponse.json({ year, monthly, yearTotal: 0, yearSupplyPrice: 0 });
    }

    const monthly = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1, total: 0, supplyPrice: 0, tax: 0, count: 0,
    }));

    for (const p of projectData) {
      const month = useInvoice
        ? (p.refMonth ? parseInt(p.refMonth.substring(5, 7)) - 1 : -1)
        : (p.startDate ? parseInt(p.startDate.substring(5, 7)) - 1 : -1);
      if (month < 0 || month > 11) continue;

      monthly[month].total       += p.contractAmount ?? Number(p.totalSum ?? 0);
      monthly[month].supplyPrice += p.kpiSupply      ?? Number(p.supplySum ?? 0);
      monthly[month].tax         += p.kpiTax         ?? Number(p.taxSum    ?? 0);
      monthly[month].count       += 1;
    }

    const yearTotal       = monthly.reduce((s, m) => s + m.total, 0);
    const yearSupplyPrice = monthly.reduce((s, m) => s + m.supplyPrice, 0);

    return NextResponse.json({ year, monthly, yearTotal, yearSupplyPrice });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
