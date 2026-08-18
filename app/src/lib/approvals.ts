import { fetchJson } from "@/lib/fetch-json";
import { todayStr } from "@/lib/today";

export type ConfirmStatus = "대기" | "확인완료" | "반려";
export type PaymentStatus = "대기" | "승인" | "반려";

// ─── 모듈 레벨 캐시 (전체 목록 조회용) ──────────────────────
interface ApprovalsAll { confirms: ConfirmRequest[]; payments: PaymentRequest[] }
let _cache: { data: ApprovalsAll; ts: number } | null = null;
let _pending: Promise<ApprovalsAll> | null = null;
const APPROVALS_TTL = 30_000;

function fetchAllApprovals(): Promise<ApprovalsAll> {
  if (_cache && Date.now() - _cache.ts < APPROVALS_TTL) return Promise.resolve(_cache.data);
  if (_pending) return _pending;
  // 실패를 빈 목록으로 삼키지 않는다 — 500이 "요청 없음"으로 둔갑하면 안 되므로 그대로 throw
  _pending = fetchJson<{ confirms?: unknown[]; payments?: unknown[] }>("/api/approvals-init")
    .then((d) => {
      const data: ApprovalsAll = { confirms: (d.confirms ?? []) as ConfirmRequest[], payments: (d.payments ?? []) as PaymentRequest[] };
      _cache = { data, ts: Date.now() };
      _pending = null;
      return data;
    })
    .catch(err => { _pending = null; throw err; });
  return _pending;
}

export function invalidateApprovalsCache() { _cache = null; _pending = null; }

// Next.js Link hover가 번들을 prefetch할 때 데이터도 선행 로드
if (typeof window !== "undefined") fetchAllApprovals().catch(() => {});

export interface ConfirmRequest {
  id: string;
  projectId: string;
  rowKey: string;
  clientId?: string;
  assignedTeam?: string | null;
  projectName: string;
  requester: string;
  productName: string;
  description?: string;
  quantity: string;
  amount: string;
  workStartDate: string;
  workEndDate: string;
  clientName: string;
  clientStoreName?: string;
  clientBusinessNumber?: string;
  clientEmail?: string;
  clientIndustry?: string;
  clientCategory?: string;
  dueDate: string;
  depositAccount?: string;
  depositorName?: string;
  /** 요청자가 적은 입금일. 결재자가 확정하는 depositConfirmedAt과 다르다 */
  depositDate?: string;
  requestedAt: string;
  status: ConfirmStatus;
  taxInvoiceDate?: string;
  depositConfirmedAt?: string;
  rejectReason?: string;
  projectType?: string | null;
  projectProduct?: string | null;
  campaignNumber?: number | null;
  campaignName?: string | null;
  revenueLines?: { productName: string | null; quantity: number | null; total: number | null; depositAccount: string | null }[];
  taxExempt?: boolean;
}

export interface PaymentRequest {
  id: string;
  projectId?: string;
  rowKey?: string;
  assignedTeam?: string | null;
  projectName: string;
  requester: string;
  productName: string;
  vendor: string;
  quantity: string;
  amount: string;
  /** 요청 시점의 실제 개당 단가 (면세 행은 합계 역산으로 구할 수 없어 스냅샷) */
  unitPrice?: number | null;
  payDate: string;
  workStartDate?: string;
  workEndDate?: string;
  invoiceFileUrl?: string;
  invoiceFileName?: string;
  vendorBankAccount?: string;
  requestedAt: string;
  status: PaymentStatus;
  rejectReason?: string;
}

// ─── 입금확인요청 ─────────────────────────────────────────

export async function getConfirmRequests(projectId?: string): Promise<ConfirmRequest[]> {
  if (!projectId) {
    const data = await fetchAllApprovals();
    return data.confirms;
  }
  const data = await fetchJson<{ items?: ConfirmRequest[] }>(`/api/approvals/confirm?projectId=${encodeURIComponent(projectId)}`);
  return data.items ?? [];
}

export async function addConfirmRequest(
  item: Omit<ConfirmRequest, "id" | "status" | "requestedAt">
): Promise<ConfirmRequest> {
  const res = await fetch("/api/approvals/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...item, requestedAt: todayStr() }),
  });
  if (!res.ok) throw new Error(`입금확인요청 저장 실패 (${res.status})`);
  invalidateApprovalsCache();
  const data = await res.json();
  return data.item as ConfirmRequest;
}

export async function updateConfirmRequest(
  id: string,
  updates: Partial<Pick<ConfirmRequest, "status" | "rejectReason" | "taxInvoiceDate" | "depositConfirmedAt">>
): Promise<void> {
  const res = await fetch(`/api/approvals/confirm/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`입금확인요청 업데이트 실패 (${res.status})`);
}

export async function deleteConfirmRequest(id: string): Promise<void> {
  await fetch(`/api/approvals/confirm/${id}`, { method: "DELETE" });
  invalidateApprovalsCache();
}

// ─── 입금요청 ─────────────────────────────────────────────

export async function getPaymentRequests(projectId?: string): Promise<PaymentRequest[]> {
  if (!projectId) {
    const data = await fetchAllApprovals();
    return data.payments;
  }
  const data = await fetchJson<{ items?: PaymentRequest[] }>(`/api/approvals/payment?projectId=${encodeURIComponent(projectId)}`);
  return data.items ?? [];
}

export async function addPaymentRequest(
  item: Omit<PaymentRequest, "id" | "status" | "requestedAt">
): Promise<PaymentRequest> {
  const res = await fetch("/api/approvals/payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...item, requestedAt: todayStr() }),
  });
  if (!res.ok) throw new Error(`입금요청 저장 실패 (${res.status})`);
  invalidateApprovalsCache();
  const data = await res.json();
  return data.item as PaymentRequest;
}

export async function updatePaymentRequest(
  id: string,
  updates: Partial<Pick<PaymentRequest, "status" | "rejectReason" | "vendorBankAccount">>
): Promise<void> {
  const res = await fetch(`/api/approvals/payment/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`입금요청 업데이트 실패 (${res.status})`);
}

export async function deletePaymentRequest(id: string): Promise<void> {
  await fetch(`/api/approvals/payment/${id}`, { method: "DELETE" });
  invalidateApprovalsCache();
}
