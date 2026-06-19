"use client";

import { useState, useEffect } from "react";

type Status = "대기" | "승인" | "반려";

interface Attachment { url: string; name: string; }

interface ExpenseItem {
  id:           string;
  title:        string;
  assignedTeam: string | null;
  requester:    string;
  requestedAt:  string;
  amount:       number | null;
  content:      string | null;
  attachments:  string | null;
  status:       Status;
  rejectReason: string | null;
  createdAt:    string;
}

const STATUS_STYLE: Record<Status, { bg: string; color: string; border: string }> = {
  대기: { bg: "rgba(234,179,8,0.1)",  color: "#CA8A04", border: "rgba(234,179,8,0.25)" },
  승인: { bg: "rgba(16,185,129,0.1)", color: "#059669", border: "rgba(16,185,129,0.25)" },
  반려: { bg: "rgba(239,68,68,0.1)",  color: "#DC2626", border: "rgba(239,68,68,0.25)" },
};

function parseAttachments(raw: string | null): Attachment[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function fmtAmount(v: number | null) {
  if (!v) return "—";
  return "₩" + v.toLocaleString();
}

// ── 반려 사유 모달 ────────────────────────────────────────
function RejectModal({ onClose, onConfirm }: {
  onClose:   () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    setSaving(true);
    try { await onConfirm(reason.trim()); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(25,31,40,0.45)" }} onClick={onClose}>
      <div className="rounded-2xl w-full max-w-sm mx-4 overflow-hidden" style={{ background: "#fff", boxShadow: "0 20px 60px rgba(22,31,51,0.18)" }} onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4" style={{ borderBottom: "1px solid #F1F5F9" }}>
          <h2 className="text-sm font-bold" style={{ color: "#191F28" }}>반려 사유 입력</h2>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="반려 사유를 입력하세요"
            rows={4}
            required
            autoFocus
            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
            style={{ background: "#F8FAFC", border: "1px solid #E9EBEF", color: "#191F28" }}
          />
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold hover:opacity-80"
              style={{ background: "#F1F5F9", color: "#64748B" }}>취소</button>
            <button type="submit" disabled={saving || !reason.trim()}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              style={{ background: "#EF4444" }}>
              {saving ? "처리 중..." : "반려"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── 상세 모달 ─────────────────────────────────────────────
function DetailModal({ item, onClose, onAction }: {
  item:     ExpenseItem;
  onClose:  () => void;
  onAction: (id: string, status: Status, reason?: string) => Promise<void>;
}) {
  const attachments = parseAttachments(item.attachments);
  const [loading, setLoading]       = useState(false);
  const [showReject, setShowReject] = useState(false);
  const ss = STATUS_STYLE[item.status];

  async function handleApprove() {
    setLoading(true);
    try { await onAction(item.id, "승인"); } finally { setLoading(false); }
  }

  async function handleReject(reason: string) {
    await onAction(item.id, "반려", reason);
    setShowReject(false);
  }

  function openAttachment(a: Attachment) {
    const link = document.createElement("a");
    link.href = a.url;
    link.download = a.name;
    link.click();
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(25,31,40,0.45)" }} onClick={onClose}>
        <div className="rounded-2xl w-full max-w-md mx-4 overflow-hidden" style={{ background: "#fff", boxShadow: "0 20px 60px rgba(22,31,51,0.18)" }} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #F1F5F9" }}>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(139,92,246,0.1)", color: "#8B5CF6" }}>내부결재</span>
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

            <div className="grid grid-cols-2 gap-3 text-sm">
              {item.assignedTeam && (
                <div>
                  <p className="text-xs mb-1" style={{ color: "#94A3B8" }}>담당팀</p>
                  <p className="font-semibold" style={{ color: "#191F28" }}>{item.assignedTeam}</p>
                </div>
              )}
              <div>
                <p className="text-xs mb-1" style={{ color: "#94A3B8" }}>요청자</p>
                <p className="font-semibold" style={{ color: "#191F28" }}>{item.requester}</p>
              </div>
              <div>
                <p className="text-xs mb-1" style={{ color: "#94A3B8" }}>요청일</p>
                <p className="font-medium" style={{ color: "#191F28" }}>{item.requestedAt}</p>
              </div>
              {item.amount != null && (
                <div>
                  <p className="text-xs mb-1" style={{ color: "#94A3B8" }}>금액</p>
                  <p className="font-bold" style={{ color: "#3182F6" }}>{fmtAmount(item.amount)}</p>
                </div>
              )}
            </div>

            {item.content && (
              <div className="px-4 py-3 rounded-xl text-sm whitespace-pre-wrap" style={{ background: "#F8FAFC", color: "#475569" }}>
                {item.content}
              </div>
            )}

            {attachments.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: "#64748B" }}>첨부파일</p>
                <div className="flex flex-wrap gap-2">
                  {attachments.map((a, i) => (
                    <button key={i} onClick={() => openAttachment(a)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium hover:opacity-80 transition-opacity"
                      style={{ background: "#F1F5F9", border: "1px solid #E9EBEF", color: "#475569" }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                      <span className="max-w-[120px] truncate">{a.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {item.rejectReason && (
              <div className="px-4 py-3 rounded-xl text-sm" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)", color: "#DC2626" }}>
                <span className="font-semibold">반려 사유: </span>{item.rejectReason}
              </div>
            )}
          </div>

          {item.status === "대기" && (
            <div className="flex gap-2 px-6 py-4" style={{ borderTop: "1px solid #F1F5F9" }}>
              <button onClick={() => setShowReject(true)} disabled={loading}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                style={{ background: "rgba(239,68,68,0.1)", color: "#DC2626" }}>반려</button>
              <button onClick={handleApprove} disabled={loading}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                style={{ background: "#3182F6" }}>
                {loading ? "처리 중..." : "승인"}
              </button>
            </div>
          )}
        </div>
      </div>

      {showReject && (
        <RejectModal onClose={() => setShowReject(false)} onConfirm={handleReject} />
      )}
    </>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────
export default function InternalConfirmPage() {
  const [items, setItems]         = useState<ExpenseItem[]>([]);
  const [filterStatus, setStatus] = useState<Status | "전체">("대기");
  const [selected, setSelected]   = useState<ExpenseItem | null>(null);
  const [loading, setLoading]     = useState(true);

  async function loadItems() {
    setLoading(true);
    const res = await fetch("/api/approvals/expense").then((r) => r.json()).catch(() => ({ items: [] }));
    setItems(res.items ?? []);
    setLoading(false);
  }

  useEffect(() => { loadItems(); }, []);

  const counts = {
    전체: items.length,
    대기: items.filter((i) => i.status === "대기").length,
    승인: items.filter((i) => i.status === "승인").length,
    반려: items.filter((i) => i.status === "반려").length,
  };

  const filtered = filterStatus === "전체" ? items : items.filter((i) => i.status === filterStatus);

  async function handleAction(id: string, status: Status, rejectReason?: string) {
    const res = await fetch(`/api/approvals/expense/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ status, rejectReason: rejectReason ?? null }),
    }).then((r) => r.json());
    setItems((p) => p.map((i) => i.id === id ? res.item : i));
    setSelected(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "#191F28" }}>내부지출</h1>
          <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>내부지출 결재 요청을 검토하고 승인 또는 반려합니다. 대기 {counts["대기"]}건</p>
        </div>
        <button
          type="button"
          onClick={loadItems}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold hover:opacity-80 transition-opacity"
          style={{ background: "#F1F5F9", color: "#64748B", border: "1px solid #E9EBEF" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          새로고침
        </button>
      </div>

      <div className="flex items-center gap-1 p-0.5 rounded-xl self-start" style={{ background: "#F1F5F9" }}>
        {(["대기", "승인", "반려", "전체"] as const).map((s) => {
          const isActive = filterStatus === s;
          const style = s !== "전체" ? STATUS_STYLE[s] : null;
          return (
            <button key={s} onClick={() => setStatus(s)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: isActive ? "#fff" : "transparent",
                color: isActive ? (style?.color ?? "#191F28") : "#94A3B8",
                boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}>
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
              {["제목", "담당팀", "요청자", "요청일", "금액", "상태", ""].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-xs font-semibold whitespace-nowrap" style={{ color: "#64748B" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-16 text-center text-sm" style={{ color: "#94A3B8" }}>불러오는 중...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="py-16 text-center text-sm" style={{ color: "#94A3B8" }}>
                {filterStatus === "대기" ? "검토 대기 중인 요청이 없습니다." : "요청 내역이 없습니다."}
              </td></tr>
            ) : filtered.map((item) => {
              const ss = STATUS_STYLE[item.status];
              const attCount = parseAttachments(item.attachments).length;
              return (
                <tr key={item.id}
                  className="border-t cursor-pointer group"
                  style={{ borderColor: "#F1F5F9" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.03)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                  onClick={() => setSelected(item)}>
                  <td className="px-5 py-3.5 text-xs" style={{ color: "#191F28" }}>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{item.title}</span>
                      {attCount > 0 && (
                        <span className="text-xs px-1.5 py-0.5 rounded-md font-medium" style={{ background: "#F1F5F9", color: "#94A3B8" }}>
                          📎 {attCount}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>{item.assignedTeam ?? "—"}</td>
                  <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>{item.requester}</td>
                  <td className="px-5 py-3.5 text-xs" style={{ color: "#94A3B8" }}>{item.requestedAt}</td>
                  <td className="px-5 py-3.5 text-xs font-medium" style={{ color: item.amount ? "#3182F6" : "#CBD5E1" }}>
                    {fmtAmount(item.amount)}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: ss.bg, color: ss.color, border: `1px solid ${ss.border}` }}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-3 py-3.5">
                    {item.status === "대기" && (
                      <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); setSelected(item); }}
                          className="text-xs font-semibold px-3 py-1 rounded-lg text-white"
                          style={{ background: "#8B5CF6" }}>검토</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <DetailModal
          item={selected}
          onClose={() => setSelected(null)}
          onAction={handleAction}
        />
      )}
    </div>
  );
}
