import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/session";
import { db } from "@/db";
import { userTodos, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";

async function getCurrentUser(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const payload = token ? await verifySession(token) : null;
  return payload;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const todos = await db.select().from(userTodos)
    .where(eq(userTodos.userId, user.id))
    .orderBy(userTodos.createdAt);

  return NextResponse.json({ todos });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.content?.trim()) {
    return NextResponse.json({ error: "내용을 입력해주세요." }, { status: 400 });
  }

  const [todo] = await db.insert(userTodos).values({
    userId:   user.id,
    content:  body.content.trim(),
    priority: body.priority ?? "medium",
    dueDate:  body.dueDate || null,
  }).returning();

  return NextResponse.json({ todo }, { status: 201 });
}
