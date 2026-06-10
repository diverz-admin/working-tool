import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { chatMessages } from "@/db/schema";
import { eq, desc, asc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const channelId = searchParams.get("channelId");
  if (!channelId) return NextResponse.json({ error: "channelId 필요" }, { status: 400 });

  // 최신 100개를 DESC로 가져온 뒤 ASC로 뒤집어 반환
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.channelId, channelId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(100);

  return NextResponse.json({ messages: rows.reverse() });
}

export async function POST(req: NextRequest) {
  const { channelId, authorName, authorTeam, content } = await req.json();
  if (!channelId || !authorName?.trim() || !content) {
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });
  }
  const isFile = content.startsWith('{"__type":"file"');
  if (!isFile && !content.trim()) {
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });
  }

  const [message] = await db
    .insert(chatMessages)
    .values({
      channelId,
      authorName: authorName.trim(),
      authorTeam: authorTeam || null,
      content: content.trim(),
    })
    .returning();

  return NextResponse.json({ message }, { status: 201 });
}
