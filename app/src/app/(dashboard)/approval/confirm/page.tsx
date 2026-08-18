"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { useFileSrc, isImageValue } from "@/lib/storage";
import { fetchJson } from "@/lib/fetch-json";
import PeriodFilter from "@/components/filters/PeriodFilter";

// 사업자등록증(스토리지 경로/레거시 data:) 미리보기
function BizRegView({ value }: { value: string }) {
  const src = useFileSrc(value);
  const isImg = isImageValue(value);
  if (!src) return <p className="text-xs" style={{ color: "#CBD5E1" }}>불러오는 중…</p>;
  if (isImg) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="사업자등록증" className="w-full rounded-lg" />;
  }
  return (
    <a href={src} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-2 text-sm font-semibold" style={{ color: "#3182F6" }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      사업자등록증 보기
    </a>
  );
}
import {
  type ConfirmRequest, type ConfirmStatus,
  getConfirmRequests, updateConfirmRequest, deleteConfirmRequest,
} from "@/lib/approvals";
import { invalidateProjectCache } from "@/components/projects/ProjectModal";
import { teamBadgeStyle } from "@/lib/teams";
import { todayStr } from "@/lib/today";

// ─── 공급자 고정 정보 ─────────────────────────────────────────
const SUPPLIER = { companyName: "주식회사 다이버즈", businessNumber: "174-88-03266" };

const STATUS_STYLE: Record<ConfirmStatus, { bg: string; color: string; border: string }> = {
  대기:     { bg: "rgba(234,179,8,0.1)",  color: "#CA8A04", border: "rgba(234,179,8,0.25)" },
  확인완료: { bg: "rgba(16,185,129,0.1)", color: "#059669", border: "rgba(16,185,129,0.25)" },
  반려:     { bg: "rgba(239,68,68,0.1)",  color: "#DC2626", border: "rgba(239,68,68,0.25)" },
};

// ─── 고객사 DB 조회 ───────────────────────────────────────────
type ClientRow = Record<string, unknown>;

async function fetchClients(clientIds: string[]): Promise<Map<string, ClientRow>> {
  const map = new Map<string, ClientRow>();
  await Promise.all(
    clientIds.map(async (id) => {
      try {
        const res = await fetch(`/api/clients/${id}`);
        const { client } = await res.json();
        if (client) map.set(id, client);
      } catch {}
    })
  );
  return map;
}

// ─── 홈택스 엑셀 생성 ─────────────────────────────────────────
const HOMETAX_HEADERS = [
  "세금계산서 유형","영수/청구","작성일자",
  "공급자 사업자등록번호","공급자 종사업장번호",
  "공급받는자 구분","공급받는자 사업자등록번호","공급받는자 종사업장번호",
  "공급받는자 상호","공급받는자 성명","공급받는자 사업장주소",
  "공급받는자 업태","공급받는자 종목",
  "공급받는자 이메일1","공급받는자 이메일2",
  "공급가액 합계","세액 합계","비고",
  "품목1 월","품목1 일","품목1 품명","품목1 규격",
  "품목1 수량","품목1 단가","품목1 공급가액","품목1 세액","품목1 비고",
];

function buildRows(items: ConfirmRequest[], clientMap: Map<string, ClientRow>) {
  return items.map((item) => {
    const client = item.clientId ? clientMap.get(item.clientId) : null;

    const raw    = parseInt(item.amount.replace(/[₩,\s]/g, "")) || 0;
    const supply = Math.round(raw / 1.1);
    const tax    = raw - supply;
    const qty    = parseInt(item.quantity) || 1;
    const unit   = qty > 0 ? Math.round(supply / qty) : supply;
    const date   = (item.taxInvoiceDate || item.dueDate)?.replace(/-/g, "") || todayStr().replace(/-/g, "");

    const bizNum    = ((client?.businessNumber  ?? item.clientBusinessNumber ?? "") as string).replace(/-/g, "");
    const corpName  = (client?.companyName       ?? item.clientName)           as string;
    const repName   = (client?.advertiserName    ?? "")                         as string;
    const industry  = (client?.industry          ?? item.clientIndustry  ?? "") as string;
    const category  = (client?.category          ?? item.clientCategory  ?? "") as string;
    const email     = (client?.contactEmail      ?? item.clientEmail     ?? "") as string;

    return [
      1, 2, date,
      SUPPLIER.businessNumber.replace(/-/g, ""), "",
      1, bizNum, "",
      corpName, repName, "",
      industry, category,
      email, "",
      supply, tax, item.projectName,
      parseInt(date.slice(4, 6)), parseInt(date.slice(6, 8)),
      item.productName, "", qty, unit, supply, tax, "",
    ];
  });
}

function exportExcel(items: ConfirmRequest[], clientMap: Map<string, ClientRow>, label: string) {
  const ws = XLSX.utils.aoa_to_sheet([HOMETAX_HEADERS, ...buildRows(items, clientMap)]);
  ws["!cols"] = HOMETAX_HEADERS.map((_, i) => ({ wch: i < 3 ? 14 : i < 18 ? 20 : 12 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "세금계산서");
  XLSX.writeFile(wb, `세금계산서_${label}_${todayStr()}.xlsx`);
}

// ─── 매출행 날짜 업데이트 공통 헬퍼 ─────────────────────────
async function updateRevenueField(
  projectId: string | null | undefined,
  rowKey: string | null | undefined,
  field: "paymentDate" | "invoiceDate",
  value: string
) {
  if (!rowKey) return;

  let pid = projectId || null;

  // projectId가 없으면 rowKey로 프로젝트 검색
  if (!pid) {
    try {
      const r = await fetch(`/api/projects/by-revenue?rowKey=${encodeURIComponent(rowKey)}`);
      if (r.ok) pid = (await r.json()).projectId ?? null;
    } catch {}
  }
  if (!pid) return;

  try {
    const r = await fetch(`/api/projects/${pid}`);
    if (!r.ok) return;
    const { revenues } = await r.json();
    if (!revenues) return;

    // "__contract__"는 계약금액 일괄 요청 — 모든 매출 행에 적용
    const updated = rowKey === "__contract__"
      ? revenues.map((rev: Record<string, unknown>) => ({ ...rev, [field]: value }))
      : revenues.map((rev: Record<string, unknown>) =>
          rev.revenueRowId === rowKey ? { ...rev, [field]: value } : rev
        );

    await fetch(`/api/projects/${pid}/revenues`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revenues: updated }),
    });
  } catch {}
}

// ─── 메인 페이지 ─────────────────────────────────────────────
export default function ConfirmPage() {
  const router = useRouter();
  const [items, setItems]               = useState<ConfirmRequest[]>([]);
  const [error, setError]               = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<ConfirmStatus | "전체">("대기");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selected, setSelected]         = useState<ConfirmRequest | null>(null);
  const [issuing, setIssuing]           = useState<string | null>(null);
  const [rejecting, setRejecting]       = useState(false);
  const [exporting, setExporting]       = useState(false);
  const [rejectTarget, setRejectTarget] = useState<ConfirmRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [cancelTarget,  setCancelTarget]  = useState<ConfirmRequest | null>(null);
  const [cancelling,    setCancelling]    = useState(false);
  const [confirmDate,   setConfirmDate]   = useState(todayStr);
  /**
   * 요청을 열 때 입금완료 날짜를 요청자가 적은 입금일로 맞춘다.
   * 대개 그 날짜가 맞고, 통장과 다르면 결재자가 고치면 된다 — 매번 손으로 넣게 두면 오늘 날짜로 굳는다.
   */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (selected) setConfirmDate(selected.depositDate || todayStr());
  }, [selected]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const [issueDate,     setIssueDate]     = useState(todayStr());
  const [approvedToast,   setApprovedToast]   = useState(false);
  const [clientBizRegUrl, setClientBizRegUrl] = useState<string | null>(null);

  const showApprovedToast = useCallback(() => {
    setApprovedToast(true);
    setTimeout(() => setApprovedToast(false), 5000);
  }, []);

  const load = useCallback(() => {
    setError(null);
    getConfirmRequests().then((data) => {
      const orphaned = data.filter(i =>
        i.status === "대기" &&
        Boolean(i.depositConfirmedAt) &&
        (Boolean(i.taxInvoiceDate) || Boolean(i.taxExempt) || i.depositAccount === "전재민")
      );
      if (orphaned.length > 0) {
        const orphanIds = new Set(orphaned.map(o => o.id));
        // 화면은 즉시 보정된 상태로 렌더하고, 서버 반영은 백그라운드로 — 로드 블로킹 제거
        setItems(data.map(i =>
          orphanIds.has(i.id) ? { ...i, status: "확인완료" as ConfirmStatus } : i
        ));
        Promise.all(orphaned.map(i => updateConfirmRequest(i.id, { status: "확인완료" }))).catch(() => {});
      } else {
        setItems(data);
      }
    })
    // 실패를 빈 목록으로 렌더하지 않는다 — "요청 없음"으로 오인되면 안 되므로 오류를 표시
    .catch((e: Error) => { setError(e.message); setItems([]); });
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (selected) {
      const today = todayStr();
      setConfirmDate(today);
      setIssueDate(today);
    }
  }, [selected?.id]);

  useEffect(() => {
    setClientBizRegUrl(null);
    if (selected?.clientId) {
      fetchJson<{ client?: { bizRegFileUrl?: string | null } }>(`/api/clients/${selected.clientId}`)
        .then(({ client }) => setClientBizRegUrl(client?.bizRegFileUrl ?? null))
        .catch(() => {});
    }
  }, [selected?.id, selected?.clientId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const filterDates = useMemo(() => items.map((i) => i.requestedAt.slice(0, 10)), [items]);

  const filtered = useMemo(() => items.filter((i) =>
    (filterStatus === "전체" || i.status === filterStatus) &&
    (selectedMonth === null || i.requestedAt.startsWith(selectedMonth)) &&
    (selectedDate === null || i.requestedAt.slice(0, 10) === selectedDate)
  ), [items, filterStatus, selectedMonth, selectedDate]);

  const grouped = useMemo(() => {
    const map = new Map<string, ConfirmRequest[]>();
    filtered.forEach((i) => {
      const key = i.requestedAt.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(i);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  // 계산서 미발행 항목 (대기·확인완료 모두 포함, 반려·taxExempt 제외)
  const pendingInvoice = useMemo(() => {
    const base = items.filter((i) => !i.taxInvoiceDate && i.status !== "반려" && !i.taxExempt);
    if (selectedDate) return base.filter((i) => i.requestedAt.slice(0, 10) === selectedDate);
    if (selectedMonth) return base.filter((i) => i.requestedAt.startsWith(selectedMonth));
    return base;
  }, [items, selectedMonth, selectedDate]);

  // 엑셀 내보내기 대상 = 계산서 미발행 항목과 동일
  const invoiceExportItems = pendingInvoice;

  const scopedItems = useMemo(() => items.filter((i) =>
    (selectedMonth === null || i.requestedAt.startsWith(selectedMonth)) &&
    (selectedDate === null || i.requestedAt.slice(0, 10) === selectedDate)
  ), [items, selectedMonth, selectedDate]);

  const counts = {
    전체:     scopedItems.length,
    대기:     scopedItems.filter((i) => i.status === "대기").length,
    확인완료: scopedItems.filter((i) => i.status === "확인완료").length,
    반려:     scopedItems.filter((i) => i.status === "반려").length,
  };

  async function updateStatus(ids: string[], status: ConfirmStatus, date?: string) {
    const targets = items.filter((i) => ids.includes(i.id));
    setItems((prev) => prev.map((i) => ids.includes(i.id) ? { ...i, status } : i));
    await Promise.all(ids.map((id) => updateConfirmRequest(id, { status })));
    setSelected(null);

    if (status === "확인완료") {
      const dateStr = date || todayStr();
      await Promise.all(
        targets.map((item) => updateRevenueField(item.projectId, item.rowKey, "paymentDate", dateStr))
      );
      showApprovedToast();
    }
  }

  async function confirmReject() {
    if (!rejectTarget || rejecting) return;
    setRejecting(true);
    const reason = rejectReason.trim() || undefined;
    setItems((prev) => prev.map((i) =>
      i.id === rejectTarget.id ? { ...i, status: "반려" as ConfirmStatus, rejectReason: reason } : i
    ));
    await updateConfirmRequest(rejectTarget.id, { status: "반려", rejectReason: reason });
    setSelected(null); setRejectTarget(null); setRejectReason(""); setRejecting(false);
  }

  async function isRevenueStillLinked(item: ConfirmRequest): Promise<boolean> {
    if (!item.projectId) return false;
    try {
      const res = await fetch(`/api/projects/${item.projectId}`);
      const { revenues } = await res.json();
      if (!revenues) return false;
      return revenues.some((r: Record<string, unknown>) => {
        const key = `${r.productName ?? ""}|${r.paymentDate ?? ""}|${r.total ?? ""}`;
        return key === item.rowKey || String(r.productName ?? "") === item.productName;
      });
    } catch { return false; }
  }

  async function handleIssueComplete(item: ConfirmRequest, date?: string) {
    setIssuing(item.id);
    const dateStr = date || todayStr();
    // 입금완료 + 계산서발행 모두 완료 시 확인완료 전환
    const moveToDone = item.status === "대기" && Boolean(item.depositConfirmedAt);
    const updates: Parameters<typeof updateConfirmRequest>[1] = { taxInvoiceDate: dateStr };
    if (moveToDone) updates.status = "확인완료";
    await Promise.all([
      updateRevenueField(item.projectId, item.rowKey, "invoiceDate", dateStr),
      updateConfirmRequest(item.id, updates),
    ]);
    setItems((prev) => prev.map((i) => i.id === item.id
      ? { ...i, taxInvoiceDate: dateStr, ...(moveToDone && { status: "확인완료" as ConfirmStatus }) }
      : i));
    if (moveToDone) { showApprovedToast(); }
    setSelected(null); setIssuing(null);
  }

  // 확인완료 → 대기 복구 (계산서 발행 기록은 유지)
  async function handleCancelConfirmation(item: ConfirmRequest) {
    if (!confirm(`"${item.projectName || item.clientName}" 입금확인을 취소하고 대기 상태로 되돌리겠습니까?\n(세금계산서 발행 기록은 유지됩니다.)`)) return;
    await Promise.all([
      updateConfirmRequest(item.id, { status: "대기", depositConfirmedAt: null as unknown as string }),
      updateRevenueField(item.projectId, item.rowKey, "paymentDate", ""),
    ]);
    setItems((prev) => prev.map((i) => i.id === item.id
      ? { ...i, status: "대기" as ConfirmStatus, depositConfirmedAt: undefined }
      : i));
    if (item.projectId) invalidateProjectCache(item.projectId);
    setSelected(null);
  }

  async function handlePaymentDone(item: ConfirmRequest, date: string) {
    const dateStr = date || todayStr();
    // 세금계산서 불필요(taxExempt)하거나 계산서가 이미 발행된 경우 확인완료로 전환
    const moveToDone = Boolean(item.taxExempt) || Boolean(item.taxInvoiceDate);
    const updates: Parameters<typeof updateConfirmRequest>[1] = { depositConfirmedAt: dateStr };
    if (moveToDone) updates.status = "확인완료";
    await Promise.all([
      updateRevenueField(item.projectId, item.rowKey, "paymentDate", dateStr),
      updateConfirmRequest(item.id, updates),
    ]);
    setItems((prev) => prev.map((i) => i.id === item.id
      ? { ...i, depositConfirmedAt: dateStr, ...(moveToDone && { status: "확인완료" as ConfirmStatus }) }
      : i));
    if (moveToDone) showApprovedToast();
    setSelected(null);
  }

  // 프로젝트 매출행 날짜 필드를 null로 초기화
  async function clearRevenueFields(item: ConfirmRequest, fields: ("paymentDate" | "invoiceDate")[]) {
    if (!item.rowKey) return;
    let pid = item.projectId || null;
    if (!pid) {
      try {
        const r = await fetch(`/api/projects/by-revenue?rowKey=${encodeURIComponent(item.rowKey)}`);
        if (r.ok) pid = (await r.json()).projectId ?? null;
      } catch {}
    }
    if (!pid) return;
    try {
      const r = await fetch(`/api/projects/${pid}`);
      if (!r.ok) return;
      const { revenues } = await r.json();
      if (!revenues) return;
      const updated = revenues.map((rev: Record<string, unknown>) => {
        // "__contract__"는 모든 행에 적용
        if (item.rowKey !== "__contract__" && rev.revenueRowId !== item.rowKey) return rev;
        const cleared = { ...rev };
        for (const f of fields) cleared[f] = null;
        return cleared;
      });
      await fetch(`/api/projects/${pid}/revenues`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revenues: updated }),
      });
    } catch {}
  }

  async function confirmCancelApproval() {
    if (!cancelTarget || cancelling) return;
    setCancelling(true);
    const target = cancelTarget;
    const hadInvoice = Boolean(target.taxInvoiceDate);

    if (hadInvoice && target.status === "확인완료") {
      // 확인완료 + 계산서 발행 취소: confirm request 삭제해 입금확인요청 버튼이 다시 활성화되도록
      setItems((prev) => prev.filter((i) => i.id !== target.id));
      await deleteConfirmRequest(target.id);
    } else if (hadInvoice && target.status === "대기") {
      // 대기 + 계산서 발행 취소: taxInvoiceDate만 초기화, 상태·레코드 유지
      setItems((prev) => prev.map((i) =>
        i.id === target.id ? { ...i, taxInvoiceDate: undefined } : i
      ));
      await updateConfirmRequest(target.id, { taxInvoiceDate: null as unknown as string });
    } else {
      // 일반 확인 취소: 대기 상태로 되돌리기 + depositConfirmedAt도 초기화
      setItems((prev) => prev.map((i) =>
        i.id === target.id ? { ...i, status: "대기" as ConfirmStatus, taxInvoiceDate: undefined, depositConfirmedAt: undefined } : i
      ));
      await updateConfirmRequest(target.id, { status: "대기", taxInvoiceDate: null as unknown as string, depositConfirmedAt: null as unknown as string });
    }
    if (target.projectId) invalidateProjectCache(target.projectId);
    setSelected(null);
    setCancelTarget(null);

    // 매출행 날짜 역방향 처리
    let fieldsToClear: ("paymentDate" | "invoiceDate")[];
    if (hadInvoice && target.status === "확인완료") fieldsToClear = ["paymentDate", "invoiceDate"];
    else if (hadInvoice && target.status === "대기")  fieldsToClear = ["invoiceDate"];
    else                                               fieldsToClear = ["paymentDate"];
    await clearRevenueFields(target, fieldsToClear);

    setCancelling(false);
  }

  // 고객사 DB 조회 후 엑셀 다운로드
  async function handleExcel(targets: ConfirmRequest[], label: string) {
    setExporting(true);
    const clientIds = [...new Set(targets.map((i) => i.clientId).filter((id): id is string => Boolean(id)))];
    const clientMap = await fetchClients(clientIds);
    exportExcel(targets, clientMap, label);
    setExporting(false);
  }

  async function handleDailyExcel() {
    if (invoiceExportItems.length === 0) {
      alert("내보낼 세금계산서가 없습니다.\n(확인완료+미발행 또는 대기+발행완료 항목이 없습니다.)");
      return;
    }
    await handleExcel(invoiceExportItems, selectedDate ? formatDate(selectedDate) : "일괄");
  }

  const formatDate = (d: string) => { const [y, m, day] = d.split("-"); return `${y}.${m}.${day}`; };

  return (
    <div className="space-y-4">
      {/* 승인 완료 토스트 */}
      {approvedToast && (
        <div className="fixed bottom-6 right-6 z-[70] flex items-center gap-3 px-5 py-4 rounded-2xl text-sm font-semibold"
          style={{ background: "#fff", boxShadow: "0 8px 32px rgba(22,31,51,0.18)", border: "1px solid rgba(16,185,129,0.25)", color: "#191F28", minWidth: 280 }}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(16,185,129,0.12)" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold" style={{ color: "#059669" }}>입금확인 완료</p>
            <p className="text-xs mt-0.5" style={{ color: "#64748B" }}>작업확인 페이지에서 진행 상태를 확인하세요.</p>
          </div>
          <button
            onClick={() => { setApprovedToast(false); router.push("/projects/work-check"); }}
            className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg text-white transition-opacity hover:opacity-90"
            style={{ background: "#059669" }}
          >
            이동
          </button>
        </div>
      )}

      {/* 반려 사유 입력 모달 */}
      {rejectTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: "rgba(25,31,40,0.45)" }}
          onClick={() => { setRejectTarget(null); setRejectReason(""); }}>
          <div className="rounded-2xl w-full max-w-sm mx-4 overflow-hidden" style={{ background: "#fff", boxShadow: "0 20px 60px rgba(22,31,51,0.18)" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #F1F5F9" }}>
              <h2 className="text-sm font-bold" style={{ color: "#191F28" }}>반려 사유 입력</h2>
              <button onClick={() => { setRejectTarget(null); setRejectReason(""); }} className="p-1.5 rounded-lg hover:bg-slate-100">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-xs" style={{ color: "#64748B" }}>
                <span className="font-semibold" style={{ color: "#191F28" }}>{rejectTarget.projectName}</span> 건을 반려합니다.
              </p>
              <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                placeholder="반려 사유를 입력하세요. (선택)" rows={3} autoFocus
                className="w-full px-3 py-2.5 text-sm rounded-xl outline-none border resize-none transition-colors focus:border-[#EF4444]"
                style={{ background: "#F8FAFC", borderColor: "#E9EBEF", color: "#191F28" }} />
            </div>
            <div className="flex gap-2 px-6 py-4" style={{ borderTop: "1px solid #F1F5F9" }}>
              <button onClick={() => { setRejectTarget(null); setRejectReason(""); }}
                className="flex-1 py-2.5 text-sm font-medium rounded-xl border hover:bg-slate-50"
                style={{ borderColor: "#E9EBEF", color: "#64748B" }}>취소</button>
              <button onClick={confirmReject} disabled={rejecting}
                className="flex-1 py-2.5 text-sm font-semibold text-white rounded-xl hover:opacity-90 disabled:opacity-50"
                style={{ background: "#EF4444" }}>{rejecting ? "처리 중..." : "반려 확정"}</button>
            </div>
          </div>
        </div>
      )}

      {/* 승인 취소 확인 모달 */}
      {cancelTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ background: "rgba(25,31,40,0.45)" }}
          onClick={() => { if (!cancelling) setCancelTarget(null); }}>
          <div className="rounded-2xl w-full max-w-sm mx-4 overflow-hidden"
            style={{ background: "#fff", boxShadow: "0 20px 60px rgba(22,31,51,0.18)" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #F1F5F9" }}>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "rgba(234,179,8,0.12)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#CA8A04" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </div>
                <h2 className="text-sm font-bold" style={{ color: "#191F28" }}>
                  {cancelTarget.status === "대기" && cancelTarget.taxInvoiceDate ? "계산서 발행 취소" : "확인 취소"}
                </h2>
              </div>
              <button onClick={() => { if (!cancelling) setCancelTarget(null); }} className="p-1.5 rounded-lg hover:bg-slate-100">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-sm" style={{ color: "#475569" }}>
                <span className="font-semibold" style={{ color: "#191F28" }}>{cancelTarget.projectName}</span>의 확인을 취소합니다.
              </p>
              <div className="p-3 rounded-xl space-y-1.5" style={{ background: "#FFF9EC", border: "1px solid rgba(234,179,8,0.25)" }}>
                <p className="text-xs font-semibold" style={{ color: "#CA8A04" }}>취소 시 처리 내용</p>
                <ul className="text-xs space-y-0.5" style={{ color: "#92400E" }}>
                  {cancelTarget.status === "대기" && cancelTarget.taxInvoiceDate ? (<>
                    <li>· 계산서 발행 기록(<strong>{cancelTarget.taxInvoiceDate}</strong>)이 초기화됩니다</li>
                    <li>· 프로젝트 매출행의 <strong>계산서날짜</strong>가 초기화됩니다</li>
                  </>) : (<>
                    <li>· 상태가 <strong>대기</strong>로 돌아갑니다</li>
                    <li>· 프로젝트 매출행의 <strong>입금날짜</strong>가 초기화됩니다</li>
                    {cancelTarget.taxInvoiceDate && (
                      <li>· 계산서 발행 기록(<strong>{cancelTarget.taxInvoiceDate}</strong>)과 <strong>계산서날짜</strong>도 초기화됩니다</li>
                    )}
                  </>)}
                </ul>
              </div>
            </div>
            <div className="flex gap-2 px-6 py-4" style={{ borderTop: "1px solid #F1F5F9" }}>
              <button onClick={() => { if (!cancelling) setCancelTarget(null); }}
                className="flex-1 py-2.5 text-sm font-medium rounded-xl border hover:bg-slate-50"
                style={{ borderColor: "#E9EBEF", color: "#64748B" }}>돌아가기</button>
              <button onClick={confirmCancelApproval} disabled={cancelling}
                className="flex-1 py-2.5 text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-50"
                style={{ background: "rgba(234,179,8,0.12)", color: "#CA8A04", border: "1px solid rgba(234,179,8,0.3)" }}>
                {cancelling ? "처리 중..." : "확인 취소"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "#191F28" }}>입금확인요청</h1>
          <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>
            고객사 입금 확인 및 세금계산서 발행 관리
            {pendingInvoice.length > 0 && <span style={{ color: "#3182F6" }}> · 계산서 미발행 {pendingInvoice.length}건</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleDailyExcel} disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-60"
            style={{ background: invoiceExportItems.length > 0 ? "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" : "#CBD5E1" }}>
            {exporting ? (
              <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            )}
            계산서 발행 엑셀
            {invoiceExportItems.length > 0 && (
              <span className="bg-white rounded-full text-xs font-black px-1.5 py-0.5 leading-none" style={{ color: "#3182F6" }}>{invoiceExportItems.length}</span>
            )}
          </button>
        </div>
      </div>

      {/* 월·날짜 필터 */}
      <PeriodFilter
        dates={filterDates}
        month={selectedMonth}
        date={selectedDate}
        onChange={({ month, date }) => { setSelectedMonth(month); setSelectedDate(date); }}
      />

      {/* 상태 필터 */}
      <div className="flex items-center gap-1 p-0.5 rounded-xl self-start" style={{ background: "#F1F5F9" }}>
        {(["대기", "확인완료", "반려", "전체"] as const).map((s) => {
          const isActive = filterStatus === s;
          const st = s !== "전체" ? STATUS_STYLE[s] : null;
          return (
            <button key={s} onClick={() => setFilterStatus(s)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
              style={{ background: isActive ? "#fff" : "transparent", color: isActive ? (st?.color ?? "#191F28") : "#94A3B8", boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}>
              {s}
              <span className="font-bold" style={{ color: isActive ? (st?.color ?? "#191F28") : "#CBD5E1" }}>
                {counts[s as keyof typeof counts] ?? items.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* 날짜별 그룹 */}
      {error ? (
        <div className="rounded-2xl py-20 text-center" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
          <p className="text-sm font-semibold" style={{ color: "#EF4444" }}>{error}</p>
          <p className="text-xs mt-1" style={{ color: "#94A3B8" }}>목록을 표시할 수 없습니다. 데이터가 없는 것으로 잘못 보이지 않도록 표시를 중단했습니다.</p>
          <button onClick={load} className="mt-3 px-4 py-1.5 text-sm font-semibold rounded-lg" style={{ background: "#3182F6", color: "#fff" }}>다시 시도</button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl py-20 text-center" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
          <p className="text-sm font-medium" style={{ color: "#94A3B8" }}>요청 내역이 없습니다.</p>
          <p className="text-xs mt-1" style={{ color: "#CBD5E1" }}>프로젝트 관리 → 매출 행의 <span style={{ color: "#3182F6" }}>입금확인요청</span> 버튼으로 추가하세요.</p>
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl py-16 text-center" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
          <p className="text-sm" style={{ color: "#94A3B8" }}>해당 조건의 요청이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, dateItems]) => {
            const exportItems = dateItems.filter((i) => !i.taxInvoiceDate && i.status !== "반려");
            return (
              <div key={date} className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
                {/* 날짜 헤더 */}
                <div className="flex items-center gap-3 px-5 py-3" style={{ background: "#F8FAFC", borderBottom: "1px solid #F1F5F9" }}>
                  <span className="text-sm font-bold" style={{ color: "#191F28" }}>{formatDate(date)}</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "#E9EBEF", color: "#64748B" }}>{dateItems.length}건</span>
                  {exportItems.length > 0 && (
                    <button
                      onClick={() => handleExcel(exportItems, formatDate(date))}
                      disabled={exporting}
                      className="ml-auto flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all hover:opacity-80 disabled:opacity-50"
                      style={{ background: "rgba(49,130,246,0.1)", color: "#3182F6", border: "1px solid rgba(49,130,246,0.2)" }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                      계산서 엑셀 ({exportItems.length}건)
                    </button>
                  )}
                </div>

                {/* 테이블 */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: "#FAFBFC" }}>
                        {["프로젝트명","캠페인명","상품종류","팀","담당자","품명/수량","합계","작업기간","입금상태","세금계산서",""].map((h, i) => (
                          <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold whitespace-nowrap" style={{ color: "#94A3B8" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dateItems.map((item) => {
                        const ss = STATUS_STYLE[item.status];
                        const invoiceDone = Boolean(item.taxInvoiceDate);
                        return (
                          <tr key={item.id}
                            className="border-t group cursor-pointer"
                            style={{ borderColor: "#F1F5F9" }}
                            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(49,130,246,0.02)")}
                            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                            onClick={() => setSelected(item)}
                          >
                            <td className="px-4 py-3 font-semibold text-xs" style={{ color: "#191F28" }}>{item.clientName || item.projectName || "—"}</td>
                            <td className="px-4 py-3 text-xs" style={{ color: "#475569" }}>
                              {item.campaignName || (item.campaignNumber != null ? `캠페인 ${item.campaignNumber}` : (item.projectName || "—"))}
                            </td>
                            <td className="px-4 py-3 text-xs">
                              {item.projectType ? (
                                <span className="px-2 py-0.5 rounded-full font-semibold whitespace-nowrap"
                                  style={{
                                    background: item.projectType === "관리형" ? "rgba(99,102,241,0.1)" : "rgba(234,88,12,0.1)",
                                    color: item.projectType === "관리형" ? "#6366F1" : "#EA580C",
                                    fontSize: "11px",
                                  }}>
                                  {item.projectType}
                                </span>
                              ) : <span style={{ color: "#CBD5E1" }}>—</span>}
                            </td>
                            <td className="px-4 py-3">
                              {item.assignedTeam ? (
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                                  style={teamBadgeStyle(item.assignedTeam, 0.1)}>
                                  {item.assignedTeam}
                                </span>
                              ) : <span style={{ color: "#CBD5E1" }}>—</span>}
                            </td>
                            <td className="px-4 py-3 text-xs" style={{ color: "#475569" }}>{item.requester}</td>
                            <td className="px-4 py-3 text-xs" style={{ color: "#475569" }}>
                              {item.revenueLines && item.revenueLines.length > 0 ? (
                                <div className="flex flex-col gap-0.5">
                                  {item.revenueLines.map((line, li) => (
                                    <span key={li} className="whitespace-nowrap">
                                      {line.productName || "—"}
                                      {line.quantity != null && <span className="ml-1 font-semibold" style={{ color: "#94A3B8" }}>×{line.quantity}</span>}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                item.productName || "—"
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs font-bold" style={{ color: "#3182F6" }}>{item.amount}</td>
                            <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "#94A3B8" }}>
                              {item.workStartDate && item.workEndDate ? `${item.workStartDate} ~ ${item.workEndDate}` : item.workStartDate || item.workEndDate || "—"}
                            </td>
                            <td className="px-4 py-3">
                              {item.status === "대기" && item.depositConfirmedAt ? (
                                <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
                                  style={{ background: "rgba(49,130,246,0.1)", color: "#3182F6", border: "1px solid rgba(49,130,246,0.2)" }}>
                                  입금완료
                                </span>
                              ) : (
                                <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
                                  style={{ background: ss.bg, color: ss.color, border: `1px solid ${ss.border}` }}>
                                  {item.status}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {item.taxExempt ? (
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(148,163,184,0.1)", color: "#64748B", border: "1px solid rgba(148,163,184,0.25)" }}>발행불필요</span>
                              ) : item.depositAccount === "전재민" ? (
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "#F1F5F9", color: "#94A3B8" }}>해당없음</span>
                              ) : invoiceDone ? (
                                <div>
                                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(5,150,105,0.1)", color: "#059669" }}>발행완료</span>
                                  <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>{item.taxInvoiceDate}</p>
                                </div>
                              ) : (item.status === "확인완료" || item.status === "대기") ? (
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(234,179,8,0.1)", color: "#CA8A04" }}>미발행</span>
                              ) : <span style={{ color: "#CBD5E1" }}>—</span>}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                {item.status === "확인완료" && !invoiceDone && item.depositAccount !== "전재민" && !item.taxExempt && (
                                  <button onClick={(e) => { e.stopPropagation(); setSelected(item); }}
                                    className="text-xs font-semibold px-2 py-1 rounded-lg whitespace-nowrap"
                                    style={{ background: "rgba(5,150,105,0.1)", color: "#059669", border: "1px solid rgba(5,150,105,0.25)" }}>
                                    발행완료
                                  </button>
                                )}
                                {item.projectId && (
                                  <Link href={`/projects?open=${item.projectId}`} onClick={(e) => e.stopPropagation()}
                                    title="프로젝트 이동" className="p-1 rounded-lg hover:bg-blue-50 transition-colors">
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#3182F6" strokeWidth="2.5" strokeLinecap="round">
                                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                      <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                                    </svg>
                                  </Link>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 상세 모달 */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(25,31,40,0.45)" }} onClick={() => setSelected(null)}>
          <div className="rounded-2xl w-full max-w-lg mx-4 overflow-hidden" style={{ background: "#fff", boxShadow: "0 20px 60px rgba(22,31,51,0.18)", maxHeight: "90vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>

            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: "1px solid #F1F5F9" }}>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
                  style={{ background: STATUS_STYLE[selected.status].bg, color: STATUS_STYLE[selected.status].color, border: `1px solid ${STATUS_STYLE[selected.status].border}` }}>
                  {selected.status}
                </span>
                {selected.taxExempt && (
                  <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: "rgba(148,163,184,0.1)", color: "#64748B", border: "1px solid rgba(148,163,184,0.25)" }}>
                    세금계산서 발행 불필요
                  </span>
                )}
                {selected.taxInvoiceDate && (
                  <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: "rgba(5,150,105,0.1)", color: "#059669" }}>
                    계산서 {selected.taxInvoiceDate}
                  </span>
                )}
              </div>
              <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* 모달 바디 */}
            <div className="overflow-y-auto px-6 py-5 space-y-4">
              <h3 className="text-base font-bold" style={{ color: "#191F28" }}>{selected.projectName}</h3>

              {/* 기본 정보 */}
              <div className="rounded-xl" style={{ background: "#F8FAFC", border: "1px solid #ECEEF2" }}>
                <p className="px-4 pt-3 pb-1 text-xs font-bold" style={{ color: "#94A3B8" }}>기본 정보</p>
                <div className="grid grid-cols-2 gap-px px-4 pb-3 pt-1">
                  <div>
                    <p className="text-xs mb-0.5" style={{ color: "#94A3B8" }}>플레이스/스토어명</p>
                    <p className="text-sm font-semibold" style={{ color: "#191F28" }}>{selected.clientName || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs mb-0.5" style={{ color: "#94A3B8" }}>상호명 (사업자등록기준)</p>
                    <p className="text-sm font-semibold" style={{ color: "#191F28" }}>{selected.clientStoreName || "—"}</p>
                  </div>
                  {selected.clientEmail && (
                    <div className="col-span-2 mt-2">
                      <p className="text-xs mb-0.5" style={{ color: "#94A3B8" }}>이메일</p>
                      <p className="text-sm font-semibold" style={{ color: "#191F28" }}>{selected.clientEmail}</p>
                    </div>
                  )}
                  <div className="col-span-2 mt-2">
                    <p className="text-xs mb-0.5" style={{ color: "#94A3B8" }}>담당팀</p>
                    {selected.assignedTeam ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          ...teamBadgeStyle(selected.assignedTeam, 0.1),
                        }}>
                        {selected.assignedTeam}
                      </span>
                    ) : <p className="text-sm font-semibold" style={{ color: "#CBD5E1" }}>—</p>}
                  </div>
                  <div className="col-span-2 mt-2">
                    <p className="text-xs mb-0.5" style={{ color: "#94A3B8" }}>담당자</p>
                    <p className="text-sm font-semibold" style={{ color: "#191F28" }}>{selected.requester}</p>
                  </div>
                </div>
              </div>

              {/* 상품 정보 */}
              <div className="rounded-xl" style={{ background: "#F8FAFC", border: "1px solid #ECEEF2" }}>
                <p className="px-4 pt-3 pb-2 text-xs font-bold" style={{ color: "#94A3B8" }}>상품 정보</p>
                <div className="px-4 pb-3 space-y-3">
                  {/* 상품 (프로젝트 상품) */}
                  {selected.projectProduct && (
                    <div>
                      <p className="text-xs mb-0.5" style={{ color: "#94A3B8" }}>상품</p>
                      <p className="text-sm font-medium" style={{ color: "#191F28" }}>{selected.projectProduct}</p>
                    </div>
                  )}
                  {/* 매출 품명/개수/합계 */}
                  {selected.revenueLines && selected.revenueLines.length > 0 ? (
                    <div>
                      <p className="text-xs mb-1.5" style={{ color: "#94A3B8" }}>매출 내역</p>
                      <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #E9EBEF" }}>
                        <table className="w-full text-xs">
                          <thead>
                            <tr style={{ background: "#F1F5F9" }}>
                              <th className="px-3 py-1.5 text-left font-semibold" style={{ color: "#94A3B8" }}>품명</th>
                              <th className="px-3 py-1.5 text-center font-semibold" style={{ color: "#94A3B8" }}>수량</th>
                              <th className="px-3 py-1.5 text-right font-semibold" style={{ color: "#94A3B8" }}>합계</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selected.revenueLines.map((line, li) => (
                              <tr key={li} className="border-t" style={{ borderColor: "#F1F5F9", background: "#fff" }}>
                                <td className="px-3 py-2 font-medium" style={{ color: "#191F28" }}>{line.productName || "—"}</td>
                                <td className="px-3 py-2 text-center" style={{ color: "#475569" }}>{line.quantity ?? "—"}</td>
                                <td className="px-3 py-2 text-right font-bold" style={{ color: "#3182F6" }}>
                                  {line.total != null ? `₩${line.total.toLocaleString()}` : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs mb-0.5" style={{ color: "#94A3B8" }}>내용 (품명)</p>
                        <p className="text-sm font-medium" style={{ color: "#191F28" }}>{selected.description || selected.productName || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs mb-0.5" style={{ color: "#94A3B8" }}>수량</p>
                        <p className="text-sm font-medium" style={{ color: "#191F28" }}>{selected.quantity || "—"}</p>
                      </div>
                    </div>
                  )}
                  {/* 작업기간 + 입금액 */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs mb-0.5" style={{ color: "#94A3B8" }}>작업기간</p>
                      <p className="text-sm font-medium" style={{ color: "#191F28" }}>
                        {selected.workStartDate && selected.workEndDate
                          ? `${selected.workStartDate} ~ ${selected.workEndDate}`
                          : selected.workStartDate || selected.workEndDate || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs mb-0.5" style={{ color: "#94A3B8" }}>입금액</p>
                      <p className="text-sm font-bold" style={{ color: "#3182F6" }}>{selected.amount}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 입금 정보 */}
              {(() => {
                const derivedAccount = selected.depositAccount
                  || selected.revenueLines?.find(l => l.depositAccount)?.depositAccount
                  || "";
                const uniqueAccounts = [...new Set(
                  (selected.revenueLines ?? []).map(l => l.depositAccount).filter(Boolean)
                )];
                return (
                  <div className="rounded-xl" style={{ background: "#F8FAFC", border: "1px solid #ECEEF2" }}>
                    <p className="px-4 pt-3 pb-2 text-xs font-bold" style={{ color: "#94A3B8" }}>입금 정보</p>
                    <div className="grid grid-cols-3 gap-4 px-4 pb-3">
                      <div>
                        <p className="text-xs mb-0.5" style={{ color: "#94A3B8" }}>입금계좌</p>
                        {uniqueAccounts.length > 1 ? (
                          <div className="flex flex-col gap-0.5">
                            {uniqueAccounts.map((acc, i) => (
                              <p key={i} className="text-sm font-medium" style={{ color: "#191F28" }}>{acc}</p>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm font-medium" style={{ color: "#191F28" }}>{derivedAccount || "—"}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs mb-0.5" style={{ color: "#94A3B8" }}>입금자명</p>
                        <p className="text-sm font-medium" style={{ color: "#191F28" }}>{selected.depositorName || "—"}</p>
                      </div>
                      <div>
                        {/* 요청자가 적은 입금일. 아래 입금완료 날짜의 기본값이 된다 */}
                        <p className="text-xs mb-0.5" style={{ color: "#94A3B8" }}>입금날짜</p>
                        <p className="text-sm font-medium" style={{ color: "#191F28" }}>{selected.depositDate || "—"}</p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 사업자등록증 */}
              {clientBizRegUrl && (
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #ECEEF2" }}>
                  <p className="px-4 py-3 text-xs font-bold" style={{ color: "#94A3B8", background: "#F8FAFC", borderBottom: "1px solid #ECEEF2" }}>사업자등록증</p>
                  <div className="p-3">
                    <BizRegView value={clientBizRegUrl} />
                  </div>
                </div>
              )}

              {selected.status === "반려" && selected.rejectReason && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-xl" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}>
                  <svg className="mt-0.5 shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <div>
                    <p className="text-xs font-semibold mb-0.5" style={{ color: "#DC2626" }}>반려 사유</p>
                    <p className="text-xs" style={{ color: "#475569" }}>{selected.rejectReason}</p>
                  </div>
                </div>
              )}
            </div>

            {/* 모달 푸터 */}
            <div className="px-6 py-4 shrink-0 space-y-3" style={{ borderTop: "1px solid #F1F5F9" }}>
              {/* 프로젝트 이동 링크 */}
              {selected.projectId && (
                <Link href={`/projects?open=${selected.projectId}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors hover:bg-blue-50"
                  style={{ color: "#3182F6", border: "1px solid rgba(49,130,246,0.2)" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                  프로젝트 이동
                </Link>
              )}

              {/* 대기: 입금완료 + 세금계산서 발행 — 둘 다 완료 시 자동 확인완료 */}
              {selected.status === "대기" && (<>
                {/* 반려 버튼 */}
                <button onClick={() => setRejectTarget(selected)}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold hover:opacity-90"
                  style={{ background: "rgba(239,68,68,0.1)", color: "#DC2626" }}>반려</button>

                {/* ① 입금완료 */}
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E9EBEF" }}>
                  <div className="px-3 py-2 flex items-center gap-2" style={{ background: "#FAFBFC", borderBottom: "1px solid #E9EBEF" }}>
                    <span className="text-xs font-semibold" style={{ color: "#64748B" }}>① 입금완료</span>
                    {selected.depositConfirmedAt && (
                      <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(49,130,246,0.1)", color: "#3182F6" }}>완료 {selected.depositConfirmedAt}</span>
                    )}
                  </div>
                  <div className="p-3">
                    {selected.depositConfirmedAt ? (
                      <button
                        onClick={async () => {
                          await updateConfirmRequest(selected.id, { depositConfirmedAt: null as unknown as string });
                          await updateRevenueField(selected.projectId, selected.rowKey, "paymentDate", "");
                          setItems((prev) => prev.map((i) => i.id === selected.id ? { ...i, depositConfirmedAt: undefined } : i));
                          setSelected((s) => s ? { ...s, depositConfirmedAt: undefined } : null);
                        }}
                        className="text-xs font-semibold hover:opacity-70" style={{ color: "#94A3B8" }}>
                        입금완료 취소
                      </button>
                    ) : (<>
                      <div className="flex items-center gap-3 mb-2.5">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round">
                          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        <input type="date" value={confirmDate} onChange={e => setConfirmDate(e.target.value)}
                          className="flex-1 text-sm bg-transparent outline-none" style={{ color: "#191F28" }} />
                      </div>
                      <button
                        onClick={async () => {
                          await handlePaymentDone(selected, confirmDate);
                        }}
                        className="w-full py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90"
                        style={{ background: "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" }}>
                        입금완료 처리
                      </button>
                    </>)}
                  </div>
                </div>

                {/* ② 세금계산서 발행 (전재민·부가세0 제외) */}
                {selected.depositAccount !== "전재민" && !selected.taxExempt && (
                  <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E9EBEF" }}>
                    <div className="px-3 py-2 flex items-center gap-2" style={{ background: "#FAFBFC", borderBottom: "1px solid #E9EBEF" }}>
                      <span className="text-xs font-semibold" style={{ color: "#64748B" }}>② 세금계산서 발행</span>
                      {selected.taxInvoiceDate && (
                        <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(5,150,105,0.1)", color: "#059669" }}>완료 {selected.taxInvoiceDate}</span>
                      )}
                    </div>
                    <div className="p-3">
                      {selected.taxInvoiceDate ? (
                        <button onClick={() => setCancelTarget(selected)}
                          className="text-xs font-semibold hover:opacity-70" style={{ color: "#94A3B8" }}>
                          발행 취소
                        </button>
                      ) : (<>
                        <div className="flex items-center gap-3 mb-2.5">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round">
                            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                          </svg>
                          <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)}
                            className="flex-1 text-sm bg-transparent outline-none" style={{ color: "#191F28" }} />
                        </div>
                        <button onClick={() => handleIssueComplete(selected, issueDate)} disabled={issuing === selected.id}
                          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                          style={{ background: "linear-gradient(135deg, #059669 0%, #047857 100%)" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                          </svg>
                          {issuing === selected.id ? "처리 중..." : "발행완료 처리"}
                        </button>
                      </>)}
                    </div>
                  </div>
                )}

                {/* 부가세 0 — 세금계산서 해당없음 안내 */}
                {selected.taxExempt && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: "#F8FAFC", border: "1px solid #E9EBEF" }}>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "#F1F5F9", color: "#94A3B8" }}>해당없음</span>
                    <span className="text-xs" style={{ color: "#94A3B8" }}>부가세 0원 캠페인은 세금계산서 발행 대상이 아닙니다.</span>
                  </div>
                )}

                {!selected.taxExempt && (
                  <p className="text-xs text-center" style={{ color: "#CBD5E1" }}>① ② 모두 완료 시 자동으로 확인완료 처리됩니다</p>
                )}
              </>)}

              {/* 확인완료 + 전재민·부가세0: 세금계산서 해당없음 */}
              {selected.status === "확인완료" && (selected.depositAccount === "전재민" || selected.taxExempt) && (
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: "#F8FAFC", border: "1px solid #E9EBEF" }}>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "#F1F5F9", color: "#94A3B8" }}>해당없음</span>
                    <span className="text-xs" style={{ color: "#94A3B8" }}>
                      {selected.taxExempt ? "부가세 0원 캠페인은 세금계산서 발행 대상이 아닙니다." : "전재민 계좌는 세금계산서 발행 대상이 아닙니다."}
                    </span>
                  </div>
                  <button onClick={() => handleCancelConfirmation(selected)}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 whitespace-nowrap"
                    style={{ background: "rgba(234,179,8,0.1)", color: "#CA8A04", border: "1px solid rgba(234,179,8,0.2)" }}>
                    입금확인취소
                  </button>
                </div>
              )}

              {/* 확인완료 + 계산서 미발행: 발행날짜 + 입금확인취소 + 발행완료 */}
              {selected.status === "확인완료" && !selected.taxInvoiceDate && selected.depositAccount !== "전재민" && !selected.taxExempt && (<>
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: "#F8FAFC", border: "1px solid #E9EBEF" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  <label className="text-xs font-semibold whitespace-nowrap" style={{ color: "#64748B" }}>발행날짜</label>
                  <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)}
                    className="flex-1 text-sm bg-transparent outline-none" style={{ color: "#191F28" }} />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleCancelConfirmation(selected)}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90"
                    style={{ background: "rgba(234,179,8,0.1)", color: "#CA8A04", border: "1px solid rgba(234,179,8,0.2)" }}>
                    입금확인취소
                  </button>
                  <button onClick={() => handleIssueComplete(selected, issueDate)} disabled={issuing === selected.id}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #059669 0%, #047857 100%)" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                    </svg>
                    {issuing === selected.id ? "처리 중..." : "발행완료 처리"}
                  </button>
                </div>
              </>)}

              {/* 계산서 발행완료: 닫기 + 입금확인취소 + 계산서 발행 취소 */}
              {selected.status === "확인완료" && selected.taxInvoiceDate && (
                <div className="flex gap-2">
                  <button onClick={() => setSelected(null)}
                    className="py-2.5 px-5 rounded-xl text-sm font-semibold"
                    style={{ background: "#F1F5F9", color: "#475569" }}>닫기</button>
                  <button onClick={() => handleCancelConfirmation(selected)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90"
                    style={{ background: "rgba(234,179,8,0.1)", color: "#CA8A04", border: "1px solid rgba(234,179,8,0.2)" }}>
                    입금확인취소
                  </button>
                  <button onClick={() => setCancelTarget(selected)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90"
                    style={{ background: "rgba(239,68,68,0.08)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.2)" }}>
                    계산서 발행 취소
                  </button>
                </div>
              )}

              {/* 반려: 닫기만 */}
              {selected.status === "반려" && (
                <button onClick={() => setSelected(null)} className="w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: "#F1F5F9", color: "#475569" }}>닫기</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
