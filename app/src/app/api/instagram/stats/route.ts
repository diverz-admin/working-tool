import { NextResponse } from "next/server";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { inArray } from "drizzle-orm";

const IG_API = "https://graph.facebook.com/v21.0";

async function refreshTokenIfNeeded(token: string, expiresAt: string | null): Promise<string> {
  if (!expiresAt) return token;
  const expiry = new Date(expiresAt).getTime();
  const tenDaysMs = 10 * 24 * 60 * 60 * 1000;
  if (expiry - Date.now() > tenDaysMs) return token;

  // 만료 10일 이내면 갱신
  const res = await fetch(`${IG_API}/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`);
  const data = await res.json();
  if (data.access_token) {
    const now = new Date();
    const newExpiry = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString();
    await db.insert(appSettings).values({ key: "ig_access_token", value: data.access_token, updatedAt: now })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: data.access_token, updatedAt: now } });
    await db.insert(appSettings).values({ key: "ig_token_expires_at", value: newExpiry, updatedAt: now })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: newExpiry, updatedAt: now } });
    return data.access_token;
  }
  return token;
}

export async function GET() {
  const rows = await db.select().from(appSettings)
    .where(inArray(appSettings.key, ["ig_access_token", "ig_user_id", "ig_token_expires_at"]));

  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const token = settings["ig_access_token"];
  const userId = settings["ig_user_id"];

  if (!token || !userId) return NextResponse.json({ connected: false });

  try {
    const accessToken = await refreshTokenIfNeeded(token, settings["ig_token_expires_at"] ?? null);

    // 프로필 조회
    const profileRes = await fetch(
      `${IG_API}/${userId}?fields=id,username,name,biography,followers_count,follows_count,media_count,profile_picture_url&access_token=${accessToken}`
    );
    const profile = await profileRes.json();
    if (profile.error) return NextResponse.json({ connected: false, error: profile.error.message });

    // 최근 게시물 조회
    const mediaRes = await fetch(
      `${IG_API}/${userId}/media?fields=id,caption,media_type,timestamp,like_count,comments_count,thumbnail_url,media_url,permalink&limit=20&access_token=${accessToken}`
    );
    const mediaData = await mediaRes.json();
    const media: IgMedia[] = mediaData.data ?? [];

    // 인사이트 조회 (도달, 노출) - 권한 있을 경우만
    const now = Math.floor(Date.now() / 1000);
    const sixMonthsAgo = now - 180 * 24 * 3600;
    let monthlyInsights: MonthlyInsight[] = [];
    try {
      const insRes = await fetch(
        `${IG_API}/${userId}/insights?metric=reach,impressions&period=month&since=${sixMonthsAgo}&until=${now}&access_token=${accessToken}`
      );
      const insData = await insRes.json();
      if (!insData.error && insData.data) {
        const reachArr: InsightValue[] = insData.data.find((d: InsightMetric) => d.name === "reach")?.values ?? [];
        const impArr: InsightValue[]   = insData.data.find((d: InsightMetric) => d.name === "impressions")?.values ?? [];
        monthlyInsights = reachArr.map((r, i) => ({
          month: new Date(r.end_time).toLocaleDateString("ko-KR", { month: "short" }),
          도달: r.value,
          노출: impArr[i]?.value ?? 0,
        }));
      }
    } catch { /* insights 권한 없으면 빈 배열 */ }

    // 이번달 게시물 집계
    const thisMonth = new Date().getMonth();
    const thisYear  = new Date().getFullYear();
    const thisMonthPosts = media.filter((m) => {
      const d = new Date(m.timestamp);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });
    const totalLikes    = thisMonthPosts.reduce((s, m) => s + (m.like_count ?? 0), 0);
    const totalComments = thisMonthPosts.reduce((s, m) => s + (m.comments_count ?? 0), 0);

    return NextResponse.json({
      connected: true,
      profile,
      media,
      monthlyInsights,
      thisMonth: { posts: thisMonthPosts.length, likes: totalLikes, comments: totalComments },
      tokenExpiresAt: settings["ig_token_expires_at"] ?? null,
    });
  } catch (e) {
    return NextResponse.json({ connected: false, error: String(e) });
  }
}

interface IgMedia { id: string; caption?: string; media_type: string; timestamp: string; like_count?: number; comments_count?: number; thumbnail_url?: string; media_url?: string; permalink?: string; }
interface InsightValue { value: number; end_time: string; }
interface InsightMetric { name: string; values: InsightValue[]; }
interface MonthlyInsight { month: string; 도달: number; 노출: number; }
