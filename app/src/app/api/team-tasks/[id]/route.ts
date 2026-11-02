import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { teamTasks } from "@/db/schema";
import { eq } from "drizzle-orm";

// route.ts에는 HTTP 메서드 외의 export를 둘 수 없어 검사 함수를 여기에도 둔다 — 두 곳 규칙을 같게 유지할 것
function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

const TITLE_MAX = 200;

function cleanTitle(v: unknown): { title: string } | { error: string } {
  const t = typeof v === "string" ? v.trim() : "";
  if (!t) return { error: "할 일 내용을 입력해주세요." };
  if (t.length > TITLE_MAX) return { error: `할 일은 ${TITLE_MAX}자 이내로 입력해주세요.` };
  return { title: t };
}

const cleanName = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 50) : null);

type Params = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 바꿀 칸만 보낸다 — { title?, done?, taskDate?, assignee? } */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "잘못된 id" }, { status: 400 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

    const set: Partial<typeof teamTasks.$inferInsert> = {};
    if ("title" in body) {
      const t = cleanTitle(body.title);
      if ("error" in t) return NextResponse.json({ error: t.error }, { status: 400 });
      set.title = t.title;
    }
    if ("done" in body) {
      if (typeof body.done !== "boolean") return NextResponse.json({ error: "done은 true/false" }, { status: 400 });
      set.done = body.done;
    }
    if ("taskDate" in body) {
      if (!isIsoDate(body.taskDate)) return NextResponse.json({ error: "날짜(YYYY-MM-DD)가 올바르지 않습니다." }, { status: 400 });
      set.taskDate = body.taskDate;
    }
    if ("assignee" in body) set.assignee = cleanName(body.assignee);
    if (!Object.keys(set).length) return NextResponse.json({ error: "바꿀 내용이 없습니다." }, { status: 400 });

    const [task] = await db.update(teamTasks).set({ ...set, updatedAt: new Date() })
      .where(eq(teamTasks.id, id)).returning();
    if (!task) return NextResponse.json({ error: "할 일을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ task });
  } catch (err) {
    console.error("[PATCH /api/team-tasks/:id]", err);
    return NextResponse.json({ error: "할 일 수정 실패" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "잘못된 id" }, { status: 400 });
    await db.delete(teamTasks).where(eq(teamTasks.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/team-tasks/:id]", err);
    return NextResponse.json({ error: "할 일 삭제 실패" }, { status: 500 });
  }
}
