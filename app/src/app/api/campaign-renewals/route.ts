import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { campaignRenewals } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * 끝나는 캠페인의 연장 협의 상태 — 회의록 ④ 프로젝트 일정에서 한 건씩 고른다.
 * status가 null·빈 값이면 기록을 지운다(아직 정하지 않음).
 */
const STATUSES = ["협의 전", "협의중", "연장", "종료"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 표가 아직 만들어지지 않았을 때(42P01) 원인을 바로 알 수 있게 */
function missingTable(err: unknown) {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "42P01" || e?.cause?.code === "42P01";
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const projectId = typeof body.projectId === "string" ? body.projectId : "";
    const status    = typeof body.status === "string" ? body.status.trim() : "";
    const updatedBy = typeof body.updatedBy === "string" && body.updatedBy.trim() ? body.updatedBy.trim() : null;
    if (!UUID.test(projectId)) return NextResponse.json({ error: "projectId 필요" }, { status: 400 });

    if (!status) {
      await db.delete(campaignRenewals).where(eq(campaignRenewals.projectId, projectId));
      return NextResponse.json({ projectId, status: null });
    }
    if (!(STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ error: `status는 ${STATUSES.join(" / ")} 중 하나` }, { status: 400 });
    }

    await db.insert(campaignRenewals)
      .values({ projectId, status, updatedBy })
      .onConflictDoUpdate({
        target: campaignRenewals.projectId,
        set: { status, updatedBy, updatedAt: new Date() },
      });
    return NextResponse.json({ projectId, status });
  } catch (err) {
    console.error(err);
    if (missingTable(err)) {
      return NextResponse.json({ error: "연장 상태 표(campaign_renewals)가 아직 DB에 없습니다" }, { status: 500 });
    }
    return NextResponse.json({ error: "연장 상태 저장 실패" }, { status: 500 });
  }
}
