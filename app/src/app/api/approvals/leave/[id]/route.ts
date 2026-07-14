import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { internalLeaveRequests, appNotifications } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { calcLeaveDays, fmtDays, fmtPeriod, type LeaveItem, type LeaveType } from "@/lib/leave";
import { ensureLeaveSchema, loadLeaveBalances } from "@/lib/leaveDb";

async function ensureNotificationsTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS app_notifications (
      id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      recipient_name TEXT         NOT NULL,
      from_name      TEXT         NOT NULL,
      type           TEXT         NOT NULL,
      title          TEXT         NOT NULL,
      body           TEXT         NOT NULL,
      link           TEXT,
      is_read        BOOLEAN      NOT NULL DEFAULT false,
      created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
    )
  `);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  await ensureLeaveSchema();

  const [current] = await db
    .select()
    .from(internalLeaveRequests)
    .where(eq(internalLeaveRequests.id, id));
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // 종류·기간이 바뀌면 차감 일수를 다시 계산한다 (클라이언트 값은 신뢰하지 않음)
  const leaveType = (body.leaveType ?? current.leaveType) as LeaveType;
  const startDate = String(body.startDate ?? current.startDate);
  const endDate   = body.endDate !== undefined ? (body.endDate || null) : current.endDate;

  if (endDate && endDate < startDate) {
    return NextResponse.json({ error: "종료일은 시작일보다 빠를 수 없습니다." }, { status: 400 });
  }
  const leaveDays = calcLeaveDays(leaveType, startDate, endDate);

  // 승인 시 잔여 연차 초과 여부 확인 — 부족하면 관리자가 확인 후 force로 재요청
  if (body.status === "승인" && leaveDays > 0 && !body.force) {
    const items = (await db
      .select()
      .from(internalLeaveRequests)
      .orderBy(desc(internalLeaveRequests.createdAt))) as unknown as LeaveItem[];
    const balances  = await loadLeaveBalances(items);
    const remaining = balances[current.requester]?.remaining ?? 0;

    if (leaveDays > remaining) {
      return NextResponse.json(
        {
          error: `${current.requester} 님의 잔여 연차가 부족합니다. (잔여 ${fmtDays(remaining)}일 / 신청 ${fmtDays(leaveDays)}일)`,
          insufficient: true,
          remaining,
          required: leaveDays,
        },
        { status: 409 },
      );
    }
  }

  const [item] = await db
    .update(internalLeaveRequests)
    .set({
      ...(body.status       !== undefined && { status:       body.status }),
      ...(body.rejectReason !== undefined && { rejectReason: body.rejectReason }),
      ...(body.title        !== undefined && { title:        body.title }),
      ...(body.requester    !== undefined && { requester:    body.requester }),
      ...(body.requestedAt  !== undefined && { requestedAt:  body.requestedAt }),
      ...(body.note         !== undefined && { note:         body.note }),
      leaveType,
      startDate,
      endDate,
      leaveDays,
      updatedAt: new Date(),
    })
    .where(eq(internalLeaveRequests.id, id))
    .returning();

  // 승인 또는 반려 시 요청자에게 알림 발송
  if (item && (body.status === "승인" || body.status === "반려")) {
    try {
      await ensureNotificationsTable();
      const isApproved = body.status === "승인";
      const period     = fmtPeriod(item.startDate, item.endDate);
      await db.insert(appNotifications).values({
        recipientName: item.requester,
        fromName:      "휴가 결재",
        type:          isApproved ? "leave_approved" : "leave_rejected",
        title:         isApproved ? "휴가 승인" : "휴가 반려",
        body:          isApproved
          ? `'${item.title}' 휴가가 승인되었습니다. (${period})`
          : `'${item.title}' 휴가가 반려되었습니다. 사유: ${body.rejectReason ?? ""}`,
        link: "/approval/internal/leave",
      });
    } catch { /* 알림 실패는 무시 */ }
  }

  return NextResponse.json({ item });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ensureLeaveSchema();
  await db.delete(internalLeaveRequests).where(eq(internalLeaveRequests.id, id));
  return NextResponse.json({ ok: true });
}
