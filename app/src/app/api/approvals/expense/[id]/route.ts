import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { internalExpenseRequests, appNotifications } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

async function ensureExpenseCategoryColumn() {
  await db.execute(sql`
    ALTER TABLE internal_expense_requests
    ADD COLUMN IF NOT EXISTS expense_category TEXT
  `);
}

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

  await ensureExpenseCategoryColumn();

  const [item] = await db
    .update(internalExpenseRequests)
    .set({
      ...(body.status          !== undefined && { status:          body.status }),
      ...(body.rejectReason    !== undefined && { rejectReason:    body.rejectReason }),
      ...(body.title           !== undefined && { title:           body.title }),
      ...(body.assignedTeam    !== undefined && { assignedTeam:    body.assignedTeam }),
      ...(body.requestedAt     !== undefined && { requestedAt:     body.requestedAt }),
      ...(body.amount          !== undefined && { amount:          body.amount }),
      ...(body.content         !== undefined && { content:         body.content }),
      ...(body.attachments     !== undefined && { attachments:     body.attachments }),
      ...(body.expenseCategory !== undefined && { expenseCategory: body.expenseCategory }),
      updatedAt: new Date(),
    })
    .where(eq(internalExpenseRequests.id, id))
    .returning();

  // 승인 또는 반려 시 요청자에게 알림 발송
  if (item && (body.status === "승인" || body.status === "반려")) {
    try {
      await ensureNotificationsTable();
      const isApproved = body.status === "승인";
      await db.insert(appNotifications).values({
        recipientName: item.requester,
        fromName:      "내부지출 결재",
        type:          isApproved ? "expense_approved" : "expense_rejected",
        title:         isApproved ? "내부지출 승인" : "내부지출 반려",
        body:          isApproved
          ? `'${item.title}' 결재가 승인되었습니다.`
          : `'${item.title}' 결재가 반려되었습니다. 사유: ${body.rejectReason ?? ""}`,
        link: "/approval/internal/expense",
      });
    } catch { /* 알림 실패는 무시 */ }
  }

  return NextResponse.json({ item });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.delete(internalExpenseRequests).where(eq(internalExpenseRequests.id, id));
  return NextResponse.json({ ok: true });
}
