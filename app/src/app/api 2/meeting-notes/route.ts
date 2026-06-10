import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { meetingNotes } from "@/db/schema";
import { desc, and, eq, gte, lte } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year  = searchParams.get("year");
  const month = searchParams.get("month");
  const team  = searchParams.get("team");

  const conds = [];
  if (year && month) {
    const from = `${year}-${String(month).padStart(2, "0")}-01`;
    const to   = new Date(Number(year), Number(month), 0).toISOString().slice(0, 10);
    conds.push(gte(meetingNotes.date, from), lte(meetingNotes.date, to));
  }
  if (team && team !== "전체") conds.push(eq(meetingNotes.assignedTeam, team));

  const rows = await db
    .select()
    .from(meetingNotes)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(meetingNotes.date), desc(meetingNotes.createdAt));

  return NextResponse.json({ notes: rows });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.date || !body.title?.trim() || !body.authorName?.trim()) {
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });
  }
  const [row] = await db.insert(meetingNotes).values({
    date:             body.date,
    title:            body.title.trim(),
    content:          body.content ?? "",
    meetingType:      body.meetingType ?? "회의록",
    attendees:        body.attendees || null,
    location:         body.location  || null,
    authorName:       body.authorName.trim(),
    assignedTeam:     body.assignedTeam || null,
    clientId:         body.clientId  || null,
    projectId:        body.projectId || null,
    proposalFileUrl:  body.proposalFileUrl  || null,
    proposalFileName: body.proposalFileName || null,
  }).returning();
  return NextResponse.json({ note: row }, { status: 201 });
}
