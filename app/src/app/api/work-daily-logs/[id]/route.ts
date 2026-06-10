import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workDailyLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { recalcCompletedQty } from "@/lib/recalcCompletedQty";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const [deleted] = await db.delete(workDailyLogs).where(eq(workDailyLogs.id, id)).returning();
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const completedQty = await recalcCompletedQty(deleted.revenueId);
  return NextResponse.json({ ok: true, completedQty });
}
