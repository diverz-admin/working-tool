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
  _pending = fetch("/api/approvals-init")
    .then(r => r.json())
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
if (typeof window !== "undefined") fetchAllApprovals();

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
  requestedAt: string;
  status: ConfirmStatus;
  taxInvoiceDate?: string;
  depositConfirmedAt?: string;
  rejectReason?: string;
  projectType?: string | null;
  projectProduct?: string | null;
  campaignNumber?: number | null;
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
  const res = await fetch(`/api/approvals/confirm?projectId=${encodeURIComponent(projectId)}`);
  const data = await res.json();
  return (data.items ?? []) as ConfirmRequest[];
}

export async function addConfirmRequest(
  item: Omit<ConfirmRequest, "id" | "status" | "requestedAt">
): Promise<ConfirmRequest> {
  const res = await fetch("/api/approvals/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...item, requestedAt: new Date().toISOString().slice(0, 10) }),
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
  const res = await fetch(`/api/approvals/payment?projectId=${encodeURIComponent(projectId)}`);
  const data = await res.json();
  return (data.items ?? []) as PaymentRequest[];
}

export async function addPaymentRequest(
  item: Omit<PaymentRequest, "id" | "status" | "requestedAt">
): Promise<PaymentRequest> {
  const res = await fetch("/api/approvals/payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...item, requestedAt: new Date().toISOString().slice(0, 10) }),
  });
  if (!res.ok) throw new Error(`입금요청 저장 실패 (${res.status})`);
  invalidateApprovalsCache();
  const data = await res.json();
  return data.item as PaymentRequest;
}

export async function updatePaymentRequest(
  id: string,
  updates: Partial<Pick<PaymentRequest, "status" | "rejectReason">>
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
