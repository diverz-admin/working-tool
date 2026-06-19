import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appNotifications } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";

async function ensureTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS app_notifications (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      recipient_name TEXT       NOT NULL,
      from_name      TEXT       NOT NULL,
      type           TEXT       NOT NULL,
      title          TEXT       NOT NULL,
      body           TEXT       NOT NULL,
      link           TEXT,
      is_read        BOOLEAN    NOT NULL DEFAULT false,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

// GET /api/notifications?name=xxx
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  if (!name) return NextResponse.json({ notifications: [] });
  await ensureTable();

  const rows = await db
    .select()
    .from(appNotifications)
    .where(eq(appNotifications.recipientName, name))
    .orderBy(desc(appNotifications.createdAt))
    .limit(30);

  return NextResponse.json({ notifications: rows });
}

// POST /api/notifications  — 알림 생성
export async function POST(req: NextRequest) {
  await ensureTable();
  const body = await req.json();
  const [row] = await db
    .insert(appNotifications)
    .values({
      recipientName: body.recipientName,
      fromName:      body.fromName,
      type:          body.type,
      title:         body.title,
      body:          body.body,
      link:          body.link ?? null,
    })
    .returning();
  return NextResponse.json({ notification: row }, { status: 201 });
}

// PATCH /api/notifications  — 읽음 처리
export async function PATCH(req: NextRequest) {
  await ensureTable();
  const { name } = await req.json();
  if (!name) return NextResponse.json({ error: "name 필요" }, { status: 400 });
  await db
    .update(appNotifications)
    .set({ isRead: true })
    .where(and(eq(appNotifications.recipientName, name), eq(appNotifications.isRead, false)));
  return NextResponse.json({ ok: true });
}
