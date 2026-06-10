"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword } from "@/lib/password";
import { createSession, SESSION_COOKIE } from "@/lib/session";

export async function loginAction(
  _prev: { error: string } | null,
  formData: FormData,
): Promise<{ error: string }> {
  const username = (formData.get("username") as string)?.trim();
  const password = formData.get("password") as string;

  if (!username || !password) {
    return { error: "아이디와 비밀번호를 입력해주세요." };
  }

  const [user] = await db.select().from(users).where(eq(users.username, username));

  if (!user || !user.passwordHash) {
    return { error: "아이디 또는 비밀번호가 올바르지 않습니다." };
  }

  if (user.status === "비활성") {
    return { error: "비활성 계정입니다. 관리자에게 문의하세요." };
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return { error: "아이디 또는 비밀번호가 올바르지 않습니다." };
  }

  const token = await createSession({ id: user.id, name: user.name, role: user.role });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    path:     "/",
    maxAge:   60 * 60 * 24 * 7,
  });

  redirect("/dashboard");
}
