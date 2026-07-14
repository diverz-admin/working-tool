"use client";

import { useState, useEffect } from "react";
import { useUser } from "@/lib/UserContext";
import {
  LEAVE_TYPES, calcLeaveDays, fmtDays, fmtPeriod,
  type LeaveBalance, type LeaveItem, type LeaveStatus, type LeaveType,
} from "@/lib/leave";

const STATUS_STYLE: Record<LeaveStatus, { bg: string; color: string; border: string }> = {
  대기: { bg: "rgba(234,179,8,0.1)",  color: "#CA8A04", border: "rgba(234,179,8,0.25)" },
  승인: { bg: "rgba(16,185,129,0.1)", color: "#059669", border: "rgba(16,185,129,0.25)" },
  반려: { bg: "rgba(239,68,68,0.1)",  color: "#DC2626", border: "rgba(239,68,68,0.25)" },
};

const LEAVE_TYPE_STYLE: Record<LeaveType, { bg: string; color: string }> = {
  연차:  { bg: "rgba(139,92,246,0.1)",  color: "#8B5CF6" },
  반차:  { bg: "rgba(99,102,241,0.1)",  color: "#6366F1" },
  병가:  { bg: "rgba(249,115,22,0.1)",  color: "#F97316" },
  기타:  { bg: "rgba(148,163,184,0.1)", color: "#64748B" },
};

// ── 잔여 연차 카드 ────────────────────────────────────────
function BalanceCard({ balance }: { balance: LeaveBalance | null }) {
  const cells = [
    { label: "부여 연차", value: balance?.granted   ?? 0, color: "#191F28" },
    { label: "사용",      value: balance?.used      ?? 0, color: "#64748B" },
    { label: "잔여",      value: balance?.remaining ?? 0, color: "#8B5CF6" },
  ];
  return (
    <div className="flex items-center gap-6 px-5 py-4 rounded-2xl" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
      {cells.map((c, i) => (
        <div key={c.label} className="flex items-center gap-6">
          {i > 0 && <div className="w-px h-8" style={{ background: "#F1F5F9" }} />}
          <div>
            <p className="text-xs mb-1" style={{ color: "#94A3B8" }}>{c.label}</p>
            <p className="text-lg font-bold" style={{ color: c.color }}>
              {fmtDays(c.value)}<span className="text-xs font-semibold ml-0.5" style={{ color: "#94A3B8" }}>일</span>
            </p>
          </div>
        </div>
      ))}
      <p className="ml-auto text-xs" style={{ color: "#CBD5E1" }}>
        {new Date().getFullYear()}년 기준 · 승인된 연차·반차만 차감됩니다
      </p>
    </div>
  );
}

// ── 요청 모달 ─────────────────────────────────────────────
interface RequestForm {
  leaveType:   LeaveType;
  title:       string;
  startDate:   string;
  endDate:     string;
  requestedAt: string;
  note:        string;
}

function RequestModal({ remaining, initial, onClose, onSubmit }: {
  remaining: number;
  initial?:  LeaveItem;
  onClose:   () => void;
  onSubmit:  (form: RequestForm) => Promise<void>;
}) {
  const isEdit = Boolean(initial);
  const today  = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<RequestForm>({
    leaveType:   initial?.leaveType   ?? "연차",
    title:       initial?.title       ?? "",
    startDate:   initial?.startDate   ?? today,
    endDate:     initial?.endDate     ?? "",
    requestedAt: initial?.requestedAt ?? today,
    note:        initial?.note        ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const isRange   = form.leaveType === "연차";
  const leaveDays = calcLeaveDays(form.leaveType, form.startDate, isRange ? form.endDate : null);
  const invalidRange = Boolean(isRange && form.endDate && form.endDate < form.startDate);
  const exceeds      = leaveDays > remaining;

  function set(k: keyof RequestForm, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.startDate || invalidRange) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ ...form, endDate: isRange ? form.endDate : "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "요청에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(25,31,40,0.45)" }} onClick={onClose}>
      <div className="rounded-2xl w-full max-w-lg mx-4 overflow-hidden" style={{ background: "#fff", boxShadow: "0 20px 60px rgba(22,31,51,0.18)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #F1F5F9" }}>
          <h2 className="text-sm font-bold" style={{ color: "#191F28" }}>{isEdit ? "휴가 수정 후 재요청" : "휴가 결재 요청"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form id="leave-form" onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>휴가 종류 <span style={{ color: "#EF4444" }}>*</span></label>
            <div className="flex gap-2">
              {LEAVE_TYPES.map((t) => {
                const active = form.leaveType === t;
                const st = LEAVE_TYPE_STYLE[t];
                return (
                  <button key={t} type="button" onClick={() => set("leaveType", t)}
                    className="flex-1 py-2 rounded-xl text-sm font-semibold transition-all"
                    style={{
                      background: active ? st.bg : "#F8FAFC",
                      color:      active ? st.color : "#B0B8C1",
                      border:     `1px solid ${active ? st.color : "#E9EBEF"}`,
                    }}>
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>제목 <span style={{ color: "#EF4444" }}>*</span></label>
            <input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="예) 연차 휴가 신청"
              required
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
              style={{ background: "#F8FAFC", border: "1px solid #E9EBEF", color: "#191F28" }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>시작일 <span style={{ color: "#EF4444" }}>*</span></label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => set("startDate", e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={{ background: "#F8FAFC", border: "1px solid #E9EBEF", color: "#191F28" }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>
                종료일 {!isRange && <span style={{ color: "#CBD5E1" }}>(하루 단위)</span>}
              </label>
              <input
                type="date"
                value={isRange ? form.endDate : ""}
                min={form.startDate}
                disabled={!isRange}
                onChange={(e) => set("endDate", e.target.value)}
                placeholder="미입력 시 하루"
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none disabled:opacity-50"
                style={{ background: "#F8FAFC", border: "1px solid #E9EBEF", color: "#191F28" }}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>사유</label>
            <textarea
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
              placeholder="휴가 사유를 입력하세요 (선택)"
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
              style={{ background: "#F8FAFC", border: "1px solid #E9EBEF", color: "#191F28" }}
            />
          </div>

          <div className="px-4 py-3 rounded-xl" style={{ background: "#F8FAFC" }}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-xs font-semibold" style={{ color: "#64748B" }}>차감 연차</span>
              <span className="font-bold" style={{ color: leaveDays > 0 ? "#8B5CF6" : "#94A3B8" }}>
                {leaveDays > 0 ? `${fmtDays(leaveDays)}일` : "차감 없음"}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1.5">
              <span className="text-xs font-semibold" style={{ color: "#64748B" }}>승인 후 잔여</span>
              <span className="font-bold" style={{ color: exceeds ? "#DC2626" : "#191F28" }}>
                {fmtDays(Math.round((remaining - leaveDays) * 10) / 10)}일
              </span>
            </div>
            {isRange && <p className="text-xs mt-2" style={{ color: "#CBD5E1" }}>주말(토·일)은 차감되지 않습니다.</p>}
          </div>

          {invalidRange && <p className="text-xs" style={{ color: "#EF4444" }}>종료일은 시작일보다 빠를 수 없습니다.</p>}
          {exceeds && !invalidRange && (
            <p className="text-xs" style={{ color: "#EF4444" }}>잔여 연차({fmtDays(remaining)}일)를 초과합니다. 승인 시 관리자 확인이 필요합니다.</p>
          )}
          {error && <p className="text-xs" style={{ color: "#EF4444" }}>{error}</p>}
        </form>

        <div className="flex gap-2 px-6 py-4" style={{ borderTop: "1px solid #F1F5F9" }}>
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold hover:opacity-80"
            style={{ background: "#F1F5F9", color: "#64748B" }}>취소</button>
          <button
            type="submit"
            form="leave-form"
            disabled={saving || !form.title.trim() || !form.startDate || invalidRange}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            style={{ background: "#8B5CF6" }}>
            {saving ? "요청 중..." : isEdit ? "재요청" : "결재 요청"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 상세 모달 (조회 전용) ──────────────────────────────────
function DetailModal({ item, onClose, onDelete, onResubmit }: {
  item:        LeaveItem;
  onClose:     () => void;
  onDelete:    (id: string) => Promise<void>;
  onResubmit?: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const ss = STATUS_STYLE[item.status];
  const lt = LEAVE_TYPE_STYLE[item.leaveType];

  async function handleDelete() {
    if (!confirm("요청을 취소하시겠습니까?")) return;
    setDeleting(true);
    try { await onDelete(item.id); } finally { setDeleting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(25,31,40,0.45)" }} onClick={onClose}>
      <div className="rounded-2xl w-full max-w-md mx-4 overflow-hidden" style={{ background: "#fff", boxShadow: "0 20px 60px rgba(22,31,51,0.18)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #F1F5F9" }}>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: lt.bg, color: lt.color }}>{item.leaveType}</span>
            <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: ss.bg, color: ss.color, border: `1px solid ${ss.border}` }}>
              {item.status}
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          <h3 className="text-base font-bold" style={{ color: "#191F28" }}>{item.title}</h3>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs mb-1" style={{ color: "#94A3B8" }}>요청자</p>
              <p className="font-semibold" style={{ color: "#191F28" }}>{item.requester}</p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: "#94A3B8" }}>요청일</p>
              <p className="font-medium" style={{ color: "#191F28" }}>{item.requestedAt}</p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: "#94A3B8" }}>휴가기간</p>
              <p className="font-medium" style={{ color: "#191F28" }}>{fmtPeriod(item.startDate, item.endDate)}</p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: "#94A3B8" }}>차감 연차</p>
              <p className="font-bold" style={{ color: item.leaveDays > 0 ? "#8B5CF6" : "#CBD5E1" }}>
                {item.leaveDays > 0 ? `${fmtDays(item.leaveDays)}일` : "차감 없음"}
              </p>
            </div>
          </div>

          {item.note && (
            <div className="px-4 py-3 rounded-xl text-sm whitespace-pre-wrap" style={{ background: "#F8FAFC", color: "#475569" }}>
              {item.note}
            </div>
          )}

          {item.rejectReason && (
            <div className="px-4 py-3 rounded-xl text-sm" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)", color: "#DC2626" }}>
              <span className="font-semibold">반려 사유: </span>{item.rejectReason}
            </div>
          )}
        </div>

        {(item.status === "대기" || item.status === "반려") && (
          <div className="flex gap-2 px-6 py-4" style={{ borderTop: "1px solid #F1F5F9" }}>
            {item.status === "반려" && onResubmit && (
              <button onClick={onResubmit}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold hover:opacity-80"
                style={{ background: "rgba(139,92,246,0.1)", color: "#8B5CF6" }}>
                수정 후 재요청
              </button>
            )}
            {item.status === "대기" && (
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold hover:opacity-80 disabled:opacity-50"
                style={{ background: "rgba(239,68,68,0.08)", color: "#DC2626" }}>
                {deleting ? "취소 중..." : "요청 취소"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────
export default function LeavePage() {
  const { name: currentUser } = useUser();
  const [items, setItems]         = useState<LeaveItem[]>([]);
  const [balance, setBalance]     = useState<LeaveBalance | null>(null);
  const [filterStatus, setStatus] = useState<LeaveStatus | "전체">("전체");
  const [selected, setSelected]   = useState<LeaveItem | null>(null);
  const [editItem, setEditItem]   = useState<LeaveItem | null>(null);
  const [showForm, setShowForm]   = useState(false);
  const [loading, setLoading]     = useState(true);

  async function loadItems() {
    const res = await fetch("/api/approvals/leave")
      .then((r) => r.json())
      .catch(() => ({ items: [], balances: {} }));
    const all: LeaveItem[] = res.items ?? [];
    setItems(all.filter((i) => i.requester === currentUser));
    setBalance(res.balances?.[currentUser] ?? null);
    setLoading(false);
  }

  useEffect(() => { loadItems(); }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = {
    전체: items.length,
    대기: items.filter((i) => i.status === "대기").length,
    승인: items.filter((i) => i.status === "승인").length,
    반려: items.filter((i) => i.status === "반려").length,
  };

  const filtered = filterStatus === "전체" ? items : items.filter((i) => i.status === filterStatus);

  async function submitForm(form: RequestForm, id?: string) {
    const payload = {
      title:       form.title,
      leaveType:   form.leaveType,
      requester:   currentUser,
      startDate:   form.startDate,
      endDate:     form.endDate || null,
      requestedAt: form.requestedAt,
      note:        form.note || null,
      ...(id ? { status: "대기", rejectReason: null } : {}),
    };
    const res = await fetch(id ? `/api/approvals/leave/${id}` : "/api/approvals/leave", {
      method:  id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "요청에 실패했습니다.");

    setItems((p) => id ? p.map((i) => i.id === id ? data.item : i) : [data.item, ...p]);
    window.dispatchEvent(new Event("approval-request-added"));
    return data.item as LeaveItem;
  }

  async function handleSubmit(form: RequestForm) {
    await submitForm(form);
    setShowForm(false);
  }

  async function handleResubmit(form: RequestForm) {
    if (!editItem) return;
    await submitForm(form, editItem.id);
    setEditItem(null);
  }

  async function handleDelete(id: string) {
    await fetch(`/api/approvals/leave/${id}`, { method: "DELETE" });
    setItems((p) => p.filter((i) => i.id !== id));
    setSelected(null);
    window.dispatchEvent(new Event("approval-request-added"));
  }

  const remaining = balance?.remaining ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "#191F28" }}>휴가</h1>
          <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>휴가·반차 결재를 요청합니다. 대기 {counts["대기"]}건</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90"
          style={{ background: "#8B5CF6" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          결재 요청
        </button>
      </div>

      <BalanceCard balance={balance} />

      <div className="flex items-center gap-1 p-0.5 rounded-xl self-start" style={{ background: "#F1F5F9" }}>
        {(["전체", "대기", "승인", "반려"] as const).map((s) => {
          const isActive = filterStatus === s;
          const style = s !== "전체" ? STATUS_STYLE[s] : null;
          return (
            <button key={s} onClick={() => setStatus(s)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
              style={{ background: isActive ? "#fff" : "transparent", color: isActive ? (style?.color ?? "#191F28") : "#94A3B8", boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}>
              {s}
              <span className="font-bold" style={{ color: isActive ? (style?.color ?? "#191F28") : "#CBD5E1" }}>
                {counts[s as keyof typeof counts] ?? items.length}
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "#F8FAFC" }}>
              {["구분", "제목", "휴가기간", "차감", "요청일", "상태"].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-xs font-semibold whitespace-nowrap" style={{ color: "#64748B" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="py-16 text-center text-sm" style={{ color: "#94A3B8" }}>불러오는 중...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="py-16 text-center text-sm" style={{ color: "#94A3B8" }}>요청 내역이 없습니다.</td></tr>
            ) : filtered.map((item) => {
              const ss = STATUS_STYLE[item.status];
              const lt = LEAVE_TYPE_STYLE[item.leaveType];
              return (
                <tr key={item.id}
                  className="border-t cursor-pointer"
                  style={{ borderColor: "#F1F5F9" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.03)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                  onClick={() => setSelected(item)}>
                  <td className="px-5 py-3.5">
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: lt.bg, color: lt.color }}>{item.leaveType}</span>
                  </td>
                  <td className="px-5 py-3.5 font-semibold text-xs" style={{ color: "#191F28" }}>{item.title}</td>
                  <td className="px-5 py-3.5 text-xs whitespace-nowrap" style={{ color: "#475569" }}>{fmtPeriod(item.startDate, item.endDate)}</td>
                  <td className="px-5 py-3.5 text-xs font-medium" style={{ color: item.leaveDays > 0 ? "#8B5CF6" : "#CBD5E1" }}>
                    {item.leaveDays > 0 ? `${fmtDays(item.leaveDays)}일` : "—"}
                  </td>
                  <td className="px-5 py-3.5 text-xs" style={{ color: "#94A3B8" }}>{item.requestedAt}</td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: ss.bg, color: ss.color, border: `1px solid ${ss.border}` }}>
                      {item.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showForm && (
        <RequestModal
          remaining={remaining}
          onClose={() => setShowForm(false)}
          onSubmit={handleSubmit}
        />
      )}

      {editItem && (
        <RequestModal
          remaining={remaining}
          initial={editItem}
          onClose={() => setEditItem(null)}
          onSubmit={handleResubmit}
        />
      )}

      {selected && (
        <DetailModal
          item={selected}
          onClose={() => setSelected(null)}
          onDelete={handleDelete}
          onResubmit={() => { setEditItem(selected); setSelected(null); }}
        />
      )}
    </div>
  );
}
