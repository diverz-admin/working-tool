import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { paymentRequests, appNotifications } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

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

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const [row] = await db.update(paymentRequests).set({
    ...(body.status             !== undefined && { status:             body.status }),
    ...(body.rejectReason       !== undefined && { rejectReason:       body.rejectReason }),
    ...(body.vendorBankAccount  !== undefined && { vendorBankAccount:  body.vendorBankAccount || null }),
  }).where(eq(paymentRequests.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.status === "반려" && row.requester) {
    try {
      await ensureNotificationsTable();
      await db.insert(appNotifications).values({
        recipientName: row.requester,
        fromName:      "프로젝트 매입",
        type:          "payment_rejected",
        title:         "매입 입금요청 반려",
        body:          `'${row.projectName} - ${row.productName}' 매입 요청이 반려되었습니다. 사유: ${body.rejectReason ?? ""}`,
        link:          "/approval/request",
      });
    } catch { /* 알림 실패는 무시 */ }
  }

  return NextResponse.json({ item: row });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await db.delete(paymentRequests).where(eq(paymentRequests.id, id));
  return NextResponse.json({ ok: true });
}
