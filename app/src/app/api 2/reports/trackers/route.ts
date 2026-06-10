import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { keywordTrackers, keywordRankings } from "@/db/schema";
import { eq, desc, asc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const projectId   = req.nextUrl.searchParams.get("projectId");
  const clientId    = req.nextUrl.searchParams.get("clientId");
  const withHistory = req.nextUrl.searchParams.get("withHistory") === "true";
  try {
    if (!projectId && !clientId) return NextResponse.json({ trackers: [] });
    const rows = await db
      .select()
      .from(keywordTrackers)
      .where(
        projectId
          ? eq(keywordTrackers.projectId, projectId)
          : eq(keywordTrackers.clientId, clientId!)
      )
      .orderBy(desc(keywordTrackers.createdAt));

    const withRanks = await Promise.all(
      rows.map(async (t) => {
        if (withHistory) {
          const rankings = await db
            .select()
            .from(keywordRankings)
            .where(eq(keywordRankings.trackerId, t.id))
            .orderBy(asc(keywordRankings.checkedAt))
            .limit(60);
          return { ...t, rankings, latestRanking: rankings[rankings.length - 1] ?? null };
        }
        const latest = await db
          .select()
          .from(keywordRankings)
          .where(eq(keywordRankings.trackerId, t.id))
          .orderBy(desc(keywordRankings.checkedAt))
          .limit(1);
        return { ...t, latestRanking: latest[0] ?? null };
      })
    );

    return NextResponse.json({ trackers: withRanks });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, clientId, platform, keyword, targetType, targetValue, startDate, endDate } = body;

    if (!keyword?.trim() || !targetType || !targetValue?.trim()) {
      return NextResponse.json({ error: "필수 항목이 없습니다." }, { status: 400 });
    }

    const [tracker] = await db
      .insert(keywordTrackers)
      .values({
        projectId:  projectId ?? null,
        clientId:   clientId  ?? null,
        platform:   platform === "place" ? "place" : "shopping",
        keyword:    keyword.trim(),
        targetType,
        targetValue: targetValue.trim(),
        startDate:  startDate || null,
        endDate:    endDate   || null,
      })
      .returning();

    return NextResponse.json({ tracker }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
