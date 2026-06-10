import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/session";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const token   = req.cookies.get(SESSION_COOKIE)?.value;
  const payload = token ? await verifySession(token) : null;
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [user] = await db.select({
    id: users.id, name: users.name, role: users.role, team: users.team,
  }).from(users).where(eq(users.id, payload.id));

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ user });
}
