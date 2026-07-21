"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchJson } from "@/lib/fetch-json";

interface Notice {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  isActive: boolean;
  priority: number;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

const EMPTY: Omit<Notice, "id" | "createdAt" | "updatedAt"> = {
  title: "", content: "", isPinned: false, isActive: true, priority: 0, authorName: "관리자",
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

/* ── 작성/수정 모달 ── */
function NoticeModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Notice | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(initial ?? EMPTY);
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  async function save() {
    if (!form.title.trim()) return;
    setSaving(true);
    if (initial) {
      await fetch(`/api/notices/${initial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } else {
      await fetch("/api/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    }
    setSaving(false);
    onSaved();
  }

  const inputCls = "w-full px-3 py-2 rounded-xl text-sm outline-none transition-all";
  const inputStyle = { border: "1px solid #E9EBEF", background: "#FAFAFA", color: "#191F28" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(25,31,40,0.45)" }}>
      <div className="rounded-2xl w-full max-w-xl mx-4 overflow-hidden" style={{ background: "#FFFFFF", boxShadow: "0 20px 60px rgba(22,31,51,0.18)" }}>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #F1F5F9" }}>
          <h2 className="text-base font-bold" style={{ color: "#191F28" }}>
            {initial ? "공지사항 수정" : "공지사항 작성"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* 폼 */}
        <div className="px-6 py-5 space-y-4">
          {/* 제목 */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>제목 *</label>
            <input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="공지 제목을 입력하세요"
              className={inputCls}
              style={inputStyle}
            />
          </div>

          {/* 내용 */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>내용</label>
            <textarea
              value={form.content}
              onChange={(e) => set("content", e.target.value)}
              placeholder="공지 내용을 입력하세요"
              rows={5}
              className={inputCls + " resize-none"}
              style={inputStyle}
            />
          </div>

          {/* 작성자 + 우선순위 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>작성자</label>
              <input
                value={form.authorName}
                onChange={(e) => set("authorName", e.target.value)}
                className={inputCls}
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>우선순위 (높을수록 상위 노출)</label>
              <input
                type="number"
                value={form.priority}
                onChange={(e) => set("priority", parseInt(e.target.value) || 0)}
                className={inputCls}
                style={inputStyle}
              />
            </div>
          </div>

          {/* 토글 옵션 */}
          <div className="flex items-center gap-5">
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                onClick={() => set("isPinned", !form.isPinned)}
                className="relative w-9 h-5 rounded-full transition-colors"
                style={{ background: form.isPinned ? "#F59E0B" : "#E2E8F0" }}
              >
                <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                  style={{ left: form.isPinned ? "calc(100% - 18px)" : "2px" }} />
              </div>
              <span className="text-xs font-semibold" style={{ color: form.isPinned ? "#F59E0B" : "#94A3B8" }}>
                대시보드에 고정
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                onClick={() => set("isActive", !form.isActive)}
                className="relative w-9 h-5 rounded-full transition-colors"
                style={{ background: form.isActive ? "#10B981" : "#E2E8F0" }}
              >
                <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                  style={{ left: form.isActive ? "calc(100% - 18px)" : "2px" }} />
              </div>
              <span className="text-xs font-semibold" style={{ color: form.isActive ? "#10B981" : "#94A3B8" }}>
                {form.isActive ? "공개" : "비공개"}
              </span>
            </label>
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex justify-end gap-2 px-6 py-4" style={{ borderTop: "1px solid #F1F5F9" }}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
            style={{ background: "#F8FAFC", color: "#64748B", border: "1px solid #E9EBEF" }}>
            취소
          </button>
          <button onClick={save} disabled={saving || !form.title.trim()}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" }}>
            {saving ? "저장 중..." : initial ? "수정 완료" : "작성 완료"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── 메인 페이지 ── */
export default function NoticesPage() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<"create" | null>(null);
  const [editTarget, setEditTarget] = useState<Notice | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [filter, setFilter] = useState<"전체" | "공개" | "고정">("전체");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchJson<{ notices?: Notice[] }>("/api/notices")
      .then((d) => setNotices(d.notices ?? []))
      // 실패를 "공지 없음"으로 보여주면 안 된다
      .catch((e: Error) => { setError(e.message); setNotices([]); })
      .finally(() => setLoading(false));
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function togglePinned(n: Notice) {
    await fetch(`/api/notices/${n.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPinned: !n.isPinned }),
    });
    load();
  }

  async function toggleActive(n: Notice) {
    await fetch(`/api/notices/${n.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !n.isActive }),
    });
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("공지사항을 삭제하시겠습니까?")) return;
    setDeleting(id);
    await fetch(`/api/notices/${id}`, { method: "DELETE" });
    setDeleting(null);
    load();
  }

  const filtered = notices.filter((n) => {
    if (filter === "공개") return n.isActive;
    if (filter === "고정") return n.isPinned;
    return true;
  });

  const counts = {
    전체: notices.length,
    공개: notices.filter((n) => n.isActive).length,
    고정: notices.filter((n) => n.isPinned).length,
  };

  return (
    <div className="space-y-5">
      {(modal === "create") && (
        <NoticeModal initial={null} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />
      )}
      {editTarget && (
        <NoticeModal initial={editTarget} onClose={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); load(); }} />
      )}

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "#191F28" }}>공지사항 관리</h1>
          <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>
            대시보드 상단에 고정할 공지를 작성하고 관리합니다.
          </p>
        </div>
        <button
          onClick={() => setModal("create")}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          공지 작성
        </button>
      </div>

      {/* 카드 */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E9EBEF" }}>
        {/* 탭 필터 */}
        <div className="px-6 pt-4 pb-0" style={{ borderBottom: "1px solid #F1F5F9" }}>
          <div className="flex gap-1">
            {(["전체", "공개", "고정"] as const).map((key) => {
              const isActive = filter === key;
              const color = key === "고정" ? "#F59E0B" : key === "공개" ? "#10B981" : "#191F28";
              return (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors"
                  style={{
                    color: isActive ? color : "#94A3B8",
                    borderBottom: isActive ? `2px solid ${color}` : "2px solid transparent",
                    marginBottom: "-1px",
                    background: "transparent",
                  }}
                >
                  {key === "고정" && <svg width="11" height="11" viewBox="0 0 24 24" fill={isActive ? color : "#CBD5E1"} stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>}
                  {key}
                  <span className="text-xs px-1.5 py-0.5 rounded-full font-bold"
                    style={{ background: isActive ? `${color}15` : "#F1F5F9", color: isActive ? color : "#94A3B8" }}>
                    {counts[key]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 목록 */}
        {loading ? (
          <div className="py-20 text-center text-sm" style={{ color: "#94A3B8" }}>불러오는 중...</div>
        ) : error ? (
          <div className="py-20 flex flex-col items-center gap-3">
            <p className="text-sm font-semibold" style={{ color: "#EF4444" }}>{error}</p>
            <p className="text-xs" style={{ color: "#94A3B8" }}>데이터가 없는 것으로 잘못 보이지 않도록 표시를 중단했습니다.</p>
            <button onClick={load} className="px-4 py-1.5 text-sm font-semibold rounded-lg" style={{ background: "#3182F6", color: "#fff" }}>다시 시도</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-sm font-medium" style={{ color: "#94A3B8" }}>공지사항이 없습니다.</p>
            <p className="text-xs mt-1" style={{ color: "#CBD5E1" }}>상단의 공지 작성 버튼을 눌러 추가해보세요.</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "#F1F5F9" }}>
            {filtered.map((n) => (
              <div
                key={n.id}
                className="px-6 py-4 flex items-start gap-4 transition-colors hover:bg-slate-50"
              >
                {/* 우선순위 인디케이터 */}
                <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0" style={{ width: 32 }}>
                  <span className="text-xs font-bold" style={{ color: n.priority > 0 ? "#3182F6" : "#CBD5E1" }}>
                    P{n.priority}
                  </span>
                </div>

                {/* 내용 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {n.isPinned && (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-bold"
                        style={{ background: "rgba(245,158,11,0.1)", color: "#F59E0B" }}>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="#F59E0B" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                        대시보드 고정
                      </span>
                    )}
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: n.isActive ? "rgba(16,185,129,0.1)" : "#F1F5F9", color: n.isActive ? "#10B981" : "#94A3B8" }}
                    >
                      {n.isActive ? "공개" : "비공개"}
                    </span>
                  </div>
                  <p className="font-semibold text-sm" style={{ color: n.isActive ? "#191F28" : "#94A3B8" }}>
                    {n.title}
                  </p>
                  {n.content && (
                    <p className="text-xs mt-1 line-clamp-2" style={{ color: "#64748B" }}>{n.content}</p>
                  )}
                  <p className="text-xs mt-2" style={{ color: "#B0B8C1" }}>
                    {n.authorName} · {formatDate(n.createdAt)}
                  </p>
                </div>

                {/* 액션 버튼 */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* 고정 토글 */}
                  <button
                    onClick={() => togglePinned(n)}
                    className="p-1.5 rounded-lg transition-colors"
                    style={{ background: n.isPinned ? "rgba(245,158,11,0.1)" : "transparent" }}
                    title={n.isPinned ? "대시보드 고정 해제" : "대시보드에 고정"}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill={n.isPinned ? "#F59E0B" : "none"} stroke={n.isPinned ? "#F59E0B" : "#94A3B8"} strokeWidth="2" strokeLinecap="round">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                  </button>
                  {/* 공개/비공개 토글 */}
                  <button
                    onClick={() => toggleActive(n)}
                    className="p-1.5 rounded-lg transition-colors hover:bg-slate-100"
                    title={n.isActive ? "비공개로 전환" : "공개로 전환"}
                  >
                    {n.isActive ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    )}
                  </button>
                  {/* 수정 */}
                  <button
                    onClick={() => setEditTarget(n)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                    title="수정"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  {/* 삭제 */}
                  <button
                    onClick={() => handleDelete(n.id)}
                    disabled={deleting === n.id}
                    className="p-1.5 rounded-lg transition-colors disabled:opacity-40"
                    style={{ background: "rgba(239,68,68,0.08)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.18)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.08)")}
                    title="삭제"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                      <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
