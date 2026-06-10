import { NextRequest, NextResponse } from "next/server";
import { decodeSession, SESSION_COOKIE } from "@/lib/session";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ step: "no_cookie", cookie: null });

  const payload = decodeSession(token);
  if (!payload) return NextResponse.json({ step: "decode_failed", tokenPrefix: token.slice(0, 30) });

  try {
    const [user] = await db
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(eq(users.id, payload.id));

    if (!user) return NextResponse.json({ step: "user_not_found", payloadId: payload.id, payloadName: payload.name });
    return NextResponse.json({ step: "ok", user });
  } catch (e: unknown) {
    return NextResponse.json({ step: "db_error", error: String(e) });
  }
}
