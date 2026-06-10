import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workDailyLogs } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { recalcCompletedQty } from "@/lib/recalcCompletedQty";

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
    qty: Number(qty) || 0,
    note: note || null,
  }).returning();

  const completedQty = await recalcCompletedQty(revenueId);
  return NextResponse.json({ log, completedQty }, { status: 201 });
}
