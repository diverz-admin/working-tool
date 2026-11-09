import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { reportMeetings, type MeetingMemberEntry } from "@/db/schema";
import { eq, and, or, isNull, sql, type AnyColumn } from "drizzle-orm";
import { normalizeMemberEntry, normalizeAttendees, MEETING_TEAM_KEYS } from "@/lib/meeting-sections";

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

/**
 * 이름(또는 팀 키) → 기록 묶음을 "넣을 것 / 지울 것"으로 나눈다.
 * 보낸 키만 바뀌고 보내지 않은 키는 DB에 있는 그대로 둔다 — 여러 사람이 각자 자기 칸을 저장해도 서로 덮지 않는다.
 * 내용이 빈 기록을 보내면 그 키를 지운다.
 */
function toPatch(raw: unknown, allowed?: readonly string[], withStats = true) {
  const set: Record<string, MeetingMemberEntry> = {};
  const remove: string[] = [];
  if (!raw || typeof raw !== "object") return { set, remove };
  for (const [rawKey, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = rawKey.trim();
    if (!key || (allowed && !allowed.includes(key))) continue;
    const entry = normalizeMemberEntry(v, withStats);
    if (entry) set[key] = entry; else remove.push(key);
  }
  return { set, remove };
}

type Patch = ReturnType<typeof toPatch>;
const isEmptyPatch = (p: Patch) => !Object.keys(p.set).length && !p.remove.length;

/** 저장된 jsonb 위에 patch를 얹는 SQL — 한 문장으로 끝나 동시에 저장해도 서로의 키를 잃지 않는다. 다 비면 null */
function mergeSql(col: AnyColumn, p: Patch) {
  let expr = sql`coalesce(${col}, '{}'::jsonb)`;
  for (const k of p.remove) expr = sql`(${expr} - ${k}::text)`;
  expr = sql`(${expr} || ${JSON.stringify(p.set)}::jsonb)`;
  return sql`nullif(${expr}, '{}'::jsonb)`;
}

/**
 * 회의록 저장 — 보낸 부분만 바꾼다.
 *   header    { content, authorName, meetingDate, attendees } — 회의 머리(회의일·작성자·참석자)와 결정사항
 *   members   { [이름]: 기록 }   — 영업팀 멤버별 칸. 보낸 사람만 바뀐다
 *   teamNotes { [팀 키]: 기록 }  — 영업관리·마케팅·개발·관리팀 칸. 보낸 팀만 바뀐다
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { year, month, week, team } = body;
  if (!year || !month || !team) return NextResponse.json({ error: "필수값 누락" }, { status: 400 });
  const weekVal: number | null = week ?? null;

  const memberPatch = toPatch(body.members);
  const teamPatch = toPatch(body.teamNotes, MEETING_TEAM_KEYS, false);

  const h = body.header && typeof body.header === "object" ? body.header as Record<string, unknown> : null;
  const header = h ? (() => {
    const attendeeList = normalizeAttendees(h.attendees);
    return {
      content: typeof h.content === "string" ? h.content : "",
      authorName: typeof h.authorName === "string" && h.authorName.trim() ? h.authorName : null,
      // 회의일은 YYYY-MM-DD만 받는다. 비우면 달력 기본 자리로 돌아간다
      meetingDate: typeof h.meetingDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(h.meetingDate) ? h.meetingDate : null,
      attendees: attendeeList.length ? attendeeList : null,
    };
  })() : null;

  if (!header && isEmptyPatch(memberPatch) && isEmptyPatch(teamPatch)) {
    return NextResponse.json({ error: "저장할 내용이 없습니다." }, { status: 400 });
  }

  const result = await db.transaction(async tx => {
    // 같은 회의록을 두 사람이 처음 동시에 저장해도 한 줄만 생기게 묶는다
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`report_meetings|${year}|${month}|${weekVal ?? "M"}|${team}`}))`);

    const existing = await tx.select({ id: reportMeetings.id }).from(reportMeetings)
      .where(and(
        eq(reportMeetings.year, year),
        eq(reportMeetings.month, month),
        eq(reportMeetings.team, team),
        weekVal === null ? isNull(reportMeetings.week) : eq(reportMeetings.week, weekVal),
      )).limit(1);

    if (existing.length > 0) {
      const [row] = await tx.update(reportMeetings).set({
        ...(header ?? {}),
        ...(isEmptyPatch(memberPatch) ? {} : { members: mergeSql(reportMeetings.members, memberPatch) }),
        ...(isEmptyPatch(teamPatch) ? {} : { teamNotes: mergeSql(reportMeetings.teamNotes, teamPatch) }),
        updatedAt: new Date(),
      }).where(eq(reportMeetings.id, existing[0].id)).returning();
      return { row, created: false };
    }

    const [row] = await tx.insert(reportMeetings).values({
      year, month, week: weekVal, team,
      ...(header ?? {}),
      members: Object.keys(memberPatch.set).length ? memberPatch.set : null,
      teamNotes: Object.keys(teamPatch.set).length ? teamPatch.set : null,
    }).returning();
    return { row, created: true };
  });

  return NextResponse.json({ note: result.row }, { status: result.created ? 201 : 200 });
}
