import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { clientCare } from "@/db/schema";

/**
 * 업체 한 곳의 만족도·특이사항 저장 (회의록 ③ 영업관리팀).
 *
 * 보낸 칸만 바꾼다 — 만족도만 고르면 특이사항은 그대로 둔다.
 * 만족도를 보내면 확인일(checked_at)을 오늘로 적는다. 미확인(null)으로 되돌리면 확인일도 지운다.
 */
const SATISFACTION = new Set(["만족", "보통", "불만"]);
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const clientId = typeof body?.clientId === "string" ? body.clientId.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(clientId)) return NextResponse.json({ error: "업체가 올바르지 않습니다" }, { status: 400 });

    const hasSat  = body && "satisfaction" in body;
    const hasNote = body && "note" in body;
    if (!hasSat && !hasNote) return NextResponse.json({ error: "바꿀 값이 없습니다" }, { status: 400 });

    let satisfaction: string | null = null;
    if (hasSat) {
      if (body.satisfaction !== null && !SATISFACTION.has(body.satisfaction)) {
        return NextResponse.json({ error: "만족도는 만족·보통·불만 중 하나입니다" }, { status: 400 });
      }
      satisfaction = body.satisfaction;
    }
    const note = hasNote ? String(body.note ?? "").trim().slice(0, 2000) : "";
    const updatedBy = typeof body.updatedBy === "string" && body.updatedBy.trim() ? body.updatedBy.trim() : null;
    const now = new Date();

    const set: Partial<typeof clientCare.$inferInsert> = { updatedBy, updatedAt: now };
    if (hasSat)  { set.satisfaction = satisfaction; set.checkedAt = satisfaction ? today() : null; }
    if (hasNote) set.note = note;

    const [row] = await db.insert(clientCare)
      .values({
        clientId,
        satisfaction: hasSat ? satisfaction : null,
        checkedAt: hasSat && satisfaction ? today() : null,
        note,
        updatedBy,
        updatedAt: now,
      })
      .onConflictDoUpdate({ target: clientCare.clientId, set })
      .returning();

    return NextResponse.json({
      clientId: row.clientId,
      satisfaction: row.satisfaction,
      note: row.note,
      checkedAt: row.checkedAt,
      updatedBy: row.updatedBy,
    });
  } catch (err) {
    console.error(err);
    const code = (err as { code?: string; cause?: { code?: string } })?.code
      ?? (err as { cause?: { code?: string } })?.cause?.code;
    if (code === "42P01") {
      return NextResponse.json({ error: "client_care 테이블이 아직 DB에 없습니다 — 마이그레이션 후 저장할 수 있습니다" }, { status: 503 });
    }
    if (code === "23503") return NextResponse.json({ error: "없는 업체입니다" }, { status: 404 });
    return NextResponse.json({ error: "만족도·특이사항 저장 실패" }, { status: 500 });
  }
}
