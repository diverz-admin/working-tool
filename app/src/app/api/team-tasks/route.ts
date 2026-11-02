import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { teamTasks } from "@/db/schema";
import { and, asc, eq, gte, lte } from "drizzle-orm";

/**
 * 회의록 마케팅팀·개발팀의 날짜별 할 일.
 * 채널·분류 없이 "그 날짜에 꼭 해야 할 일"만 적는다.
 */
const TEAM_TASK_TEAMS = ["marketing", "dev"] as const;
type TeamTaskTeam = (typeof TEAM_TASK_TEAMS)[number];

const isTeam = (v: unknown): v is TeamTaskTeam =>
  typeof v === "string" && (TEAM_TASK_TEAMS as readonly string[]).includes(v);

/** YYYY-MM-DD 이고 실제로 있는 날짜인지 */
function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

const TITLE_MAX = 200;

/** 비었거나 너무 길면 오류 문구 */
function cleanTitle(v: unknown): { title: string } | { error: string } {
  const t = typeof v === "string" ? v.trim() : "";
  if (!t) return { error: "할 일 내용을 입력해주세요." };
  if (t.length > TITLE_MAX) return { error: `할 일은 ${TITLE_MAX}자 이내로 입력해주세요.` };
  return { title: t };
}

const cleanName = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 50) : null);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const team = searchParams.get("team");
    const from = searchParams.get("from");
    const to   = searchParams.get("to");
    if (!isTeam(team)) return NextResponse.json({ error: "team은 marketing 또는 dev" }, { status: 400 });
    if (!isIsoDate(from) || !isIsoDate(to) || from > to) {
      return NextResponse.json({ error: "from·to 날짜(YYYY-MM-DD)가 올바르지 않습니다." }, { status: 400 });
    }

    const tasks = await db.select().from(teamTasks)
      .where(and(eq(teamTasks.team, team), gte(teamTasks.taskDate, from), lte(teamTasks.taskDate, to)))
      .orderBy(asc(teamTasks.taskDate), asc(teamTasks.createdAt));

    return NextResponse.json({ tasks });
  } catch (err) {
    console.error("[GET /api/team-tasks]", err);
    return NextResponse.json({ error: "할 일 조회 실패" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
    if (!isTeam(body.team)) return NextResponse.json({ error: "team은 marketing 또는 dev" }, { status: 400 });
    if (!isIsoDate(body.taskDate)) return NextResponse.json({ error: "날짜(YYYY-MM-DD)가 올바르지 않습니다." }, { status: 400 });
    const t = cleanTitle(body.title);
    if ("error" in t) return NextResponse.json({ error: t.error }, { status: 400 });

    const [task] = await db.insert(teamTasks).values({
      team:      body.team,
      taskDate:  body.taskDate,
      title:     t.title,
      assignee:  cleanName(body.assignee),
      createdBy: cleanName(body.createdBy),
    }).returning();

    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/team-tasks]", err);
    return NextResponse.json({ error: "할 일 저장 실패" }, { status: 500 });
  }
}
