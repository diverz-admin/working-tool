import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { chatMentions } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

// GET /api/chat/notifications?name=xxx  — 내 미읽음 멘션 목록
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  if (!name) return NextResponse.json({ mentions: [], unreadCount: 0 });

  const mentions = await db
    .select()
    .from(chatMentions)
    .where(eq(chatMentions.mentionedName, name))
    .orderBy(desc(chatMentions.createdAt))
    .limit(30);

  const unreadCount = mentions.filter((m) => !m.isRead).length;
  return NextResponse.json({ mentions, unreadCount });
}

// POST /api/chat/notifications  — 멘션 저장 (메시지 전송 시 호출)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { messageId, channelId, mentionedNames, fromName, preview } = body as {
    messageId: string;
    channelId: string;
    mentionedNames: string[];
    fromName: string;
    preview: string;
  };

  if (!messageId || !channelId || !mentionedNames?.length || !fromName) {
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });
  }

  const rows = await db
    .insert(chatMentions)
    .values(
      mentionedNames.map((name) => ({
        messageId,
        channelId,
        mentionedName: name,
        fromName,
        preview: preview.slice(0, 200),
      }))
    )
    .returning();

  return NextResponse.json({ mentions: rows }, { status: 201 });
}

// PATCH /api/chat/notifications  — 내 멘션 전체 읽음 처리
export async function PATCH(req: NextRequest) {
  const { name } = await req.json();
  if (!name) return NextResponse.json({ error: "name 필요" }, { status: 400 });

  await db
    .update(chatMentions)
    .set({ isRead: true })
    .where(and(eq(chatMentions.mentionedName, name), eq(chatMentions.isRead, false)));

  return NextResponse.json({ ok: true });
}
