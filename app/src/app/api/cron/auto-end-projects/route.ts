import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { and, eq, lt, isNotNull, sql } from "drizzle-orm";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const today = new Date().toISOString().split("T")[0];

    const result = await db
      .update(projects)
      .set({ status: "종료", updatedAt: sql`now()` })
      .where(
        and(
          eq(projects.status, "진행"),
          isNotNull(projects.endDate),
          lt(projects.endDate, today)
        )
      )
      .returning({ id: projects.id, campaignName: projects.campaignName });

    return NextResponse.json({ updated: result.length, projects: result });
  } catch (err) {
    console.error("[auto-end-projects]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
