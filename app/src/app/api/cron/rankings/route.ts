import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { keywordTrackers, keywordRankings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { findShoppingRank } from "@/lib/naver/shopping";
import { findPlaceRank } from "@/lib/naver/place";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  // Vercel Cron 요청 인증
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const trackers = await db
    .select()
    .from(keywordTrackers)
    .where(eq(keywordTrackers.isActive, true));

  if (trackers.length === 0) {
    return NextResponse.json({ ok: true, message: "활성 트래커 없음", results: [] });
  }

  const results = await Promise.allSettled(
    trackers.map(async (t) => {
      const result =
        t.platform === "place"
          ? await findPlaceRank(t.keyword, t.targetType, t.targetValue)
          : await findShoppingRank(t.keyword, t.targetType, t.targetValue);

      const { rank, totalResults } = result;
      const notFound = "notFound" in result ? result.notFound : false;

      const [ranking] = await db
        .insert(keywordRankings)
        .values({ trackerId: t.id, rank, totalResults })
        .returning();

      return { trackerId: t.id, keyword: t.keyword, rank, totalResults, notFound, rankingId: ranking.id };
    })
  );

  const summary = results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { trackerId: trackers[i].id, keyword: trackers[i].keyword, error: String((r as PromiseRejectedResult).reason) }
  );

  const succeeded = summary.filter((r) => !("error" in r)).length;
  const failed    = summary.filter((r) => "error" in r).length;

  console.log(`[cron/rankings] ${new Date().toISOString()} — 총 ${trackers.length}개, 성공 ${succeeded}, 실패 ${failed}`);

  return NextResponse.json({ ok: true, ran: trackers.length, succeeded, failed, results: summary });
}
