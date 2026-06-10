import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workJournals } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { title, content, authorName, assignedTeam, clientId, projectId, date } = body;

  const [row] = await db
    .update(workJournals)
    .set({
      ...(title        !== undefined && { title:        title.trim() }),
      ...(content      !== undefined && { content }),
      ...(authorName   !== undefined && { authorName:   authorName.trim() }),
      ...(assignedTeam !== undefined && { assignedTeam: assignedTeam || null }),
      ...(clientId     !== undefined && { clientId:     clientId  || null }),
      ...(projectId    !== undefined && { projectId:    projectId || null }),
      ...(date         !== undefined && { date }),
      updatedAt: new Date(),
    })
    .where(eq(workJournals.id, id))
    .returning();

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ journal: row });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.delete(workJournals).where(eq(workJournals.id, id));
  return NextResponse.json({ ok: true });
}
