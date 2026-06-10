import { NextResponse } from "next/server";
import { db } from "@/db";
import { projectGroups, projects, projectRevenues, projectCosts, confirmRequests, paymentRequests } from "@/db/schema";
import { eq, desc, max, count, sql } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

function daysRemaining(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000);
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;

    const [group] = await db.select().from(projectGroups).where(eq(projectGroups.id, id));
    if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const campaigns = await db
      .select({
        id:             projects.id,
        campaignName:   projects.campaignName,
        projectType:    projects.projectType,
        product:        projects.product,
        status:         projects.status,
        startDate:      projects.startDate,
        endDate:        projects.endDate,
        contractAmount: projects.contractAmount,
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
      .where(eq(projects.projectGroupId, id))
      .groupBy(projects.id)
      .orderBy(desc(projects.createdAt));

    const campaignIds = campaigns.map((c) => c.id);
    const idList = campaignIds.length > 0
      ? sql.raw(`ARRAY[${campaignIds.map((cid) => `'${cid}'`).join(",")}]`)
      : null;

    // 매입 총 건수
    const costTotalRows = idList
      ? await db
          .select({ projectId: projectCosts.projectId, total: count(projectCosts.id) })
          .from(projectCosts)
          .groupBy(projectCosts.projectId)
      : [];

    // 매출 결재 현황 단계별
    const revStats = idList
      ? await db
          .select({
            projectId: confirmRequests.projectId,
            invoiced:  sql<number>`COUNT(*) FILTER (WHERE ${confirmRequests.taxInvoiceDate} IS NOT NULL)`,
            confirmed: sql<number>`COUNT(*) FILTER (WHERE ${confirmRequests.status} = '확인완료' AND ${confirmRequests.taxInvoiceDate} IS NULL)`,
            pending:   sql<number>`COUNT(*) FILTER (WHERE ${confirmRequests.status} = '대기')`,
          })
          .from(confirmRequests)
          .where(sql`${confirmRequests.projectId} = ANY(${idList}::text[])`)
          .groupBy(confirmRequests.projectId)
      : [];

    // 매입 결재 현황 단계별
    const costStats = idList
      ? await db
          .select({
            projectId: paymentRequests.projectId,
            approved:  sql<number>`COUNT(*) FILTER (WHERE ${paymentRequests.status} = '승인')`,
            pending:   sql<number>`COUNT(*) FILTER (WHERE ${paymentRequests.status} = '대기')`,
          })
          .from(paymentRequests)
          .where(sql`${paymentRequests.projectId} = ANY(${idList}::text[])`)
          .groupBy(paymentRequests.projectId)
      : [];

    const costTotalMap = new Map(costTotalRows.map((r) => [r.projectId!, Number(r.total)]));
    const revStatsMap  = new Map(revStats.map((r) => [r.projectId!, { invoiced: Number(r.invoiced), confirmed: Number(r.confirmed), pending: Number(r.pending) }]));
    const costStatsMap = new Map(costStats.map((r) => [r.projectId!, { approved: Number(r.approved), pending: Number(r.pending) }]));

    const result = campaigns.map((c) => {
      const effectiveEnd = c.workEndDate ?? c.endDate;
      const rev  = revStatsMap.get(c.id)  ?? { invoiced: 0, confirmed: 0, pending: 0 };
      const cost = costStatsMap.get(c.id) ?? { approved: 0, pending: 0 };
      return {
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
      };
    });

    return NextResponse.json({ group, campaigns: result });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch project group" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const [group] = await db
      .update(projectGroups)
      .set({
        name:           body.name,
        clientId:       body.clientId || null,
        assignedTeam:   body.assignedTeam || null,
        assignedPerson: body.assignedPerson || null,
        status:         body.status,
        notes:          body.notes || null,
        updatedAt:      new Date(),
      })
      .where(eq(projectGroups.id, id))
      .returning();
    return NextResponse.json({ group });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update project group" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    await db.delete(projectGroups).where(eq(projectGroups.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to delete project group" }, { status: 500 });
  }
}
