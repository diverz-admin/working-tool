import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { reportMeetings, type MeetingSections } from "@/db/schema";
import { eq, and, or, isNull } from "drizzle-orm";
import { normalizeMeetingSections, meetingSectionsAreEmpty } from "@/lib/meeting-sections";

/** 클라이언트가 보낸 sections를 4축 × 자유 서술로 정규화한다. 전부 비면 null(구버전과 동일 취급). */
function normalizeSections(raw: unknown): MeetingSections | null {
  if (!raw || typeof raw !== "object") return null;
  const out = normalizeMeetingSections(raw);
  return meetingSectionsAreEmpty(out) ? null : out;
}

/**
 * 해당 월의 회의록과 **직전 월**의 회의록을 함께 돌려준다.
 * 월간회의는 전월 월간회의와, 1주차 주간회의는 전월 마지막 주차와 비교해야 하므로
 * 화면에서 두 달치가 동시에 필요하다.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const year  = parseInt(searchParams.get("year")  ?? "0");
  const month = parseInt(searchParams.get("month") ?? "0");
  if (!year || !month) return NextResponse.json({ notes: [], prevNotes: [] });

  const prevYear  = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;

  const rows = await db.select().from(reportMeetings).where(
    or(
      and(eq(reportMeetings.year, year),     eq(reportMeetings.month, month)),
      and(eq(reportMeetings.year, prevYear), eq(reportMeetings.month, prevMonth)),
    )
  );

  return NextResponse.json({
    notes:     rows.filter(r => r.year === year     && r.month === month),
    prevNotes: rows.filter(r => r.year === prevYear && r.month === prevMonth),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { year, month, week, team, content, authorName } = body;
  if (!year || !month || !team) return NextResponse.json({ error: "필수값 누락" }, { status: 400 });

  const sections = normalizeSections(body.sections);

  // week NULL/숫자 모두 처리 — UNIQUE(year, month, week, team) upsert
  const weekVal = week ?? null;

  const existing = await db.select({ id: reportMeetings.id }).from(reportMeetings)
    .where(
      and(
        eq(reportMeetings.year, year),
        eq(reportMeetings.month, month),
        eq(reportMeetings.team, team),
        weekVal === null ? isNull(reportMeetings.week) : eq(reportMeetings.week, weekVal),
      )
    ).limit(1);

  if (existing.length > 0) {
    const [row] = await db.update(reportMeetings)
      .set({ content: content ?? "", sections, authorName: authorName || null, updatedAt: new Date() })
      .where(eq(reportMeetings.id, existing[0].id))
      .returning();
    return NextResponse.json({ note: row });
  }

  const [row] = await db.insert(reportMeetings).values({
    year, month, week: weekVal, team,
    content: content ?? "",
    sections,
    authorName: authorName || null,
  }).returning();
  return NextResponse.json({ note: row }, { status: 201 });
}
