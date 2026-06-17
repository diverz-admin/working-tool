import { NextResponse } from "next/server";
import { db } from "@/db";
import { chatChannels, chatMessages, users } from "@/db/schema";
import { asc, desc, eq, max } from "drizzle-orm";

export async function GET() {
  try {
    // 1. 채널 목록 + latestMap + 유저 목록 병렬 (1 cold start, 3 DB 쿼리)
    const [channelRows, latestRows, userRows] = await Promise.all([
      db.select().from(chatChannels).orderBy(asc(chatChannels.createdAt)),
      db.select({ channelId: chatMessages.channelId, latestAt: max(chatMessages.createdAt) })
        .from(chatMessages).groupBy(chatMessages.channelId),
      db.select({ id: users.id, name: users.name, team: users.team }).from(users),
    ]);

    const latestMap = Object.fromEntries(latestRows.map(r => [r.channelId, r.latestAt ?? null]));
    const channels = channelRows.map(ch => ({ ...ch, latestMessageAt: latestMap[ch.id] ?? null }));

    // 2. 첫 채널의 최신 메시지 100개 (같은 cold start, 추가 1 DB 쿼리)
    let firstMessages: typeof chatMessages.$inferSelect[] = [];
    if (channels.length > 0) {
      const rows = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.channelId, channels[0].id))
        .orderBy(desc(chatMessages.createdAt))
        .limit(100);
      firstMessages = rows.reverse();
    }

    return NextResponse.json({
      channels,
      firstChannelId: channels[0]?.id ?? null,
      firstMessages,
      users: userRows,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
