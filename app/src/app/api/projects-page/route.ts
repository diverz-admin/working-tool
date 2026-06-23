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
    // ── 7개 쿼리 병렬 (가장 무거운 전체 캠페인 관련 4개 쿼리를 완전히 제거하여 최적화)
    const [
      groupRows,
      workEndRows, revTotal, revStats, costTotal, costStats,
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
        totalContractAmount:  sql<number | null>`SUM(${projects.contractAmount})`,
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
        confirmed: sql<number>`COUNT(*) FILTER (WHERE ${confirmRequests.status} = '확인완료')`,
        pending:   sql<number>`COUNT(*) FILTER (WHERE ${confirmRequests.status} = '대기')`,
      })
      .from(projects)
      .innerJoin(confirmRequests, eq(confirmRequests.projectId, projects.id))
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
      .innerJoin(paymentRequests, eq(paymentRequests.projectId, projects.id))
      .where(eq(projects.status, "진행"))
      .groupBy(projects.projectGroupId),

      // 7. 작업확인 미완료 카운트 — 진행 중인 프로젝트의 매입(구매) 기준
      db.select({ cnt: sql<number>`COUNT(*)` })
        .from(projectCosts)
        .innerJoin(projects, eq(projects.id, projectCosts.projectId))
        .where(and(
          eq(projects.status, "진행"),
          or(eq(projectCosts.workCompleted, false), isNull(projectCosts.workCompleted))
        )),
    ]);

    // ── 그룹 조립 ────────────────────────────────────
    const workEndMap    = new Map(workEndRows.map(r => [r.groupId, r.minWorkEnd ?? null]));
    const revTotalMap   = new Map(revTotal.map(r => [r.groupId, Number(r.total)]));
    const revStatsMap   = new Map(revStats.map(r => [r.groupId, { invoiced: Number(r.invoiced), confirmed: Number(r.confirmed), pending: Number(r.pending) }]));
    const costTotalMap  = new Map(costTotal.map(r => [r.groupId, Number(r.total)]));
    const costStatsMap  = new Map(costStats.map(r => [r.groupId, { approved: Number(r.approved), pending: Number(r.pending) }]));

    const groups = groupRows.map(r => {
      const rev  = revStatsMap.get(r.id)  ?? { invoiced: 0, confirmed: 0, pending: 0 };
      const cost = costStatsMap.get(r.id) ?? { approved: 0, pending: 0 };
      return {
        ...r,
        campaignCount:           Number(r.campaignCount),
        activeCampaignCount:     Number(r.activeCampaignCount),
        activeContractAmount:    r.activeContractAmount ? Number(r.activeContractAmount) : null,
        totalContractAmount:     r.totalContractAmount  ? Number(r.totalContractAmount)  : null,
        activeDaysRemaining:     daysRemaining(r.activeEndDate),
        activeWorkDaysRemaining: daysRemaining(workEndMap.get(r.id) ?? null),
        revenueTotal:            revTotalMap.get(r.id) ?? 0,
        revenueInvoiced:         rev.invoiced,
        revenueConfirmed:        rev.confirmed,
        revenuePending:          rev.pending,
        costTotal:               costTotalMap.get(r.id) ?? 0,
        costApproved:            cost.approved,
        costPending:             cost.pending,
        campaigns:               [], // 최초 로딩 시에는 빈 배열로 반환하고 아코디언 펼칠 때 동적 로드하도록 함
      };
    });

    const workIncompleteCount = Number(workIncompleteResult[0]?.cnt ?? 0);

    return NextResponse.json({ groups, workIncompleteCount });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}


