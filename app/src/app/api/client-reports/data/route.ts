import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { clients, clientReports, keywordTrackers, keywordRankings } from "@/db/schema";
import { and, eq, gte, lt, inArray, asc } from "drizzle-orm";

const PLATFORM_LABEL: Record<string, string> = { shopping: "네이버 쇼핑", place: "네이버 플레이스" };

function ymd(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const clientId = searchParams.get("clientId") ?? "";
  const year  = parseInt(searchParams.get("year")  ?? "0");
  const month = parseInt(searchParams.get("month") ?? "0");
  if (!clientId || !year || !month) {
    return NextResponse.json({ error: "필수값 누락" }, { status: 400 });
  }

  // 광고주
  const [client] = await db
    .select({ id: clients.id, companyName: clients.companyName, storeName: clients.storeName, industry: clients.industry })
    .from(clients).where(eq(clients.id, clientId));
  if (!client) return NextResponse.json({ error: "광고주를 찾을 수 없습니다." }, { status: 404 });

  // 저장된 리포트(수기 내용)
  const [report] = await db.select().from(clientReports)
    .where(and(eq(clientReports.clientId, clientId), eq(clientReports.year, year), eq(clientReports.month, month)))
    .limit(1);

  // 키워드 순위 성과 집계 ─────────────────────────────────
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to   = new Date(Date.UTC(year, month, 1));

  const trackers = await db.select().from(keywordTrackers).where(eq(keywordTrackers.clientId, clientId));
  const trackerIds = trackers.map(t => t.id);

  let rankings: { trackerId: string; rank: number | null; checkedAt: Date }[] = [];
  if (trackerIds.length) {
    rankings = await db
      .select({ trackerId: keywordRankings.trackerId, rank: keywordRankings.rank, checkedAt: keywordRankings.checkedAt })
      .from(keywordRankings)
      .where(and(inArray(keywordRankings.trackerId, trackerIds), gte(keywordRankings.checkedAt, from), lt(keywordRankings.checkedAt, to)))
      .orderBy(asc(keywordRankings.checkedAt));
  }

  // trackerId -> 시간순 랭킹
  const byTracker = new Map<string, { date: string; rank: number | null }[]>();
  for (const r of rankings) {
    const arr = byTracker.get(r.trackerId) ?? [];
    arr.push({ date: ymd(new Date(r.checkedAt)), rank: r.rank });
    byTracker.set(r.trackerId, arr);
  }

  const keywordItems = trackers
    .map(t => {
      const trend = byTracker.get(t.id) ?? [];
      if (trend.length === 0) return null; // 해당 월 데이터 없음
      const startRank = trend[0].rank;
      const endRank   = trend[trend.length - 1].rank;
      const ranked    = trend.map(p => p.rank).filter((r): r is number => r != null);
      const bestRank  = ranked.length ? Math.min(...ranked) : null;

      // 변화 판정 (순위는 낮을수록 좋음)
      let status: "up" | "down" | "same" | "new" | "out" | "none" = "none";
      let delta = 0;
      if (startRank != null && endRank != null) {
        delta = startRank - endRank; // +면 상승
        status = delta > 0 ? "up" : delta < 0 ? "down" : "same";
      } else if (startRank == null && endRank != null) {
        status = "new";  // 순위권 진입
      } else if (startRank != null && endRank == null) {
        status = "out";  // 순위권 이탈
      }

      return {
        id: t.id,
        keyword: t.keyword,
        platform: t.platform,
        platformLabel: PLATFORM_LABEL[t.platform] ?? t.platform,
        startRank, endRank, bestRank, status, delta,
        trend,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    // 현재 순위 좋은 것 우선 (null은 뒤로)
    .sort((a, b) => (a.endRank ?? 9999) - (b.endRank ?? 9999));

  const endRanks   = keywordItems.map(k => k.endRank).filter((r): r is number => r != null);
  const startRanks = keywordItems.map(k => k.startRank).filter((r): r is number => r != null);
  const summary = {
    trackerCount:  keywordItems.length,
    top10Count:    keywordItems.filter(k => k.endRank != null && k.endRank <= 10).length,
    improvedCount: keywordItems.filter(k => k.status === "up" || k.status === "new").length,
    avgStart: startRanks.length ? Math.round(startRanks.reduce((a, b) => a + b, 0) / startRanks.length) : null,
    avgEnd:   endRanks.length   ? Math.round(endRanks.reduce((a, b) => a + b, 0) / endRanks.length)   : null,
  };

  return NextResponse.json({
    client,
    report: report ?? null,
    keyword: { items: keywordItems, summary },
  });
}
