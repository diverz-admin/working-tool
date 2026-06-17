import { NextResponse } from "next/server";
import { db } from "@/db";
import { projectRevenues, projectCosts, projects, projectGroups, workDailyLogs } from "@/db/schema";
import { and, eq, or, isNull, gt, inArray, asc } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const teamParam = searchParams.get("team") ?? "";

    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const teamFilter = teamParam ? eq(projects.assignedTeam, teamParam) : undefined;
    const notCompletedOrRecentFilter = or(
      eq(projectRevenues.workCompleted, false),
      isNull(projectRevenues.workCompleted),
      and(
        eq(projectRevenues.workCompleted, true),
        or(
          isNull(projectRevenues.completedAt),
          gt(projectRevenues.completedAt, oneMonthAgo)
        )
      )
    );

    const [revenueRows, costRows] = await Promise.all([
      // 매출(판매) — 입력 즉시 표시
      db
        .select({
          id:            projectRevenues.id,
          projectId:     projectRevenues.projectId,
          revenueRowId:  projectRevenues.revenueRowId,
          assignee:      projectRevenues.assignee,
          productName:   projectRevenues.productName,
          quantity:      projectRevenues.quantity,
          completedQty:  projectRevenues.completedQty,
          workCompleted: projectRevenues.workCompleted,
          workStartDate: projectRevenues.workStartDate,
          workEndDate:   projectRevenues.workEndDate,
          settingDate:   projectRevenues.settingDate,
          paymentDate:   projectRevenues.paymentDate,
          total:         projectRevenues.total,
          completedAt:   projectRevenues.completedAt,
          campaignName:  projects.campaignName,
          assignedTeam:  projects.assignedTeam,
          groupName:     projectGroups.name,
          groupId:       projectGroups.id,
        })
        .from(projectRevenues)
        .innerJoin(projects, eq(projects.id, projectRevenues.projectId))
        .innerJoin(projectGroups, eq(projectGroups.id, projects.projectGroupId))
        .where(and(teamFilter, notCompletedOrRecentFilter))
        .orderBy(projectGroups.name, projects.campaignName, projectRevenues.rowNum),

      // 매입(구매) — 입력 즉시 표시
      db
        .select({
          id:            projectCosts.id,
          projectId:     projectCosts.projectId,
          assignee:      projectCosts.assignee,
          productName:   projectCosts.productName,
          quantity:      projectCosts.quantity,
          workCompleted: projectCosts.workCompleted,
          workStartDate: projectCosts.workStartDate,
          workEndDate:   projectCosts.workEndDate,
          settingDate:   projectCosts.settingDate,
          total:         projectCosts.total,
          campaignName:  projects.campaignName,
          assignedTeam:  projects.assignedTeam,
          groupName:     projectGroups.name,
          groupId:       projectGroups.id,
        })
        .from(projectCosts)
        .innerJoin(projects, eq(projects.id, projectCosts.projectId))
        .innerJoin(projectGroups, eq(projectGroups.id, projects.projectGroupId))
        .where(and(
          teamFilter,
          or(
            eq(projectCosts.workCompleted, false),
            isNull(projectCosts.workCompleted),
          )
        ))
        .orderBy(projectGroups.name, projects.campaignName, projectCosts.rowNum),
    ]);

    // daily logs (매출 행 기준)
    const ids = revenueRows.map(r => r.id);
    const logs = ids.length > 0
      ? await db.select().from(workDailyLogs).where(inArray(workDailyLogs.revenueId, ids)).orderBy(asc(workDailyLogs.date))
      : [];
    const logsMap = new Map<string, typeof logs>();
    for (const l of logs) {
      if (!logsMap.has(l.revenueId)) logsMap.set(l.revenueId, []);
      logsMap.get(l.revenueId)!.push(l);
    }

    const revenues = revenueRows.map(r => ({ ...r, rowType: "revenue" as const, revenueRowId: r.revenueRowId, completedQty: r.completedQty, completedAt: r.completedAt, paymentDate: r.paymentDate, dailyLogs: logsMap.get(r.id) ?? [] }));
    const costs    = costRows.map(c => ({ ...c, rowType: "cost" as const, revenueRowId: null, completedQty: null, completedAt: null, paymentDate: null, dailyLogs: [] }));

    return NextResponse.json({ rows: [...revenues, ...costs] });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch work check data" }, { status: 500 });
  }
}
