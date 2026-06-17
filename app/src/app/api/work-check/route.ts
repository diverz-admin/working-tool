import { NextResponse } from "next/server";
import { db } from "@/db";
import { projectRevenues, projects, projectGroups, workDailyLogs } from "@/db/schema";
import { and, eq, or, isNull, gt, sql, inArray, asc } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const teamParam = searchParams.get("team") ?? "";

    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    // 입금확인요청에서 "확인완료" 처리된 매출행만 표시
    const confirmedExpr = sql`EXISTS (
      SELECT 1 FROM confirm_requests cr
      WHERE cr.project_id = ${projectRevenues.projectId}::text
      AND (
        (cr.row_key = ${projectRevenues.revenueRowId} AND ${projectRevenues.revenueRowId} IS NOT NULL)
        OR cr.row_key = '__contract__'
      )
      AND cr.status = '확인완료'
    )`;

    const rows = await db
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
      .where(
        and(
          confirmedExpr,
          teamParam ? eq(projects.assignedTeam, teamParam) : undefined,
          // 미완료이거나 완료된 지 1개월 이내
          or(
            eq(projectRevenues.workCompleted, false),
            isNull(projectRevenues.workCompleted),
            and(
              eq(projectRevenues.workCompleted, true),
              or(
                isNull(projectRevenues.completedAt),
                gt(projectRevenues.completedAt, oneMonthAgo)
              )
            )
          )
        )
      )
      .orderBy(projectGroups.name, projects.campaignName, projectRevenues.rowNum);

    // daily logs 조회
    const ids = rows.map(r => r.id);
    const logs = ids.length > 0
      ? await db.select().from(workDailyLogs).where(inArray(workDailyLogs.revenueId, ids)).orderBy(asc(workDailyLogs.date))
      : [];
    const logsMap = new Map<string, typeof logs>();
    for (const l of logs) {
      if (!logsMap.has(l.revenueId)) logsMap.set(l.revenueId, []);
      logsMap.get(l.revenueId)!.push(l);
    }

    const enriched = rows.map(r => ({ ...r, dailyLogs: logsMap.get(r.id) ?? [] }));
    return NextResponse.json({ rows: enriched });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch work check data" }, { status: 500 });
  }
}
