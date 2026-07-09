import { NextResponse } from "next/server";
import { db } from "@/db";
import { projectCosts, paymentRequests } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

// 트랜잭션 내부에서 던져 롤백 + 특정 상태코드 응답을 위한 에러
class PutError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

const safeInt = (v: unknown): number | null => {
  if (v == null || v === "" || v === false) return null;
  const n = parseInt(String(v).replace(/,/g, ""), 10);
  return isNaN(n) ? null : n;
};

export async function PUT(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { costs } = await req.json();

    // 동일 costRowId 중복 제거 — 동시 저장 경합으로 유입된 중복 행을 저장 시 자동 정리(self-heal)
    // costRowId가 없는 행(신규/미연동)은 그대로 유지
    const seenRowIds = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dedupedCosts: any[] = ((costs ?? []) as any[]).filter((c) => {
      const rid = c.costRowId ? String(c.costRowId) : "";
      if (!rid) return true;
      if (seenRowIds.has(rid)) return false;
      seenRowIds.add(rid);
      return true;
    });

    // 전체 저장을 프로젝트 단위 advisory lock + 트랜잭션으로 직렬화 →
    // delete-all/insert 가 동시 요청과 뒤섞여 중복 행이 생기는 경합을 원천 차단
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))`);

      const approvedRequests = await tx
        .select({ rowKey: paymentRequests.rowKey })
        .from(paymentRequests)
        .where(and(eq(paymentRequests.projectId, id), eq(paymentRequests.status, "승인")));

      const approvedRowKeys = new Set(approvedRequests.map((r) => r.rowKey).filter(Boolean));

      // 기존 costs 조회 — 승인 체크 + 파일 URL 보존에 공통 사용
      const existingCosts = await tx
        .select({ costRowId: projectCosts.costRowId, rowNum: projectCosts.rowNum, invoiceFileUrl: projectCosts.invoiceFileUrl, invoiceFileName: projectCosts.invoiceFileName })
        .from(projectCosts)
        .where(eq(projectCosts.projectId, id));

      const currentRowIds = new Set(existingCosts.map((c) => c.costRowId).filter(Boolean));

      if (approvedRequests.length > 0) {
        const incomingRowIds = new Set(dedupedCosts.map((c) => c.costRowId).filter(Boolean));
        const removed = approvedRequests.filter(
          (r) => r.rowKey && currentRowIds.has(r.rowKey) && !incomingRowIds.has(r.rowKey)
        );
        if (removed.length > 0) {
          throw new PutError("승인된 매입 항목은 삭제할 수 없습니다.", 409);
        }
      }

      // invoiceFileUrl 보존 맵 — ensureSaved()에서 파일 필드 생략 시 기존 DB 값 유지
      const fileByRowKey = new Map(existingCosts.filter(c => c.costRowId).map(c => [c.costRowId!, { url: c.invoiceFileUrl ?? "", name: c.invoiceFileName ?? "" }]));
      const fileByRowNum = new Map(existingCosts.map(c => [c.rowNum, { url: c.invoiceFileUrl ?? "", name: c.invoiceFileName ?? "" }]));

      await tx.delete(projectCosts).where(eq(projectCosts.projectId, id));

      if (dedupedCosts.length) {
        await tx.insert(projectCosts).values(
          dedupedCosts.map((c, i: number) => {
            const existing = fileByRowKey.get(String(c.costRowId)) ?? fileByRowNum.get(i + 1);
            return {
              projectId:       id,
              rowNum:          i + 1,
              costRowId:       c.costRowId ? String(c.costRowId) : null,
              sectionLabel:    c.sectionLabel ? String(c.sectionLabel) : null,
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
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof PutError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[costs PUT]", err);
    const message = err instanceof Error ? err.message : "Failed to save costs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
