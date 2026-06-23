import { NextResponse } from "next/server";
import { db } from "@/db";
import { projectCosts, paymentRequests } from "@/db/schema";
import { eq, and } from "drizzle-orm";

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
      .where(and(eq(paymentRequests.projectId, id), eq(paymentRequests.status, "승인")));

    const approvedRowKeys = new Set(approvedRequests.map((r) => r.rowKey).filter(Boolean));

    // 기존 costs 조회 — 승인 체크 + 파일 URL 보존에 공통 사용
    const existingCosts = await db
      .select({ costRowId: projectCosts.costRowId, rowNum: projectCosts.rowNum, invoiceFileUrl: projectCosts.invoiceFileUrl, invoiceFileName: projectCosts.invoiceFileName })
      .from(projectCosts)
      .where(eq(projectCosts.projectId, id));

    const currentRowIds = new Set(existingCosts.map((c) => c.costRowId).filter(Boolean));

    if (approvedRequests.length > 0) {
      const incomingRowIds = new Set((costs ?? []).map((c: Record<string, unknown>) => c.costRowId).filter(Boolean));
      const removed = approvedRequests.filter(
        (r) => r.rowKey && currentRowIds.has(r.rowKey) && !incomingRowIds.has(r.rowKey)
      );
      if (removed.length > 0) {
        return NextResponse.json({ error: "승인된 매입 항목은 삭제할 수 없습니다." }, { status: 409 });
      }
    }

    // invoiceFileUrl 보존 맵 — ensureSaved()에서 파일 필드 생략 시 기존 DB 값 유지
    const fileByRowKey = new Map(existingCosts.filter(c => c.costRowId).map(c => [c.costRowId!, { url: c.invoiceFileUrl ?? "", name: c.invoiceFileName ?? "" }]));
    const fileByRowNum = new Map(existingCosts.map(c => [c.rowNum, { url: c.invoiceFileUrl ?? "", name: c.invoiceFileName ?? "" }]));

    await db.delete(projectCosts).where(eq(projectCosts.projectId, id));

    if (costs?.length) {
      await db.insert(projectCosts).values(
        costs.map((c: Record<string, unknown>, i: number) => {
          const existing = fileByRowKey.get(String(c.costRowId)) ?? fileByRowNum.get(i + 1);
          return {
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
            isApproved:      approvedRowKeys.has(String(c.costRowId)) || Boolean(c.isApproved),
            settingDate:     c.settingDate || null,
            invoiceFileUrl:  String(c.invoiceFileUrl || existing?.url || ""),
            invoiceFileName: String(c.invoiceFileName || existing?.name || ""),
          };
        })
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[costs PUT]", err);
    const message = err instanceof Error ? err.message : "Failed to save costs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
