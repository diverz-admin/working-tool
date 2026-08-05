"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import {
  type PaymentRequest, type PaymentStatus,
  getPaymentRequests, updatePaymentRequest,
} from "@/lib/approvals";
import { invalidateProjectCache } from "@/components/projects/ProjectModal";
import { useFileSrc, isImageValue, isPdfValue } from "@/lib/storage";
import { fetchJson } from "@/lib/fetch-json";
import { teamBadgeStyle } from "@/lib/teams";

// 세금계산서(스토리지 경로/레거시 data:) 미리보기
function InvoiceView({ url, name }: { url: string; name: string | null | undefined }) {
  const src = useFileSrc(url);
  const isImg = isImageValue(url, name);
  const isPdf = isPdfValue(url, name);
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E9EBEF" }}>
      <div className="flex items-center justify-between px-3 py-2" style={{ background: "#F8FAFC", borderBottom: "1px solid #F1F5F9" }}>
        <p className="text-xs font-bold" style={{ color: "#64748B" }}>세금계산서</p>
        <a href={src ?? undefined} download={name || "세금계산서"} target="_blank" rel="noopener noreferrer"
          className="text-xs font-semibold flex items-center gap-1 hover:opacity-70 transition-opacity"
          style={{ color: src ? "#3182F6" : "#94A3B8", pointerEvents: src ? "auto" : "none" }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          다운로드
        </a>
      </div>
      {!src ? (
        <div className="px-4 py-6 text-center text-xs" style={{ color: "#CBD5E1" }}>불러오는 중…</div>
      ) : isImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name || "세금계산서"} className="w-full object-contain" style={{ maxHeight: 480, background: "#FAFAFA" }} />
      ) : isPdf ? (
        <embed src={src} type="application/pdf" width="100%" style={{ height: 480 }} />
      ) : (
        <div className="px-4 py-6 text-center">
          <a href={src} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold" style={{ color: "#3182F6" }}>파일 열기</a>
        </div>
      )}
    </div>
  );
}

const STATUS_STYLE: Record<PaymentStatus, { bg: string; color: string; border: string }> = {
  대기: { bg: "rgba(234,179,8,0.1)",  color: "#CA8A04", border: "rgba(234,179,8,0.25)" },
  승인: { bg: "rgba(16,185,129,0.1)", color: "#059669", border: "rgba(16,185,129,0.25)" },
  반려: { bg: "rgba(239,68,68,0.1)",  color: "#DC2626", border: "rgba(239,68,68,0.25)" },
};

const formatDate = (d: string) => { const [y, m, day] = d.split("-"); return `${y}.${m}.${day}`; };

export default function RequestPage() {
  const [items, setItems]               = useState<PaymentRequest[]>([]);
  const [error, setError]               = useState<string | null>(null);
  const [filter, setFilter]             = useState<PaymentStatus | "전체">("대기");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selected, setSelected]         = useState<PaymentRequest | null>(null);
  const [rejectTarget,  setRejectTarget]  = useState<PaymentRequest | null>(null);
  const [rejectReason,  setRejectReason]  = useState("");
  const [rejecting,     setRejecting]     = useState(false);
  const [cancelTarget,  setCancelTarget]  = useState<PaymentRequest | null>(null);
  const [cancelling,    setCancelling]    = useState(false);
  const [approveDate,   setApproveDate]   = useState(new Date().toISOString().slice(0, 10));
  const [editingAccount, setEditingAccount] = useState(false);
  const [accountDraft,   setAccountDraft]   = useState("");

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (selected) {
      setApproveDate(new Date().toISOString().slice(0, 10));
      setEditingAccount(false);
      setAccountDraft(selected.vendorBankAccount ?? "");
    }
  }, [selected?.id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const load = useCallback(() => {
    setError(null);
    getPaymentRequests().then((data) =>
      setItems(data.map((i) => ({ ...i, requestedAt: (i.requestedAt ?? "").slice(0, 10) })))
    )
    // 실패를 빈 목록으로 렌더하지 않는다 — "요청 없음"으로 오인되면 안 되므로 오류를 표시
    .catch((e: Error) => { setError(e.message); setItems([]); });
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const months = useMemo(() => {
    const set = new Set(items.map((i) => i.requestedAt.slice(0, 7)));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [items]);

  const dates = useMemo(() => {
    const set = new Set(
      items
        .filter((i) => selectedMonth === null || i.requestedAt.startsWith(selectedMonth))
        .map((i) => i.requestedAt)
    );
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [items, selectedMonth]);

  const scopedItems = useMemo(() => items.filter((i) =>
    (selectedMonth === null || i.requestedAt.startsWith(selectedMonth)) &&
    (selectedDate === null || i.requestedAt === selectedDate)
  ), [items, selectedMonth, selectedDate]);

  const counts = {
    전체: scopedItems.length,
    대기: scopedItems.filter((i) => i.status === "대기").length,
    승인: scopedItems.filter((i) => i.status === "승인").length,
    반려: scopedItems.filter((i) => i.status === "반려").length,
  };

  const filtered = useMemo(() => {
    if (filter === "전체") return scopedItems;
    return scopedItems.filter((i) => i.status === filter);
  }, [scopedItems, filter]);

  function handleExcel() {
    const targets = scopedItems.filter((i) => i.status === "승인" && !i.invoiceFileUrl);
    if (targets.length === 0) { alert("계산서 미발행 승인 항목이 없습니다."); return; }
    const headers = ["캠페인명", "팀", "담당자", "품명", "매입처", "개수", "합계", "요청일", "승인여부"];
    const rows = targets.map((i) => [
      i.projectName, i.assignedTeam ?? "", i.requester, i.productName,
      i.vendor ?? "", i.quantity, i.amount, i.requestedAt, i.status,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "계산서미발행");
    XLSX.writeFile(wb, `계산서미발행_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function handlePendingExcel() {
    const targets = scopedItems.filter((i) => i.status === "대기");
    if (targets.length === 0) { alert("입금 대기 항목이 없습니다."); return; }
    const headers = ["No", "캠페인명", "팀", "담당자", "품명", "매입처", "개수", "합계(원)", "입금계좌", "요청일"];
    const rows = targets.map((i, idx) => [
      idx + 1,
      i.projectName,
      i.assignedTeam ?? "",
      i.requester,
      i.productName,
      i.vendor ?? "",
      i.quantity,
      i.amount,
      i.vendorBankAccount ?? "",
      i.requestedAt,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    // 열 너비 조정
    ws["!cols"] = [
      { wch: 4 }, { wch: 24 }, { wch: 10 }, { wch: 10 },
      { wch: 20 }, { wch: 16 }, { wch: 6 }, { wch: 14 },
      { wch: 32 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "입금대기");
    XLSX.writeFile(wb, `입금대기_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function updateStatus(id: string, status: PaymentStatus, date?: string) {
    const target = items.find((i) => i.id === id);
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, status } : i));
    await updatePaymentRequest(id, { status });
    setSelected(null);

    if (status === "승인" && target?.rowKey) {
      const today = date || new Date().toISOString().slice(0, 10);
      const rowKey = target.rowKey;

      // 1) 프로젝트 매입 행 업데이트 (purchaseDate + isApproved)
      let pid = target.projectId || null;
      if (!pid) {
        try {
          const r = await fetch(`/api/projects/by-cost?rowKey=${encodeURIComponent(rowKey)}`);
          if (r.ok) pid = (await r.json()).projectId ?? null;
        } catch {}
      }
      if (pid) {
        try {
          const res = await fetch(`/api/projects/${pid}`);
          if (res.ok) {
            const { costs } = await res.json();
            if (costs) {
              const updated = costs.map((c: Record<string, unknown>) =>
                c.costRowId === rowKey ? { ...c, purchaseDate: today, isApproved: true } : c
              );
              await fetch(`/api/projects/${pid}/costs`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ costs: updated }),
              });
              invalidateProjectCache(pid);
            }
          }
        } catch {}
      }

      // 2) 경영관리 직접매입(상품) 누적 반영
      try {
        const rawAmount = parseInt((target.amount ?? "").replace(/[^0-9]/g, ""), 10);
        if (!isNaN(rawAmount) && rawAmount > 0) {
          const dateStr = target.payDate || target.requestedAt || today;
          const [yearStr, monthStr] = dateStr.split("-");
          const year  = parseInt(yearStr);
          const month = parseInt(monthStr);
          if (!isNaN(year) && !isNaN(month)) {
            // 기존 값 조회 후 누적.
            // 조회가 실패하면 기존 누계를 0으로 오인해 덮어쓰게 되므로, 쓰지 않고 중단한다.
            const existing = await fetchJson<{ costs?: Record<string, unknown>[] }>(`/api/annual/costs?year=${year}`);
            const current  = (existing.costs ?? []).find(
              (c: Record<string, unknown>) => c.category === "직접매입(상품)" && c.item === "합계" && c.month === month
            );
            const newAmount = ((current?.amount as number | undefined) ?? 0) + rawAmount;
            await fetch("/api/annual/costs", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ year, month, category: "직접매입(상품)", item: "합계", amount: newAmount }),
            });
          }
        }
      } catch {}
    }
  }

  async function confirmReject() {
    if (!rejectTarget || rejecting) return;
    setRejecting(true);
    const reason = rejectReason.trim() || undefined;
    setItems((prev) => prev.map((i) =>
      i.id === rejectTarget.id
        ? { ...i, status: "반려" as PaymentStatus, rejectReason: reason }
        : i
    ));
    await updatePaymentRequest(rejectTarget.id, { status: "반려", rejectReason: reason });
    setSelected(null);
    setRejectTarget(null);
    setRejectReason("");
    setRejecting(false);
  }

  async function confirmCancelApproval() {
    if (!cancelTarget || cancelling) return;
    setCancelling(true);
    const target = cancelTarget;

    // 1) 상태를 대기로 되돌리기
    setItems((prev) => prev.map((i) =>
      i.id === target.id ? { ...i, status: "대기" as PaymentStatus } : i
    ));
    await updatePaymentRequest(target.id, { status: "대기" });
    setSelected(null);
    setCancelTarget(null);

    // 2) 프로젝트 매입 행 isApproved 해제
    if (target.rowKey) {
      try {
        let pid = target.projectId || null;
        if (!pid) {
          const r = await fetch(`/api/projects/by-cost?rowKey=${encodeURIComponent(target.rowKey)}`);
          if (r.ok) pid = (await r.json()).projectId ?? null;
        }
        if (pid) {
          const res = await fetch(`/api/projects/${pid}`);
          if (res.ok) {
            const { costs } = await res.json();
            if (costs) {
              const updated = costs.map((c: Record<string, unknown>) =>
                c.costRowId === target.rowKey
                  ? { ...c, isApproved: false, purchaseDate: null }
                  : c
              );
              await fetch(`/api/projects/${pid}/costs`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ costs: updated }),
              });
              invalidateProjectCache(pid);
            }
          }
        }
      } catch {}
    }

    // 3) 연간 비용 직접매입(상품) 차감
    try {
      const rawAmount = parseInt((target.amount ?? "").replace(/[^0-9]/g, ""), 10);
      if (!isNaN(rawAmount) && rawAmount > 0) {
        const dateStr = target.payDate || target.requestedAt;
        const [yearStr, monthStr] = dateStr.split("-");
        const year  = parseInt(yearStr);
        const month = parseInt(monthStr);
        if (!isNaN(year) && !isNaN(month)) {
          // 조회가 실패하면 기존 누계를 0으로 오인해 덮어쓰게 되므로, 쓰지 않고 중단한다.
          const existing = await fetchJson<{ costs?: Record<string, unknown>[] }>(`/api/annual/costs?year=${year}`);
          const current  = (existing.costs ?? []).find(
            (c: Record<string, unknown>) => c.category === "직접매입(상품)" && c.item === "합계" && c.month === month
          );
          const newAmount = Math.max(0, ((current?.amount as number | undefined) ?? 0) - rawAmount);
          await fetch("/api/annual/costs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ year, month, category: "직접매입(상품)", item: "합계", amount: newAmount }),
          });
        }
      }
    } catch {}

    setCancelling(false);
  }

  return (
    <div className="space-y-4">

      {/* 반려 사유 입력 모달 */}
      {rejectTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ background: "rgba(25,31,40,0.45)" }}
          onClick={() => { setRejectTarget(null); setRejectReason(""); }}>
          <div className="rounded-2xl w-full max-w-sm mx-4 overflow-hidden"
            style={{ background: "#fff", boxShadow: "0 20px 60px rgba(22,31,51,0.18)" }}
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
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="반려 사유를 입력하세요. (선택)"
                rows={3} autoFocus
                className="w-full px-3 py-2.5 text-sm rounded-xl outline-none border resize-none transition-colors focus:border-[#EF4444]"
                style={{ background: "#F8FAFC", borderColor: "#E9EBEF", color: "#191F28" }}
              />
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
                <h2 className="text-sm font-bold" style={{ color: "#191F28" }}>승인 취소 확인</h2>
              </div>
              <button onClick={() => { if (!cancelling) setCancelTarget(null); }} className="p-1.5 rounded-lg hover:bg-slate-100">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-sm" style={{ color: "#475569" }}>
                <span className="font-semibold" style={{ color: "#191F28" }}>{cancelTarget.projectName}</span>의 승인을 취소합니다.
              </p>
              <div className="p-3 rounded-xl space-y-1.5" style={{ background: "#FFF9EC", border: "1px solid rgba(234,179,8,0.25)" }}>
                <p className="text-xs font-semibold" style={{ color: "#CA8A04" }}>취소 시 처리 내용</p>
                <ul className="text-xs space-y-0.5" style={{ color: "#92400E" }}>
                  <li>· 상태가 <strong>대기</strong>로 돌아갑니다</li>
                  <li>· 프로젝트 매입 행의 승인이 해제됩니다</li>
                  <li>· 경영관리 직접매입 금액이 차감됩니다</li>
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
                {cancelling ? "처리 중..." : "승인 취소"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "#191F28" }}>입금요청</h1>
          <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>
            매입처에 지급해야 할 대금 지불을 요청합니다.
            {counts["대기"] > 0 && <span style={{ color: "#CA8A04" }}> · 대기 {counts["대기"]}건</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {scopedItems.some((i) => i.status === "대기") && (
            <button
              onClick={handlePendingExcel}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors hover:opacity-80"
              style={{ background: "rgba(234,179,8,0.1)", color: "#CA8A04", border: "1px solid rgba(234,179,8,0.3)" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              입금대기 엑셀
            </button>
          )}
          {scopedItems.some((i) => i.status === "승인" && !i.invoiceFileUrl) && (
            <button
              onClick={handleExcel}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors hover:opacity-80"
              style={{ background: "rgba(16,185,129,0.1)", color: "#059669", border: "1px solid rgba(16,185,129,0.25)" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              계산서 미발행 엑셀
            </button>
          )}
        </div>
      </div>

      {/* 월·날짜 필터 카드 */}
      {months.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #E9EBEF", background: "#fff" }}>
          {/* 월 행 */}
          <div className="flex items-center gap-2 flex-wrap px-4 py-3" style={{ background: "#F8FAFC" }}>
            <div className="flex items-center gap-1.5 mr-1">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span className="text-xs font-bold" style={{ color: "#64748B" }}>월</span>
            </div>
            <button
              onClick={() => { setSelectedMonth(null); setSelectedDate(null); }}
              className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
              style={{ background: selectedMonth === null ? "#191F28" : "#ECEEF2", color: selectedMonth === null ? "#fff" : "#475569" }}>
              전체 <span style={{ opacity: 0.55 }}>{items.length}</span>
            </button>
            {months.map((m) => {
              const count = items.filter((i) => i.requestedAt.startsWith(m)).length;
              const isActive = selectedMonth === m;
              const [y, mo] = m.split("-");
              return (
                <button key={m}
                  onClick={() => { setSelectedMonth(isActive ? null : m); setSelectedDate(null); }}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
                  style={{ background: isActive ? "#191F28" : "#ECEEF2", color: isActive ? "#fff" : "#475569" }}>
                  {y}년 {parseInt(mo)}월 <span style={{ opacity: 0.55 }}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* 날짜 행 */}
          {dates.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap px-4 py-2.5" style={{ borderTop: "1px solid #F1F5F9" }}>
              <div className="flex items-center gap-1.5 mr-1">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
                <span className="text-xs font-semibold" style={{ color: "#94A3B8" }}>날짜</span>
              </div>
              <button onClick={() => setSelectedDate(null)}
                className="text-xs font-semibold px-2.5 py-1 rounded-full transition-all"
                style={{
                  background: selectedDate === null ? "rgba(16,185,129,0.12)" : "transparent",
                  color: selectedDate === null ? "#059669" : "#94A3B8",
                  border: `1px solid ${selectedDate === null ? "rgba(16,185,129,0.3)" : "#E9EBEF"}`,
                }}>
                전체
              </button>
              {dates.map((d) => {
                const count = items.filter((i) => i.requestedAt === d).length;
                const isActive = selectedDate === d;
                return (
                  <button key={d} onClick={() => setSelectedDate(isActive ? null : d)}
                    className="text-xs font-semibold px-2.5 py-1 rounded-full transition-all"
                    style={{
                      background: isActive ? "#059669" : "transparent",
                      color: isActive ? "#fff" : "#64748B",
                      border: `1px solid ${isActive ? "#059669" : "#E9EBEF"}`,
                    }}>
                    {formatDate(d)} <span style={{ opacity: 0.65 }}>{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 상태 필터 */}
      <div className="flex items-center gap-1 p-0.5 rounded-xl self-start" style={{ background: "#F1F5F9" }}>
        {(["대기", "승인", "반려", "전체"] as const).map((s) => {
          const isActive = filter === s;
          const st = s !== "전체" ? STATUS_STYLE[s] : null;
          return (
            <button key={s} onClick={() => setFilter(s)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
              style={{ background: isActive ? "#fff" : "transparent", color: isActive ? (st?.color ?? "#191F28") : "#94A3B8", boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}>
              {s}
              <span className="font-bold" style={{ color: isActive ? (st?.color ?? "#191F28") : "#CBD5E1" }}>
                {counts[s as keyof typeof counts] ?? scopedItems.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* 테이블 */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
        {error ? (
          <div className="py-20 text-center">
            <p className="text-sm font-semibold" style={{ color: "#EF4444" }}>{error}</p>
            <p className="text-xs mt-1" style={{ color: "#94A3B8" }}>목록을 표시할 수 없습니다. 데이터가 없는 것으로 잘못 보이지 않도록 표시를 중단했습니다.</p>
            <button onClick={load} className="mt-3 px-4 py-1.5 text-sm font-semibold rounded-lg" style={{ background: "#3182F6", color: "#fff" }}>다시 시도</button>
          </div>
        ) : items.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-sm font-medium" style={{ color: "#94A3B8" }}>요청 내역이 없습니다.</p>
            <p className="text-xs mt-1" style={{ color: "#CBD5E1" }}>프로젝트 관리 → 매입 행의 <span style={{ color: "#059669" }}>입금요청</span> 버튼으로 추가하세요.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm" style={{ color: "#94A3B8" }}>해당 조건의 요청이 없습니다.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "#F8FAFC" }}>
                  {["캠페인명","팀","담당자","품명","매입처","개수","합계","요청일","상태"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold whitespace-nowrap" style={{ color: "#64748B" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const ss = STATUS_STYLE[item.status];
                  return (
                    <tr key={item.id}
                      className="border-t cursor-pointer"
                      style={{ borderColor: "#F1F5F9" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(49,130,246,0.03)")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                      onClick={() => setSelected(item)}
                    >
                      <td className="px-5 py-3.5 font-semibold text-xs" style={{ color: "#191F28" }}>{item.projectName}</td>
                      <td className="px-5 py-3.5">
                        {item.assignedTeam ? (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                            style={{
                              ...teamBadgeStyle(item.assignedTeam, 0.1),
                            }}>
                            {item.assignedTeam}
                          </span>
                        ) : <span style={{ color: "#CBD5E1" }}>—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>{item.requester}</td>
                      <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>{item.productName}</td>
                      <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>{item.vendor}</td>
                      <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>{item.quantity}</td>
                      <td className="px-5 py-3.5 text-xs font-bold" style={{ color: "#10B981" }}>{item.amount}</td>
                      <td className="px-5 py-3.5 text-xs" style={{ color: "#94A3B8" }}>{item.requestedAt}</td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
                          style={{ background: ss.bg, color: ss.color, border: `1px solid ${ss.border}` }}>
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 상세 모달 */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(25,31,40,0.45)" }} onClick={() => setSelected(null)}>
          <div className="rounded-2xl w-full max-w-lg mx-4 overflow-hidden flex flex-col"
            style={{ background: "#fff", boxShadow: "0 20px 60px rgba(22,31,51,0.18)", maxHeight: "92vh" }}
            onClick={(e) => e.stopPropagation()}>

            {/* 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: "1px solid #F1F5F9" }}>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
                  style={{ background: STATUS_STYLE[selected.status].bg, color: STATUS_STYLE[selected.status].color, border: `1px solid ${STATUS_STYLE[selected.status].border}` }}>
                  {selected.status}
                </span>
                {selected.invoiceFileName && (
                  <span className="text-xs font-medium" style={{ color: "#94A3B8" }}>{selected.invoiceFileName}</span>
                )}
              </div>
              <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* 바디 — 스크롤 가능 */}
            <div className="overflow-y-auto px-6 py-5 space-y-4">
              <h3 className="text-base font-bold" style={{ color: "#191F28" }}>{selected.projectName}</h3>

              {/* 세금계산서 — 상단에 크게 */}
              {selected.invoiceFileUrl && (
                <InvoiceView url={selected.invoiceFileUrl} name={selected.invoiceFileName} />
              )}

              {/* 정보 그리드 */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <div>
                  <p className="text-xs mb-1" style={{ color: "#94A3B8" }}>담당팀</p>
                  {selected.assignedTeam ? (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        ...teamBadgeStyle(selected.assignedTeam, 0.1),
                      }}>
                      {selected.assignedTeam}
                    </span>
                  ) : <p className="text-sm font-medium" style={{ color: "#CBD5E1" }}>—</p>}
                </div>
                {(() => {
                  // 요청 시 저장된 실제 단가를 우선 사용. 없는 과거 요청만 합계에서 역산한다
                  // (역산은 부가세 10% 포함을 가정하므로 면세 행에서는 값이 틀어진다.)
                  const totalAmt = parseInt((selected.amount || "").replace(/[₩,]/g, ""), 10);
                  const qty = parseInt(selected.quantity || "1", 10);
                  const unitPrice = selected.unitPrice
                    ? `₩${selected.unitPrice.toLocaleString()}`
                    : (!isNaN(totalAmt) && !isNaN(qty) && qty > 0)
                      ? `₩${Math.round(totalAmt / 1.1 / qty).toLocaleString()}`
                      : "—";
                  return [
                    { label: "담당자",   value: selected.requester },
                    { label: "품명",     value: selected.productName },
                    { label: "매입처",   value: selected.vendor },
                    { label: "개수",     value: selected.quantity },
                    { label: "개당 단가", value: unitPrice },
                    { label: "합계",     value: selected.amount, bold: true, color: "#10B981" },
                    {
                      label: "작업기간",
                      value: selected.workStartDate && selected.workEndDate
                        ? `${selected.workStartDate} ~ ${selected.workEndDate}`
                        : selected.workStartDate || selected.workEndDate || "—",
                    },
                    { label: "요청일",   value: selected.requestedAt },
                  ] as { label: string; value: string; bold?: boolean; color?: string }[];
                })().map(({ label, value, bold, color }) => (
                  <div key={label}>
                    <p className="text-xs mb-1" style={{ color: "#94A3B8" }}>{label}</p>
                    <p className="text-sm" style={{ color: color ?? "#191F28", fontWeight: bold ? 700 : 500 }}>{value}</p>
                  </div>
                ))}
              </div>

              {/* 입금계좌 */}
              <div className="rounded-xl overflow-hidden" style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.18)" }}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round">
                    <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold mb-0.5" style={{ color: "#059669" }}>입금계좌</p>
                    {editingAccount ? (
                      <input
                        value={accountDraft}
                        onChange={(e) => setAccountDraft(e.target.value)}
                        placeholder="은행명 계좌번호 예금주"
                        className="w-full text-sm px-2 py-1 rounded-lg outline-none border focus:border-[#059669]"
                        style={{ borderColor: "#D1FAE5", background: "#fff", color: "#191F28" }}
                        autoFocus
                      />
                    ) : (
                      <p className="text-sm font-medium truncate" style={{ color: selected.vendorBankAccount ? "#191F28" : "#94A3B8" }}>
                        {selected.vendorBankAccount || "—"}
                      </p>
                    )}
                  </div>
                  {!editingAccount ? (
                    <button
                      onClick={() => { setAccountDraft(selected.vendorBankAccount ?? ""); setEditingAccount(true); }}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg shrink-0"
                      style={{ background: "rgba(16,185,129,0.12)", color: "#059669" }}>
                      수정
                    </button>
                  ) : (
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={async () => {
                          const trimmed = accountDraft.trim();
                          await updatePaymentRequest(selected.id, { vendorBankAccount: trimmed || undefined });
                          setItems((prev) => prev.map((i) => i.id === selected.id ? { ...i, vendorBankAccount: trimmed || undefined } : i));
                          setSelected((prev) => prev ? { ...prev, vendorBankAccount: trimmed || undefined } : prev);
                          setEditingAccount(false);
                        }}
                        className="text-xs font-semibold px-2.5 py-1 rounded-lg text-white"
                        style={{ background: "#059669" }}>
                        저장
                      </button>
                      <button
                        onClick={() => setEditingAccount(false)}
                        className="text-xs font-semibold px-2.5 py-1 rounded-lg border"
                        style={{ borderColor: "#D1D5DB", color: "#64748B" }}>
                        취소
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {selected.status === "반려" && selected.rejectReason && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-xl"
                  style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}>
                  <svg className="mt-0.5 shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <div>
                    <p className="text-xs font-semibold mb-0.5" style={{ color: "#DC2626" }}>반려 사유</p>
                    <p className="text-xs" style={{ color: "#475569" }}>{selected.rejectReason}</p>
                  </div>
                </div>
              )}
            </div>

            {/* 푸터 */}
            <div className="px-6 py-4 shrink-0 space-y-3" style={{ borderTop: "1px solid #F1F5F9" }}>
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
              {selected.status === "대기" && (<>
                {/* 승인일 선택 */}
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: "#F8FAFC", border: "1px solid #E9EBEF" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  <label className="text-xs font-semibold whitespace-nowrap" style={{ color: "#64748B" }}>승인일</label>
                  <input type="date" value={approveDate} onChange={e => setApproveDate(e.target.value)}
                    className="flex-1 text-sm bg-transparent outline-none" style={{ color: "#191F28" }} />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setRejectTarget(selected)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90"
                    style={{ background: "rgba(239,68,68,0.1)", color: "#DC2626" }}>반려</button>
                  <button onClick={() => updateStatus(selected.id, "승인", approveDate)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90"
                    style={{ background: "#3182F6" }}>승인</button>
                </div>
              </>)}
              {selected.status === "승인" && (<>
                <button onClick={() => setSelected(null)}
                  className="py-2.5 px-5 rounded-xl text-sm font-semibold"
                  style={{ background: "#F1F5F9", color: "#475569" }}>닫기</button>
                <button onClick={() => setCancelTarget(selected)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
                  style={{ background: "rgba(234,179,8,0.1)", color: "#CA8A04", border: "1px solid rgba(234,179,8,0.25)" }}>
                  승인 취소
                </button>
              </>)}
              {selected.status === "반려" && (
                <button onClick={() => setSelected(null)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: "#F1F5F9", color: "#475569" }}>닫기</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
