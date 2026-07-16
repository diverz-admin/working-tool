import { NextResponse } from "next/server";
import { db } from "@/db";
import { clients, keywordTrackers } from "@/db/schema";
import { asc, sql } from "drizzle-orm";

// 리포트 작성용 광고주 목록 (추적 키워드 보유 여부 함께)
export async function GET() {
  const rows = await db
    .select({
      id:           clients.id,
      companyName:  clients.companyName,
      storeName:    clients.storeName,
      trackerCount: sql<number>`count(${keywordTrackers.id})::int`,
    })
    .from(clients)
    .leftJoin(keywordTrackers, sql`${keywordTrackers.clientId} = ${clients.id} and ${keywordTrackers.isActive} = true`)
    .groupBy(clients.id, clients.companyName, clients.storeName)
    .orderBy(asc(clients.companyName));

  return NextResponse.json({ clients: rows });
}
