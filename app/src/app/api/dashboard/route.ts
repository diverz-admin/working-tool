import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, notices } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { fetchRevenueStats, fetchCostStats, toMonthlyBuckets, parseCriteria } from "@/lib/revenue-stats";

export async function GET(req: NextRequest) {
  try {
    const year     = parseInt(req.nextUrl.searchParams.get("year") ?? String(new Date().getFullYear()));
    const criteria = parseCriteria(req.nextUrl.searchParams.get("criteria"));

    // 매출·매입은 프로젝트관리(/api/stats/revenue)와 동일한 집계를 공유한다 (@/lib/revenue-stats)
    const [revRows, costRows, projectRows, noticeRows] = await Promise.all([
      fetchRevenueStats(year, criteria),
      fetchCostStats(year, criteria),

      // 진행 중 캠페인 (대시보드에 필요한 최소 필드만)
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

      // 고정 공지
      db.select()
        .from(notices)
        .where(and(eq(notices.isPinned, true), eq(notices.isActive, true)))
        .orderBy(desc(notices.priority), desc(notices.createdAt)),
    ]);

    const { revenue: monthly, cost: costMonthly } = toMonthlyBuckets(revRows, costRows);

    const yearTotal       = monthly.reduce((s, m) => s + m.total, 0);
    const yearSupplyPrice = monthly.reduce((s, m) => s + m.supplyPrice, 0);
    const costYearTotal   = costMonthly.reduce((s, m) => s + m.total, 0);

    return NextResponse.json({
      agg:      { year, criteria, monthly, yearTotal, yearSupplyPrice },
      costAgg:  { monthly: costMonthly, yearTotal: costYearTotal },
      projects: projectRows,
      notices:  noticeRows,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
