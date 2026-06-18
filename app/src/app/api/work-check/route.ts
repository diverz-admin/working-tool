import { NextResponse } from "next/server";
import { db } from "@/db";
import { projectCosts, projects, projectGroups } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const teamParam = searchParams.get("team") ?? "";

    const rows = await db
      .select({
        id:            projectCosts.id,
        projectId:     projectCosts.projectId,
        rowType:       projectCosts.costRowId, // reused as type marker
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
        eq(projects.status, "진행"),
        teamParam ? eq(projects.assignedTeam, teamParam) : undefined,
      ))
      .orderBy(projectGroups.name, projects.campaignName, projectCosts.rowNum);

    return NextResponse.json({ rows });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch work check data" }, { status: 500 });
  }
}
