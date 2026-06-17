import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  projectGroups, projects, projectRevenues, projectCosts,
  confirmRequests, paymentRequests,
} from "@/db/schema";
import { eq, count, sql, max, desc, and, or, isNull } from "drizzle-orm";

function daysRemaining(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000);
}

export async function GET() {
  try {
    // ── 11개 쿼리 병렬 (stats/revenue는 클라이언트에서 별도 fetch로 분리)
    const [
      groupRows,
      workEndRows, revTotal, revStats, costTotal, costStats,
      allCampaigns, campCostTotal, campRevStats, campCostStats,
      workIncompleteResult,
    ] = await Promise.all([

      // 1. 그룹 + 캠페인 카운트
      db.select({
        id:             projectGroups.id,
        name:           projectGroups.name,
        clientId:       projectGroups.clientId,
        assignedTeam:   projectGroups.assignedTeam,
        assignedPerson: projectGroups.assignedPerson,
        status:         projectGroups.status,
        notes:          projectGroups.notes,
        createdAt:      projectGroups.createdAt,
        updatedAt:      projectGroups.updatedAt,
        campaignCount:        count(projects.id),
        activeCampaignCount:  sql<number>`COUNT(*) FILTER (WHERE ${projects.status} = '진행')`,
        activeProjectType:    sql<string | null>`MAX(${projects.projectType}) FILTER (WHERE ${projects.status} = '진행')`,
        activeProduct:        sql<string | null>`MAX(${projects.product}) FILTER (WHERE ${projects.status} = '진행')`,
        activeStartDate:      sql<string | null>`MIN(${projects.startDate}) FILTER (WHERE ${projects.status} = '진행')`,
        activeEndDate:        sql<string | null>`MAX(${projects.endDate}) FILTER (WHERE ${projects.status} = '진행')`,
        activeContractAmount: sql<number | null>`SUM(${projects.contractAmount}) FILTER (WHERE ${projects.status} = '진행')`,
      })
      .from(projectGroups)
      .leftJoin(projects, eq(projects.projectGroupId, projectGroups.id))
      .groupBy(projectGroups.id)
      .orderBy(
        sql`CASE WHEN ${projectGroups.status} = '진행' THEN 0 ELSE 1 END`,
        sql`MAX(${projects.endDate}) FILTER (WHERE ${projects.status} = '진행') ASC NULLS LAST`,
      ),

      // 2. 작업 만료일
      db.select({
        groupId:    projects.projectGroupId,
        minWorkEnd: sql<string | null>`MIN(${projectRevenues.workEndDate}) FILTER (WHERE ${projectRevenues.workCompleted} = false)`,
      })
      .from(projects)
      .innerJoin(projectRevenues, eq(projectRevenues.projectId, projects.id))
      .where(eq(projects.status, "진행"))
      .groupBy(projects.projectGroupId),

      // 3. 그룹별 매출 총계
      db.select({ groupId: projects.projectGroupId, total: count(projectRevenues.id) })
        .from(projects)
        .innerJoin(projectRevenues, eq(projectRevenues.projectId, projects.id))
        .where(eq(projects.status, "진행"))
        .groupBy(projects.projectGroupId),

      // 4. 그룹별 매출 상태
      db.select({
        groupId:   projects.projectGroupId,
        invoiced:  sql<number>`COUNT(*) FILTER (WHERE ${confirmRequests.taxInvoiceDate} IS NOT NULL)`,
        confirmed: sql<number>`COUNT(*) FILTER (WHERE ${confirmRequests.status} = '확인완료' AND ${confirmRequests.taxInvoiceDate} IS NULL)`,
        pending:   sql<number>`COUNT(*) FILTER (WHERE ${confirmRequests.status} = '대기')`,
      })
      .from(projects)
      .innerJoin(confirmRequests, sql`${confirmRequests.projectId} = ${projects.id}::text`)
      .where(eq(projects.status, "진행"))
      .groupBy(projects.projectGroupId),

      // 5. 그룹별 매입 총계
      db.select({ groupId: projects.projectGroupId, total: count(projectCosts.id) })
        .from(projects)
        .innerJoin(projectCosts, eq(projectCosts.projectId, projects.id))
        .where(eq(projects.status, "진행"))
        .groupBy(projects.projectGroupId),

      // 6. 그룹별 매입 상태
      db.select({
        groupId:  projects.projectGroupId,
        approved: sql<number>`COUNT(*) FILTER (WHERE ${paymentRequests.status} = '승인')`,
        pending:  sql<number>`COUNT(*) FILTER (WHERE ${paymentRequests.status} = '대기')`,
      })
      .from(projects)
      .innerJoin(paymentRequests, sql`${paymentRequests.projectId} = ${projects.id}::text`)
      .where(eq(projects.status, "진행"))
      .groupBy(projects.projectGroupId),

      // 7. 전체 캠페인 목록
      db.select({
        id:             projects.id,
        projectGroupId: projects.projectGroupId,
        campaignName:   projects.campaignName,
        projectType:    projects.projectType,
        product:        projects.product,
        status:         projects.status,
        startDate:      projects.startDate,
        endDate:        projects.endDate,
        contractAmount: projects.contractAmount,
        kpiSupply:      projects.kpiSupply,
        kpiTax:         projects.kpiTax,
        isExtended:     projects.isExtended,
        placeLink:      projects.placeLink,
        notes:          projects.notes,
        assignedTeam:   projects.assignedTeam,
        assignedPerson: projects.assignedPerson,
        clientId:       projects.clientId,
        advertiser:     projects.advertiser,
        workEndDate:    max(projectRevenues.workEndDate),
        revenueTotal:   count(projectRevenues.id),
      })
      .from(projects)
      .leftJoin(projectRevenues, eq(projectRevenues.projectId, projects.id))
      .groupBy(projects.id)
      .orderBy(desc(projects.createdAt)),

      // 8. 캠페인별 매입 총계
      db.select({ projectId: projectCosts.projectId, total: count(projectCosts.id) })
        .from(projectCosts).groupBy(projectCosts.projectId),

      // 9. 캠페인별 매출 상태
      db.select({
        projectId: confirmRequests.projectId,
        invoiced:  sql<number>`COUNT(*) FILTER (WHERE ${confirmRequests.taxInvoiceDate} IS NOT NULL)`,
        confirmed: sql<number>`COUNT(*) FILTER (WHERE ${confirmRequests.status} = '확인완료' AND ${confirmRequests.taxInvoiceDate} IS NULL)`,
        pending:   sql<number>`COUNT(*) FILTER (WHERE ${confirmRequests.status} = '대기')`,
      })
      .from(confirmRequests).groupBy(confirmRequests.projectId),

      // 10. 캠페인별 매입 상태
      db.select({
        projectId: paymentRequests.projectId,
        approved:  sql<number>`COUNT(*) FILTER (WHERE ${paymentRequests.status} = '승인')`,
        pending:   sql<number>`COUNT(*) FILTER (WHERE ${paymentRequests.status} = '대기')`,
      })
      .from(paymentRequests).groupBy(paymentRequests.projectId),

      // 11. 작업확인 미완료 카운트
      db.select({ cnt: sql<number>`COUNT(*)` })
        .from(projectRevenues)
        .where(
          and(
            or(eq(projectRevenues.workCompleted, false), isNull(projectRevenues.workCompleted)),
            sql`EXISTS (
              SELECT 1 FROM confirm_requests cr
              WHERE cr.project_id = ${projectRevenues.projectId}::text
              AND (
                (cr.row_key = ${projectRevenues.revenueRowId} AND ${projectRevenues.revenueRowId} IS NOT NULL)
                OR cr.row_key = '__contract__'
              )
              AND cr.status = '확인완료'
            )`
          )
        ),
    ]);

    // ── 그룹/캠페인 조립 ────────────────────────────────────
    const workEndMap    = new Map(workEndRows.map(r => [r.groupId, r.minWorkEnd ?? null]));
    const revTotalMap   = new Map(revTotal.map(r => [r.groupId, Number(r.total)]));
    const revStatsMap   = new Map(revStats.map(r => [r.groupId, { invoiced: Number(r.invoiced), confirmed: Number(r.confirmed), pending: Number(r.pending) }]));
    const costTotalMap  = new Map(costTotal.map(r => [r.groupId, Number(r.total)]));
    const costStatsMap  = new Map(costStats.map(r => [r.groupId, { approved: Number(r.approved), pending: Number(r.pending) }]));
    const campCostMap   = new Map(campCostTotal.map(r => [r.projectId!, Number(r.total)]));
    const campRevMap    = new Map(campRevStats.map(r => [r.projectId!, { invoiced: Number(r.invoiced), confirmed: Number(r.confirmed), pending: Number(r.pending) }]));
    const campCostStMap = new Map(campCostStats.map(r => [r.projectId!, { approved: Number(r.approved), pending: Number(r.pending) }]));

    const campaignsByGroup = new Map<string, object[]>();
    for (const c of allCampaigns) {
      if (!c.projectGroupId) continue;
      const effectiveEnd = c.workEndDate ?? c.endDate;
      const rev  = campRevMap.get(c.id)    ?? { invoiced: 0, confirmed: 0, pending: 0 };
      const cost = campCostStMap.get(c.id) ?? { approved: 0, pending: 0 };
      const camp = {
        ...c,
        workEndDate:      c.workEndDate ?? null,
        daysRemaining:    daysRemaining(effectiveEnd),
        revenueTotal:     Number(c.revenueTotal),
        revenueInvoiced:  rev.invoiced,
        revenueConfirmed: rev.confirmed,
        revenuePending:   rev.pending,
        costTotal:        campCostMap.get(c.id) ?? 0,
        costApproved:     cost.approved,
        costPending:      cost.pending,
      };
      if (!campaignsByGroup.has(c.projectGroupId)) campaignsByGroup.set(c.projectGroupId, []);
      campaignsByGroup.get(c.projectGroupId)!.push(camp);
    }

    const groups = groupRows.map(r => {
      const rev  = revStatsMap.get(r.id)  ?? { invoiced: 0, confirmed: 0, pending: 0 };
      const cost = costStatsMap.get(r.id) ?? { approved: 0, pending: 0 };
      return {
        ...r,
        campaignCount:           Number(r.campaignCount),
        activeCampaignCount:     Number(r.activeCampaignCount),
        activeContractAmount:    r.activeContractAmount ? Number(r.activeContractAmount) : null,
        activeDaysRemaining:     daysRemaining(r.activeEndDate),
        activeWorkDaysRemaining: daysRemaining(workEndMap.get(r.id) ?? null),
        revenueTotal:            revTotalMap.get(r.id) ?? 0,
        revenueInvoiced:         rev.invoiced,
        revenueConfirmed:        rev.confirmed,
        revenuePending:          rev.pending,
        costTotal:               costTotalMap.get(r.id) ?? 0,
        costApproved:            cost.approved,
        costPending:             cost.pending,
        campaigns:               campaignsByGroup.get(r.id) ?? [],
      };
    });

    const workIncompleteCount = Number(workIncompleteResult[0]?.cnt ?? 0);

    return NextResponse.json({ groups, workIncompleteCount });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
