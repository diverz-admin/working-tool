import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/session";
import { db } from "@/db";
import { userTodos } from "@/db/schema";
import { eq, and } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

async function getCurrentUser(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  return token ? await verifySession(token) : null;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const updateData: Record<string, unknown> = {};
  if (body.content   !== undefined) updateData.content  = body.content.trim();
  if (body.isDone    !== undefined) updateData.isDone   = body.isDone;
  if (body.priority  !== undefined) updateData.priority = body.priority;
  if (body.dueDate   !== undefined) updateData.dueDate  = body.dueDate || null;

  const [todo] = await db.update(userTodos).set(updateData)
    .where(and(eq(userTodos.id, id), eq(userTodos.userId, user.id)))
    .returning();

  if (!todo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ todo });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await db.delete(userTodos)
    .where(and(eq(userTodos.id, id), eq(userTodos.userId, user.id)));

  return NextResponse.json({ ok: true });
}
