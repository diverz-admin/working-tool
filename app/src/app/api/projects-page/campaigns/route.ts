import { NextResponse } from "next/server";
import { db } from "@/db";
import { daysRemaining } from "@/lib/days-remaining";
import { projects, projectRevenues, projectCosts, confirmRequests, paymentRequests } from "@/db/schema";
import { eq, desc, max, count, sql, and } from "drizzle-orm";


// 전체 그룹의 캠페인을 4개 병렬 쿼리로 한 번에 조회
// 기존 N개(그룹 수) 개별 요청 → 단일 요청으로 통합
export async function GET() {
  try {
    const [campaignRows, costTotalRows, revStatsRows, costStatsRows, itemRows] = await Promise.all([
      // 1. 모든 캠페인 + workEndDate + revenueTotal
      db.select({
        id:             projects.id,
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
        projectGroupId: projects.projectGroupId,
        workEndDate:    max(projectRevenues.workEndDate),
        revenueTotal:   count(projectRevenues.id),
      })
        .from(projects)
        .leftJoin(projectRevenues, eq(projectRevenues.projectId, projects.id))
        .groupBy(projects.id)
        .orderBy(desc(projects.createdAt)),

      // 2. 매입 총계 (전체 프로젝트)
      db.select({
        projectId: projectCosts.projectId,
        total:     count(projectCosts.id),
      })
        .from(projectCosts)
        .groupBy(projectCosts.projectId),

      // 3. 매출 상태 (전체 프로젝트)
      db.select({
        projectId: confirmRequests.projectId,
        invoiced:  sql<number>`COUNT(*) FILTER (WHERE ${confirmRequests.taxInvoiceDate} IS NOT NULL)`,
        confirmed: sql<number>`COUNT(*) FILTER (WHERE ${confirmRequests.status} = '확인완료')`,
        pending:   sql<number>`COUNT(*) FILTER (WHERE ${confirmRequests.status} = '대기')`,
      })
        .from(confirmRequests)
        .groupBy(confirmRequests.projectId),

      // 4. 매입 상태 (전체 프로젝트)
      db.select({
        projectId: paymentRequests.projectId,
        approved:  sql<number>`COUNT(*) FILTER (WHERE ${paymentRequests.status} = '승인')`,
        pending:   sql<number>`COUNT(*) FILTER (WHERE ${paymentRequests.status} = '대기')`,
      })
        .from(paymentRequests)
        .groupBy(paymentRequests.projectId),

      // 5. 품목 종료일 필터에서 상세에 보여줄 품목 — 완료 체크 안 됐고 오늘 이후에 끝나는 것만
      db.select({
        id:            projectRevenues.id,
        projectId:     projectRevenues.projectId,
        productName:   projectRevenues.productName,
        quantity:      projectRevenues.quantity,
        workStartDate: projectRevenues.workStartDate,
        workEndDate:   projectRevenues.workEndDate,
      })
        .from(projectRevenues)
        .where(and(
          eq(projectRevenues.workCompleted, false),
          sql`${projectRevenues.workEndDate} >= (now() AT TIME ZONE 'Asia/Seoul')::date`,
        ))
        .orderBy(projectRevenues.workEndDate),
    ]);

    const itemsMap = new Map<string, unknown[]>();
    for (const { projectId, ...it } of itemRows) {
      if (!itemsMap.has(projectId)) itemsMap.set(projectId, []);
      itemsMap.get(projectId)!.push({ ...it, daysRemaining: daysRemaining(it.workEndDate) });
    }

    const costTotalMap = new Map(costTotalRows.map(r => [r.projectId!, Number(r.total)]));
    const revStatsMap  = new Map(revStatsRows.map(r => [r.projectId!, {
      invoiced:  Number(r.invoiced),
      confirmed: Number(r.confirmed),
      pending:   Number(r.pending),
    }]));
    const costStatsMap = new Map(costStatsRows.map(r => [r.projectId!, {
      approved: Number(r.approved),
      pending:  Number(r.pending),
    }]));

    // 그룹별로 캠페인 묶기
    const campaignsByGroup: Record<string, unknown[]> = {};
    for (const c of campaignRows) {
      const effectiveEnd = c.workEndDate ?? c.endDate;
      const rev  = revStatsMap.get(c.id)  ?? { invoiced: 0, confirmed: 0, pending: 0 };
      const cost = costStatsMap.get(c.id) ?? { approved: 0, pending: 0 };
      const campaign = {
        ...c,
        workEndDate:      c.workEndDate ?? null,
        daysRemaining:    daysRemaining(effectiveEnd),
        revenueTotal:     Number(c.revenueTotal),
        revenueInvoiced:  rev.invoiced,
        revenueConfirmed: rev.confirmed,
        revenuePending:   rev.pending,
        costTotal:        costTotalMap.get(c.id) ?? 0,
        costApproved:     cost.approved,
        costPending:      cost.pending,
        items:            itemsMap.get(c.id) ?? [],
      };
      const gId = c.projectGroupId ?? "__ungrouped__";
      if (!campaignsByGroup[gId]) campaignsByGroup[gId] = [];
      campaignsByGroup[gId].push(campaign);
    }

    return NextResponse.json({ campaignsByGroup });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
