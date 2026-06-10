import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projectCosts, projectRevenues, projects } from "@/db/schema";
import { isNotNull, and, sql, eq, inArray } from "drizzle-orm";

// 캠페인 시작일 기준 + 매출 확정 프로젝트의 승인된(isApproved) 매입 집계
export async function GET(req: NextRequest) {
  try {
    const year = parseInt(req.nextUrl.searchParams.get("year") ?? String(new Date().getFullYear()));

    // 매출 확정된 프로젝트 ID (paymentDate가 있는 매출이 존재하는 프로젝트)
    const confirmedProjectIds = db
      .selectDistinct({ projectId: projectRevenues.projectId })
      .from(projectRevenues)
      .where(isNotNull(projectRevenues.paymentDate));

    const rows = await db
      .select({
        month:       sql<string>`TO_CHAR(${projects.startDate}, 'YYYY-MM')`,
        total:       sql<number>`COALESCE(SUM(${projectCosts.total}), 0)`,
        supplyPrice: sql<number>`COALESCE(SUM(${projectCosts.supplyPrice}), 0)`,
        tax:         sql<number>`COALESCE(SUM(${projectCosts.tax}), 0)`,
        count:       sql<number>`COUNT(*)`,
      })
      .from(projectCosts)
      .innerJoin(projects, eq(projects.id, projectCosts.projectId))
      .where(
        and(
          eq(projectCosts.isApproved, true),
          inArray(projectCosts.projectId, confirmedProjectIds),
          sql`EXTRACT(YEAR FROM ${projects.startDate}) = ${year}`
        )
      )
      .groupBy(sql`TO_CHAR(${projects.startDate}, 'YYYY-MM')`);

    const monthly = Array.from({ length: 12 }, (_, i) => ({
      month:       i + 1,
      total:       0,
      supplyPrice: 0,
      tax:         0,
      count:       0,
    }));

    for (const row of rows) {
      const m = parseInt(row.month.substring(5, 7)) - 1;
      monthly[m].total       += Number(row.total);
      monthly[m].supplyPrice += Number(row.supplyPrice);
      monthly[m].tax         += Number(row.tax);
      monthly[m].count       += Number(row.count);
    }

    const yearTotal = monthly.reduce((s, m) => s + m.total, 0);

    return NextResponse.json({ year, monthly, yearTotal });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
