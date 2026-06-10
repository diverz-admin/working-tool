export type ConfirmStatus = "대기" | "확인완료" | "반려";
export type PaymentStatus = "대기" | "승인" | "반려";

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
  rejectReason?: string;
  projectType?: string | null;
  projectProduct?: string | null;
  campaignNumber?: number | null;
  revenueLines?: { productName: string | null; quantity: number | null; total: number | null; depositAccount: string | null }[];
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
  const url = projectId
    ? `/api/approvals/confirm?projectId=${encodeURIComponent(projectId)}`
    : `/api/approvals/confirm`;
  const res = await fetch(url);
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
  const data = await res.json();
  return data.item as ConfirmRequest;
}

export async function updateConfirmRequest(
  id: string,
  updates: Partial<Pick<ConfirmRequest, "status" | "rejectReason" | "taxInvoiceDate">>
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
}

// ─── 입금요청 ─────────────────────────────────────────────

export async function getPaymentRequests(projectId?: string): Promise<PaymentRequest[]> {
  const url = projectId
    ? `/api/approvals/payment?projectId=${encodeURIComponent(projectId)}`
    : `/api/approvals/payment`;
  const res = await fetch(url);
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
}
