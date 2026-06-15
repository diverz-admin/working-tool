import { NextResponse } from "next/server";
import { db } from "@/db";
import { projectGroups, projects, projectRevenues, projectCosts, confirmRequests, paymentRequests } from "@/db/schema";
import { eq, count, sql } from "drizzle-orm";

function daysRemaining(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).setHours(0,0,0,0) - new Date().setHours(0,0,0,0);
  return Math.ceil(diff / 86400000);
}

export async function GET() {
  try {
    const rows = await db
      .select({
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
      );

    // 나머지 5개 쿼리 병렬 실행
    const [workEndRows, revTotal, revStats, costTotal, costStats] = await Promise.all([
      // 품목(매출행) 최근접 workEndDate (미완료 행 기준)
      db.select({
          groupId:    projects.projectGroupId,
          minWorkEnd: sql<string | null>`MIN(${projectRevenues.workEndDate}) FILTER (WHERE ${projectRevenues.workCompleted} = false)`,
        })
        .from(projects)
        .innerJoin(projectRevenues, eq(projectRevenues.projectId, projects.id))
        .where(eq(projects.status, "진행"))
        .groupBy(projects.projectGroupId),

      // 매출 총 건수
      db.select({ groupId: projects.projectGroupId, total: count(projectRevenues.id) })
        .from(projects)
        .innerJoin(projectRevenues, eq(projectRevenues.projectId, projects.id))
        .where(eq(projects.status, "진행"))
        .groupBy(projects.projectGroupId),

      // 매출 결재 현황
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

      // 매입 총 건수
      db.select({ groupId: projects.projectGroupId, total: count(projectCosts.id) })
        .from(projects)
        .innerJoin(projectCosts, eq(projectCosts.projectId, projects.id))
        .where(eq(projects.status, "진행"))
        .groupBy(projects.projectGroupId),

      // 매입 결재 현황
      db.select({
          groupId:  projects.projectGroupId,
          approved: sql<number>`COUNT(*) FILTER (WHERE ${paymentRequests.status} = '승인')`,
          pending:  sql<number>`COUNT(*) FILTER (WHERE ${paymentRequests.status} = '대기')`,
        })
        .from(projects)
        .innerJoin(paymentRequests, sql`${paymentRequests.projectId} = ${projects.id}::text`)
        .where(eq(projects.status, "진행"))
        .groupBy(projects.projectGroupId),
    ]);

    const workEndMap   = new Map(workEndRows.map((r) => [r.groupId, r.minWorkEnd ?? null]));
    const revTotalMap  = new Map(revTotal.map((r) => [r.groupId, Number(r.total)]));
    const revStatsMap  = new Map(revStats.map((r) => [r.groupId, { invoiced: Number(r.invoiced), confirmed: Number(r.confirmed), pending: Number(r.pending) }]));
    const costTotalMap = new Map(costTotal.map((r) => [r.groupId, Number(r.total)]));
    const costStatsMap = new Map(costStats.map((r) => [r.groupId, { approved: Number(r.approved), pending: Number(r.pending) }]));

    return NextResponse.json({
      groups: rows.map((r) => {
        const rev  = revStatsMap.get(r.id)  ?? { invoiced: 0, confirmed: 0, pending: 0 };
        const cost = costStatsMap.get(r.id) ?? { approved: 0, pending: 0 };
        return {
          ...r,
          campaignCount:        Number(r.campaignCount),
          activeCampaignCount:  Number(r.activeCampaignCount),
          activeContractAmount: r.activeContractAmount ? Number(r.activeContractAmount) : null,
          activeDaysRemaining:     daysRemaining(r.activeEndDate),
          activeWorkDaysRemaining: daysRemaining(workEndMap.get(r.id) ?? null),
          revenueTotal:         revTotalMap.get(r.id) ?? 0,
          revenueInvoiced:      rev.invoiced,
          revenueConfirmed:     rev.confirmed,
          revenuePending:       rev.pending,
          costTotal:            costTotalMap.get(r.id) ?? 0,
          costApproved:         cost.approved,
          costPending:          cost.pending,
        };
      }),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch project groups" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const [group] = await db.insert(projectGroups).values({
      name:           body.name,
      clientId:       body.clientId || null,
      assignedTeam:   body.assignedTeam || null,
      assignedPerson: body.assignedPerson || null,
      status:         body.status ?? "진행",
      notes:          body.notes || null,
    }).returning();
    return NextResponse.json({ group }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to create project group" }, { status: 500 });
  }
}
