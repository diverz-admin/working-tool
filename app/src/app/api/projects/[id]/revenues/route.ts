import { NextResponse } from "next/server";
import { db } from "@/db";
import { projectRevenues, confirmRequests } from "@/db/schema";
import { eq, and, ne, sql } from "drizzle-orm";

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

      // 결재확인에 기록된 입금확인일·계산서 발행일 — 매출 행 날짜의 원본.
      // 결재 처리 전에 열어 둔 화면에서 저장하면 빈 날짜가 들어와 결재확인이 복사해 둔 날짜를 지운다.
      // 들어온 값이 비어 있으면 원본으로 채운다. (결재 취소 시에는 결재확인 날짜를 먼저 지운 뒤 저장한다)
      const requestDates = await tx
        .select({ rowKey: confirmRequests.rowKey, invoiceDate: confirmRequests.taxInvoiceDate, paymentDate: confirmRequests.depositConfirmedAt })
        .from(confirmRequests)
        .where(and(eq(confirmRequests.projectId, id), ne(confirmRequests.status, "반려")));
      const datesByRowKey = new Map<string, { invoiceDate: string | null; paymentDate: string | null }>();
      for (const r of requestDates) {
        if (!r.rowKey) continue;
        const cur = datesByRowKey.get(r.rowKey) ?? { invoiceDate: null, paymentDate: null };
        datesByRowKey.set(r.rowKey, {
          invoiceDate: cur.invoiceDate || r.invoiceDate || null,
          paymentDate: cur.paymentDate || r.paymentDate || null,
        });
      }
      // "__contract__"(계약금액 일괄) 요청의 날짜는 모든 매출 행에 적용된다
      const contractDates = datesByRowKey.get("__contract__");
      const sourceDate = (rowId: unknown, field: "invoiceDate" | "paymentDate") =>
        (rowId ? datesByRowKey.get(String(rowId))?.[field] : null) || contractDates?.[field] || null;

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
            paymentDate:    r.paymentDate || sourceDate(r.revenueRowId, "paymentDate"),
            invoiceDate:    r.invoiceDate || sourceDate(r.revenueRowId, "invoiceDate"),
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
