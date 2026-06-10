import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { keywordTrackers, keywordRankings } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { findShoppingRank } from "@/lib/naver/shopping";
import { findPlaceRank } from "@/lib/naver/place";

// POST /api/reports/rankings
// body: { trackerId?: string }  — 특정 tracker 또는 전체 active tracker 조회
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { trackerId } = body as { trackerId?: string };

    const trackers = await db
      .select()
      .from(keywordTrackers)
      .where(
        trackerId
          ? and(eq(keywordTrackers.id, trackerId), eq(keywordTrackers.isActive, true))
          : eq(keywordTrackers.isActive, true)
      );

    if (trackers.length === 0) {
      return NextResponse.json({ results: [] });
    }

    const results = await Promise.allSettled(
      trackers.map(async (t) => {
        const { rank, totalResults } =
          t.platform === "place"
            ? await findPlaceRank(t.keyword, t.targetType, t.targetValue)
            : await findShoppingRank(t.keyword, t.targetType, t.targetValue);
        const [ranking] = await db
          .insert(keywordRankings)
          .values({ trackerId: t.id, rank, totalResults })
          .returning();
        return { trackerId: t.id, rank, totalResults, rankingId: ranking.id };
      })
    );

    const summary = results.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : { trackerId: trackers[i].id, error: String((r as PromiseRejectedResult).reason) }
    );

    return NextResponse.json({ results: summary });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
