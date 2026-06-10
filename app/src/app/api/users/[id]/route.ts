import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { hashPassword } from "@/lib/password";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();

  if (body.username?.trim()) {
    const [dup] = await db.select({ id: users.id }).from(users)
      .where(and(eq(users.username, body.username.trim()), ne(users.id, id)));
    if (dup) return NextResponse.json({ error: "이미 사용 중인 아이디입니다." }, { status: 409 });
  }

  const updateData: Record<string, unknown> = {
    name:      body.name?.trim(),
    email:     body.email?.trim(),
    role:      body.role,
    team:      body.team     || null,
    position:  body.position || null,
    phone:     body.phone    || null,
    status:    body.status,
    joinedAt:  body.joinedAt || undefined,
    username:  body.username?.trim() || null,
    updatedAt: new Date(),
  };

  if (body.password) {
    updateData.passwordHash = await hashPassword(body.password);
  }

  const [row] = await db.update(users).set(updateData).where(eq(users.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ user: { ...row, passwordHash: undefined } });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await db.delete(users).where(eq(users.id, id));
  return NextResponse.json({ ok: true });
}
