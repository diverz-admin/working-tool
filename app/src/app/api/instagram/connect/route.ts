import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

const IG_API = "https://graph.facebook.com/v21.0";

export async function POST(req: NextRequest) {
  const { accessToken, igUserId } = await req.json();
  if (!accessToken?.trim() || !igUserId?.trim()) {
    return NextResponse.json({ error: "액세스 토큰과 Instagram 계정 ID가 필요합니다." }, { status: 400 });
  }

  // 토큰 유효성 검증
  const testRes = await fetch(
    `${IG_API}/${igUserId.trim()}?fields=id,username,followers_count&access_token=${accessToken.trim()}`
  );
  const testData = await testRes.json();
  if (testData.error) {
    return NextResponse.json({ error: `토큰 검증 실패: ${testData.error.message}` }, { status: 400 });
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000); // 60일 후

  await db.insert(appSettings).values({ key: "ig_access_token", value: accessToken.trim(), updatedAt: now })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: accessToken.trim(), updatedAt: now } });
  await db.insert(appSettings).values({ key: "ig_user_id", value: igUserId.trim(), updatedAt: now })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: igUserId.trim(), updatedAt: now } });
  await db.insert(appSettings).values({ key: "ig_token_expires_at", value: expiresAt.toISOString(), updatedAt: now })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: expiresAt.toISOString(), updatedAt: now } });

  return NextResponse.json({ ok: true, username: testData.username, followers: testData.followers_count });
}

export async function DELETE() {
  await db.delete(appSettings).where(eq(appSettings.key, "ig_access_token"));
  await db.delete(appSettings).where(eq(appSettings.key, "ig_user_id"));
  await db.delete(appSettings).where(eq(appSettings.key, "ig_token_expires_at"));
  return NextResponse.json({ ok: true });
}
