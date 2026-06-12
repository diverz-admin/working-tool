import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { hashPassword } from "@/lib/password";

export async function GET() {
  const rows = await db.select().from(users).orderBy(asc(users.joinedAt), asc(users.name));
  return NextResponse.json({ users: rows.map(r => ({ ...r, passwordHash: undefined })) });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name?.trim() || !body.email?.trim()) {
      return NextResponse.json({ error: "이름과 이메일은 필수입니다." }, { status: 400 });
    }

    if (body.username?.trim()) {
      const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.username, body.username.trim()));
      if (dup) return NextResponse.json({ error: "이미 사용 중인 아이디입니다." }, { status: 409 });
    }

    const passwordHash = body.password ? await hashPassword(body.password) : null;

    const [row] = await db.insert(users).values({
      name:         body.name.trim(),
      email:        body.email.trim(),
      role:         body.role     ?? "Staff",
      team:         body.team     || null,
      position:     body.position || null,
      phone:        body.phone    || null,
      workPhone:    body.workPhone || null,
      status:       body.status   ?? "활성",
      joinedAt:     body.joinedAt || new Date().toISOString().slice(0, 10),
      username:     body.username?.trim() || null,
      passwordHash: passwordHash,
    }).returning();

    return NextResponse.json({ user: { ...row, passwordHash: undefined } }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/users]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
