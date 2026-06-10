import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workDailyLogs, projectRevenues } from "@/db/schema";
import { eq, asc, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const revenueId = req.nextUrl.searchParams.get("revenueId");
  if (!revenueId) return NextResponse.json({ logs: [] });
  const logs = await db
    .select()
    .from(workDailyLogs)
    .where(eq(workDailyLogs.revenueId, revenueId))
    .orderBy(asc(workDailyLogs.date));
  return NextResponse.json({ logs });
}

export async function POST(req: NextRequest) {
  const { revenueId, date, qty, note } = await req.json();
  if (!revenueId || !date || qty == null) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  const [log] = await db.insert(workDailyLogs).values({
    revenueId,
    date,
    qty: parseInt(String(qty), 10) || 0,
    note: note || null,
  }).returning();

  // completedQty = sum of all daily logs for this revenue
  const [{ total }] = await db
    .select({ total: sql<number>`COALESCE(SUM(${workDailyLogs.qty}), 0)` })
    .from(workDailyLogs)
    .where(eq(workDailyLogs.revenueId, revenueId));
  await db.update(projectRevenues).set({ completedQty: Number(total) }).where(eq(projectRevenues.id, revenueId));

  return NextResponse.json({ log, completedQty: Number(total) }, { status: 201 });
}
