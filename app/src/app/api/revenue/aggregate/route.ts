import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projectRevenues, projects } from "@/db/schema";
import { isNotNull, and, sql, eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const year     = parseInt(req.nextUrl.searchParams.get("year") ?? String(new Date().getFullYear()));
    const criteria = req.nextUrl.searchParams.get("criteria") ?? "캠페인 시작날짜";
    const useInvoice = criteria === "계산서날짜";

    const monthExpr = useInvoice
      ? sql<string>`TO_CHAR(${projectRevenues.invoiceDate}, 'YYYY-MM')`
      : sql<string>`TO_CHAR(${projects.startDate}, 'YYYY-MM')`;

    const whereClause = useInvoice
      ? and(
          isNotNull(projectRevenues.paymentDate),
          isNotNull(projectRevenues.invoiceDate),
          sql`EXTRACT(YEAR FROM ${projectRevenues.invoiceDate}) = ${year}`,
        )
      : and(
          isNotNull(projectRevenues.paymentDate),
          sql`EXTRACT(YEAR FROM ${projects.startDate}) = ${year}`,
        );

    const rows = await db
      .select({
        month:       monthExpr,
        total:       sql<number>`COALESCE(SUM(${projectRevenues.total}), 0)`,
        supplyPrice: sql<number>`COALESCE(SUM(${projectRevenues.supplyPrice}), 0)`,
        tax:         sql<number>`COALESCE(SUM(${projectRevenues.tax}), 0)`,
        count:       sql<number>`COUNT(*)`,
      })
      .from(projectRevenues)
      .innerJoin(projects, eq(projects.id, projectRevenues.projectId))
      .where(whereClause)
      .groupBy(monthExpr);

    const monthly = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1, total: 0, supplyPrice: 0, tax: 0, count: 0,
    }));

    for (const row of rows) {
      const m = parseInt(row.month.substring(5, 7)) - 1;
      monthly[m].total       += Number(row.total);
      monthly[m].supplyPrice += Number(row.supplyPrice);
      monthly[m].tax         += Number(row.tax);
      monthly[m].count       += Number(row.count);
    }

    const yearTotal       = monthly.reduce((s, m) => s + m.total, 0);
    const yearSupplyPrice = monthly.reduce((s, m) => s + m.supplyPrice, 0);

    return NextResponse.json({ year, monthly, yearTotal, yearSupplyPrice });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
