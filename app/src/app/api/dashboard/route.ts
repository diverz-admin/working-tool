import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectRevenues, projectCosts, notices } from "@/db/schema";
import { eq, and, isNotNull, sql, desc, inArray, gte, lte } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const year     = parseInt(req.nextUrl.searchParams.get("year")     ?? String(new Date().getFullYear()));
    const criteria = req.nextUrl.searchParams.get("criteria")          ?? "캠페인 시작날짜";
    const useInvoice = criteria === "계산서날짜";

    const startOfYear = `${year}-01-01`;
    const endOfYear = `${year}-12-31`;

    // 4개 쿼리 완전 병렬 실행 (1 cold start, 1 DB connection)
    const [projectRows, revRows, costRows, noticeRows] = await Promise.all([
      // 1. 진행 중 캠페인 (대시보드에 필요한 최소 필드만)
      db.select({
        id:             projects.id,
        campaignName:   projects.campaignName,
        advertiser:     projects.advertiser,
        assignedPerson: projects.assignedPerson,
        startDate:      projects.startDate,
        endDate:        projects.endDate,
        status:         projects.status,
        contractAmount: projects.contractAmount,
        projectGroupId: projects.projectGroupId,
      })
      .from(projects)
      .where(eq(projects.status, "진행"))
      .orderBy(desc(projects.createdAt)),

      // 2. 매출 집계 (KPI 우선, revenue row 합계 fallback)
      db.select({
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
              gte(projects.startDate, startOfYear),
              lte(projects.startDate, endOfYear)
            )
          : and(
              isNotNull(projectRevenues.paymentDate),
              gte(projects.startDate, startOfYear),
              lte(projects.startDate, endOfYear)
            )
      )
      .groupBy(projects.id, projects.startDate, projects.contractAmount, projects.kpiSupply, projects.kpiTax),

      // 3. 매입 집계 (승인된 매입, 확정 프로젝트 기준)
      db.select({
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
          inArray(
            projectCosts.projectId,
            db.select({ projectId: projectRevenues.projectId })
              .from(projectRevenues)
              .innerJoin(projects, eq(projects.id, projectRevenues.projectId))
              .where(
                and(
                  isNotNull(projectRevenues.paymentDate),
                  gte(projects.startDate, startOfYear),
                  lte(projects.startDate, endOfYear)
                )
              )
          ),
          gte(projects.startDate, startOfYear),
          lte(projects.startDate, endOfYear)
        )
      )
      .groupBy(sql`TO_CHAR(${projects.startDate}, 'YYYY-MM')`),

      // 4. 고정 공지
      db.select()
        .from(notices)
        .where(and(eq(notices.isPinned, true), eq(notices.isActive, true)))
        .orderBy(desc(notices.priority), desc(notices.createdAt)),
    ]);

    // ── 매출 월별 집계 ─────────────────────────────────────
    const monthly = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1, total: 0, supplyPrice: 0, tax: 0, count: 0,
    }));

    for (const p of revRows) {
      const mIdx = useInvoice
        ? (p.refMonth ? parseInt(p.refMonth.substring(5, 7)) - 1 : -1)
        : (p.startDate ? parseInt(p.startDate.substring(5, 7)) - 1 : -1);
      if (mIdx < 0 || mIdx > 11) continue;
      monthly[mIdx].total       += p.contractAmount ?? Number(p.totalSum ?? 0);
      monthly[mIdx].supplyPrice += p.kpiSupply      ?? Number(p.supplySum ?? 0);
      monthly[mIdx].tax         += p.kpiTax         ?? Number(p.taxSum    ?? 0);
      monthly[mIdx].count       += 1;
    }
    const yearTotal       = monthly.reduce((s, m) => s + m.total, 0);
    const yearSupplyPrice = monthly.reduce((s, m) => s + m.supplyPrice, 0);

    // ── 매입 월별 집계 ─────────────────────────────────────
    const costMonthly = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1, total: 0, supplyPrice: 0, tax: 0, count: 0,
    }));
    for (const row of costRows) {
      const m = parseInt(row.month.substring(5, 7)) - 1;
      costMonthly[m].total       += Number(row.total);
      costMonthly[m].supplyPrice += Number(row.supplyPrice);
      costMonthly[m].tax         += Number(row.tax);
      costMonthly[m].count       += Number(row.count);
    }
    const costYearTotal = costMonthly.reduce((s, m) => s + m.total, 0);

    return NextResponse.json({
      agg:      { year, monthly, yearTotal, yearSupplyPrice },
      costAgg:  { monthly: costMonthly, yearTotal: costYearTotal },
      projects: projectRows,
      notices:  noticeRows,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
