import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword } from "@/lib/password";
import { createSession, SESSION_COOKIE } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  if (!username || !password) {
    return NextResponse.json({ error: "아이디와 비밀번호를 입력해주세요." }, { status: 400 });
  }

  const [user] = await db.select().from(users).where(eq(users.username, username));

  if (!user || !user.passwordHash) {
    return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  if (user.status === "비활성") {
    return NextResponse.json({ error: "비활성 계정입니다. 관리자에게 문의하세요." }, { status: 403 });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const token = await createSession({ id: user.id, name: user.name, role: user.role });

  const res = NextResponse.json({
    user: { id: user.id, name: user.name, role: user.role, team: user.team },
  });

  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    path:     "/",
    maxAge:   60 * 60 * 24 * 7,
  });

  return res;
}
