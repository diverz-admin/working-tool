import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { chatChannels, chatMessages } from "@/db/schema";
import { asc, max, eq } from "drizzle-orm";

export async function GET() {
  const channels = await db
    .select()
    .from(chatChannels)
    .orderBy(asc(chatChannels.createdAt));

  const latestRows = await db
    .select({ channelId: chatMessages.channelId, latestAt: max(chatMessages.createdAt) })
    .from(chatMessages)
    .groupBy(chatMessages.channelId);

  const latestMap = Object.fromEntries(latestRows.map((r) => [r.channelId, r.latestAt ?? null]));

  return NextResponse.json({
    channels: channels.map((ch) => ({ ...ch, latestMessageAt: latestMap[ch.id] ?? null })),
  });
}

export async function POST(req: NextRequest) {
  const { name, description } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "채널 이름 필요" }, { status: 400 });

  const [channel] = await db
    .insert(chatChannels)
    .values({ name: name.trim(), description: description?.trim() || null })
    .returning();

  return NextResponse.json({ channel }, { status: 201 });
}
