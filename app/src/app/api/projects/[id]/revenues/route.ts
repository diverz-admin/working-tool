import { NextResponse } from "next/server";
import { db } from "@/db";
import { projectRevenues, confirmRequests } from "@/db/schema";
import { eq, and } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { revenues } = await req.json();

    const confirmedRequests = await db
      .select({ rowKey: confirmRequests.rowKey })
      .from(confirmRequests)
      .where(and(eq(confirmRequests.projectId, id), eq(confirmRequests.status, "확인완료")));

    if (confirmedRequests.length > 0) {
      const incomingRowIds = new Set((revenues ?? []).map((r: Record<string, unknown>) => r.revenueRowId).filter(Boolean));
      // DB에 실제로 존재하는 revenueRowId만 가져와서, 현재 DB에 있는 rowKey가 incoming에서 빠진 경우만 차단
      const currentRevenues = await db
        .select({ revenueRowId: projectRevenues.revenueRowId })
        .from(projectRevenues)
        .where(eq(projectRevenues.projectId, id));
      const currentRowIds = new Set(currentRevenues.map((r) => r.revenueRowId).filter(Boolean));
      const removed = confirmedRequests.filter(
        (r) => r.rowKey && r.rowKey !== "__contract__" && currentRowIds.has(r.rowKey) && !incomingRowIds.has(r.rowKey)
      );
      if (removed.length > 0) {
        return NextResponse.json({ error: "확인완료된 매출 항목은 삭제할 수 없습니다." }, { status: 409 });
      }
    }

    await db.delete(projectRevenues).where(eq(projectRevenues.projectId, id));

    if (revenues?.length) {
      await db.insert(projectRevenues).values(
        revenues.map((r: Record<string, unknown>, i: number) => ({
          projectId:      id,
          rowNum:         i + 1,
          revenueRowId:   r.revenueRowId ? String(r.revenueRowId) : null,
          assignee:       r.assignee || null,
          depositAccount: r.depositAccount || null,
          productName:    r.productName || null,
          quantity:       r.quantity ? parseInt(String(r.quantity)) : null,
          supplyPrice:    r.supplyPrice ? parseInt(String(r.supplyPrice)) : null,
          tax:            r.tax ? parseInt(String(r.tax)) : null,
          total:          r.total ? parseInt(String(r.total)) : null,
          paymentDate:    r.paymentDate || null,
          invoiceDate:    r.invoiceDate || null,
          workStartDate:  r.workStartDate || null,
          workEndDate:    r.workEndDate || null,
          completedQty:   r.completedQty ? parseInt(String(r.completedQty)) : 0,
          workCompleted:  Boolean(r.workCompleted),
          sectionLabel:   r.sectionLabel ? String(r.sectionLabel) : null,
          settingDate:    r.settingDate || null,
        }))
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to save revenues" }, { status: 500 });
  }
}
