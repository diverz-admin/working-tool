import { NextResponse } from "next/server";
import { db } from "@/db";
import { projectGroups, projects, projectCosts } from "@/db/schema";
import { eq, sql, and, or, isNull } from "drizzle-orm";

export async function GET() {
  try {
    const rows = await db
      .select({
        team: projectGroups.assignedTeam,
        cnt:  sql<number>`COUNT(*)`,
      })
      .from(projectCosts)
      .innerJoin(projects,      eq(projects.id, projectCosts.projectId))
      .innerJoin(projectGroups, eq(projectGroups.id, projects.projectGroupId))
      .where(
        and(
          eq(projects.status, "진행"),
          or(eq(projectCosts.workCompleted, false), isNull(projectCosts.workCompleted))
        )
      )
      .groupBy(projectGroups.assignedTeam);

    const result: Record<string, number> = {};
    for (const r of rows) {
      if (r.team) result[r.team] = Number(r.cnt);
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json({}, { status: 500 });
  }
}
