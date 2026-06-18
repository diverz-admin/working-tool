import { NextResponse } from "next/server";
import { db } from "@/db";
import { projectCosts, paymentRequests } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

const safeInt = (v: unknown): number | null => {
  if (v == null || v === "" || v === false) return null;
  const n = parseInt(String(v).replace(/,/g, ""), 10);
  return isNaN(n) ? null : n;
};

export async function PUT(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { costs } = await req.json();

    const approvedRequests = await db
      .select({ rowKey: paymentRequests.rowKey })
      .from(paymentRequests)
      .where(and(sql`${paymentRequests.projectId}::text = ${id}`, eq(paymentRequests.status, "승인")));

    // 승인된 costRowId 집합 — 모달 저장 시 isApproved가 false로 덮여씌워지는 것을 방지
    const approvedRowKeys = new Set(approvedRequests.map((r) => r.rowKey).filter(Boolean));

    if (approvedRequests.length > 0) {
      const incomingRowIds = new Set((costs ?? []).map((c: Record<string, unknown>) => c.costRowId).filter(Boolean));
      // DB에 실제 존재하는 costRowId와 비교 — costRowId가 null이었다가 새 UUID가 생성된 경우 오탐 방지
      const currentCosts = await db
        .select({ costRowId: projectCosts.costRowId })
        .from(projectCosts)
        .where(eq(projectCosts.projectId, id));
      const currentRowIds = new Set(currentCosts.map((c) => c.costRowId).filter(Boolean));
      const removed = approvedRequests.filter(
        (r) => r.rowKey && currentRowIds.has(r.rowKey) && !incomingRowIds.has(r.rowKey)
      );
      if (removed.length > 0) {
        return NextResponse.json({ error: "승인된 매입 항목은 삭제할 수 없습니다." }, { status: 409 });
      }
    }

    await db.delete(projectCosts).where(eq(projectCosts.projectId, id));

    if (costs?.length) {
      await db.insert(projectCosts).values(
        costs.map((c: Record<string, unknown>, i: number) => ({
          projectId:       id,
          rowNum:          i + 1,
          costRowId:       c.costRowId ? String(c.costRowId) : null,
          assignee:        c.assignee || null,
          vendor:          c.vendor || null,
          productName:     c.productName || null,
          unitPrice:       safeInt(c.unitPrice),
          quantity:        safeInt(c.quantity),
          supplyPrice:     safeInt(c.supplyPrice),
          tax:             safeInt(c.tax),
          total:           safeInt(c.total),
          purchaseDate:    c.purchaseDate || null,
          invoiceDate:     c.invoiceDate || null,
          workStartDate:   c.workStartDate || null,
          workEndDate:     c.workEndDate || null,
          workCompleted:   Boolean(c.workCompleted),
          // 승인된 항목은 payment_requests 기준으로 강제 true — 모달 저장으로 덮어씌워지지 않도록
          isApproved:      approvedRowKeys.has(String(c.costRowId)) || Boolean(c.isApproved),
          settingDate:     c.settingDate || null,
          invoiceFileUrl:  String(c.invoiceFileUrl || ""),
          invoiceFileName: String(c.invoiceFileName || ""),
        }))
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[costs PUT]", err);
    const message = err instanceof Error ? err.message : "Failed to save costs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
