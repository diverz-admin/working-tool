import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { keywordTrackers, keywordRankings } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const rankings = await db
      .select()
      .from(keywordRankings)
      .where(eq(keywordRankings.trackerId, id))
      .orderBy(desc(keywordRankings.checkedAt))
      .limit(30);
    return NextResponse.json({ rankings });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { platform, keyword, targetType, targetValue, startDate, endDate } = await req.json();
    if (!keyword?.trim() || !targetType || !targetValue?.trim()) {
      return NextResponse.json({ error: "필수 항목이 없습니다." }, { status: 400 });
    }
    const [tracker] = await db
      .update(keywordTrackers)
      .set({
        platform:    platform === "place" ? "place" : "shopping",
        keyword:     keyword.trim(),
        targetType,
        targetValue: targetValue.trim(),
        startDate:   startDate || null,
        endDate:     endDate   || null,
      })
      .where(eq(keywordTrackers.id, id))
      .returning();
    return NextResponse.json({ tracker });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await db.delete(keywordTrackers).where(eq(keywordTrackers.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
