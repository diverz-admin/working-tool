import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projectRevenues } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const rowKey = req.nextUrl.searchParams.get("rowKey");
  if (!rowKey) return NextResponse.json({ projectId: null });

  const [row] = await db
    .select({ projectId: projectRevenues.projectId })
    .from(projectRevenues)
    .where(eq(projectRevenues.revenueRowId, rowKey));

  return NextResponse.json({ projectId: row?.projectId ?? null });
}
