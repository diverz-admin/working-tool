import { NextResponse } from "next/server";
import { db } from "@/db";
import { projectRevenues, confirmRequests } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

// 트랜잭션 내부에서 던져 롤백 + 특정 상태코드 응답을 위한 에러
class PutError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function PUT(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { revenues } = await req.json();

    // 동일 revenueRowId 중복 제거 — 동시 저장 경합으로 유입된 중복 행을 저장 시 자동 정리(self-heal)
    const seenRowIds = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dedupedRevenues: any[] = ((revenues ?? []) as any[]).filter((r) => {
      const rid = r.revenueRowId ? String(r.revenueRowId) : "";
      if (!rid) return true;
      if (seenRowIds.has(rid)) return false;
      seenRowIds.add(rid);
      return true;
    });

    // 전체 저장을 프로젝트 단위 advisory lock + 트랜잭션으로 직렬화 →
    // delete-all/insert 가 동시 요청과 뒤섞여 중복 행이 생기는 경합을 원천 차단
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))`);

      const confirmedRequests = await tx
        .select({ rowKey: confirmRequests.rowKey })
        .from(confirmRequests)
        .where(and(eq(confirmRequests.projectId, id), eq(confirmRequests.status, "확인완료")));

      if (confirmedRequests.length > 0) {
        const incomingRowIds = new Set(dedupedRevenues.map((r) => r.revenueRowId).filter(Boolean));
        // DB에 실제로 존재하는 revenueRowId만 가져와서, 현재 DB에 있는 rowKey가 incoming에서 빠진 경우만 차단
        const currentRevenues = await tx
          .select({ revenueRowId: projectRevenues.revenueRowId })
          .from(projectRevenues)
          .where(eq(projectRevenues.projectId, id));
        const currentRowIds = new Set(currentRevenues.map((r) => r.revenueRowId).filter(Boolean));
        const removed = confirmedRequests.filter(
          (r) => r.rowKey && r.rowKey !== "__contract__" && currentRowIds.has(r.rowKey) && !incomingRowIds.has(r.rowKey)
        );
        if (removed.length > 0) {
          throw new PutError("확인완료된 매출 항목은 삭제할 수 없습니다.", 409);
        }
      }

      await tx.delete(projectRevenues).where(eq(projectRevenues.projectId, id));

      if (dedupedRevenues.length) {
        await tx.insert(projectRevenues).values(
          dedupedRevenues.map((r, i: number) => ({
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
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof PutError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to save revenues" }, { status: 500 });
  }
}
