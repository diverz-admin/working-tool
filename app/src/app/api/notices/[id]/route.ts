import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { notices } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const [row] = await db.update(notices).set({
    ...(body.title      !== undefined && { title:      body.title }),
    ...(body.content    !== undefined && { content:    body.content }),
    ...(body.isPinned   !== undefined && { isPinned:   body.isPinned }),
    ...(body.isActive   !== undefined && { isActive:   body.isActive }),
    ...(body.priority   !== undefined && { priority:   body.priority }),
    ...(body.authorName !== undefined && { authorName: body.authorName }),
    updatedAt: new Date(),
  }).where(eq(notices.id, id)).returning();
  return NextResponse.json({ notice: row });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.delete(notices).where(eq(notices.id, id));
  return NextResponse.json({ ok: true });
}
