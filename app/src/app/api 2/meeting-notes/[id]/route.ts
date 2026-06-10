import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { meetingNotes } from "@/db/schema";
import { eq } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const [row] = await db.select().from(meetingNotes).where(eq(meetingNotes.id, id));
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ note: row });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const [row] = await db.update(meetingNotes).set({
    date:             body.date,
    title:            body.title?.trim(),
    content:          body.content ?? "",
    meetingType:      body.meetingType ?? "회의록",
    attendees:        body.attendees || null,
    location:         body.location  || null,
    authorName:       body.authorName?.trim(),
    assignedTeam:     body.assignedTeam || null,
    clientId:         body.clientId  || null,
    projectId:        body.projectId || null,
    proposalFileUrl:  body.proposalFileUrl  ?? undefined,
    proposalFileName: body.proposalFileName ?? undefined,
    updatedAt:        new Date(),
  }).where(eq(meetingNotes.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ note: row });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await db.delete(meetingNotes).where(eq(meetingNotes.id, id));
  return NextResponse.json({ ok: true });
}
