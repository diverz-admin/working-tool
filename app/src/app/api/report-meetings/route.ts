import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { reportMeetings } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const year  = parseInt(searchParams.get("year")  ?? "0");
  const month = parseInt(searchParams.get("month") ?? "0");
  if (!year || !month) return NextResponse.json({ notes: [] });

  const rows = await db.select().from(reportMeetings)
    .where(and(eq(reportMeetings.year, year), eq(reportMeetings.month, month)));
  return NextResponse.json({ notes: rows });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { year, month, week, team, content, authorName } = body;
  if (!year || !month || !team) return NextResponse.json({ error: "필수값 누락" }, { status: 400 });

  // week NULL/숫자 모두 처리 — UNIQUE(year, month, week, team) upsert
  const weekVal = week ?? null;

  const existing = await db.select({ id: reportMeetings.id }).from(reportMeetings)
    .where(
      and(
        eq(reportMeetings.year, year),
        eq(reportMeetings.month, month),
        eq(reportMeetings.team, team),
        weekVal === null ? isNull(reportMeetings.week) : eq(reportMeetings.week, weekVal),
      )
    ).limit(1);

  if (existing.length > 0) {
    const [row] = await db.update(reportMeetings)
      .set({ content: content ?? "", authorName: authorName || null, updatedAt: new Date() })
      .where(eq(reportMeetings.id, existing[0].id))
      .returning();
    return NextResponse.json({ note: row });
  }

  const [row] = await db.insert(reportMeetings).values({
    year, month, week: weekVal, team,
    content: content ?? "",
    authorName: authorName || null,
  }).returning();
  return NextResponse.json({ note: row }, { status: 201 });
}
