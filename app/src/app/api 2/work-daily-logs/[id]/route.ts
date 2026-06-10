import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workDailyLogs, projectRevenues } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const [deleted] = await db.delete(workDailyLogs).where(eq(workDailyLogs.id, id)).returning();
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const revenueId = deleted.revenueId;
  const [{ total }] = await db
    .select({ total: sql<number>`COALESCE(SUM(${workDailyLogs.qty}), 0)` })
    .from(workDailyLogs)
    .where(eq(workDailyLogs.revenueId, revenueId));
  await db.update(projectRevenues).set({ completedQty: Number(total) }).where(eq(projectRevenues.id, revenueId));

  return NextResponse.json({ ok: true, completedQty: Number(total) });
}
