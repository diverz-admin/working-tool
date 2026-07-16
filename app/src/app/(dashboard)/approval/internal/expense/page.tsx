"use client";

import { useState, useEffect, useRef } from "react";
import { useUser } from "@/lib/UserContext";
import { uploadAttachment, resolveFileSrc, useFileSrc, isImageValue } from "@/lib/storage";

type Status = "대기" | "승인" | "반려";

interface Attachment { url: string; name: string; }

interface ExpenseItem {
  id:              string;
  title:           string;
  assignedTeam:    string | null;
  requester:       string;
  requestedAt:     string;
  amount:          number | null;
  content:         string | null;
  attachments:     string | null;
  expenseCategory: string | null;
  status:          Status;
  rejectReason:    string | null;
  createdAt:       string;
}

const EXPENSE_CATEGORIES = ["소모품비", "외주용역비", "기타 영업비용"];

const TEAMS = ["영업 1팀", "영업 2팀", "경영", "기타"];

const STATUS_STYLE: Record<Status, { bg: string; color: string; border: string }> = {
  대기: { bg: "rgba(234,179,8,0.1)",  color: "#CA8A04", border: "rgba(234,179,8,0.25)" },
  승인: { bg: "rgba(16,185,129,0.1)", color: "#059669", border: "rgba(16,185,129,0.25)" },
  반려: { bg: "rgba(239,68,68,0.1)",  color: "#DC2626", border: "rgba(239,68,68,0.25)" },
};

function parseAttachments(raw: string | null): Attachment[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

// 스토리지 경로(또는 레거시 data:)를 서명 URL로 변환해 미리보기
function AttachmentImage({ url, name }: { url: string; name: string }) {
  const src = useFileSrc(url);
  if (!src) return <div className="w-full h-32 flex items-center justify-center text-xs" style={{ color: "#CBD5E1" }}>미리보기 불러오는 중…</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={name} className="w-full object-contain max-h-64" />;
}

function fmtAmount(v: number | null) {
  if (!v) return "—";
  return "₩" + v.toLocaleString();
}

// ── 파일 첨부 컴포넌트 ─────────────────────────────────────
function AttachmentUploader({ attachments, onChange }: {
  attachments: Attachment[];
  onChange: (next: Attachment[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    try {
      let next = [...attachments];
      for (const file of files) {
        const path = await uploadAttachment(file, "expense");
        next = [...next, { url: path, name: file.name }];
        onChange(next);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "첨부 업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {attachments.map((a, i) => (
          <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium"
            style={{ background: "#F1F5F9", border: "1px solid #E9EBEF", color: "#475569" }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
            <span className="max-w-[120px] truncate">{a.name}</span>
            <button type="button" onClick={() => onChange(attachments.filter((_, j) => j !== i))} className="ml-0.5 hover:opacity-70">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        ))}
      </div>
      <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity"
        style={{ background: "#F1F5F9", border: "1px solid #E9EBEF", color: "#64748B", opacity: uploading ? 0.6 : 1, pointerEvents: uploading ? "none" : "auto" }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        {uploading ? "업로드 중…" : "파일 첨부"}
        <input ref={inputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFile} disabled={uploading} />
      </label>
      <p className="text-xs" style={{ color: "#CBD5E1" }}>PDF, JPG, PNG · 최대 50MB</p>
    </div>
  );
}

// ── 요청 모달 ─────────────────────────────────────────────
interface RequestForm {
  title:           string;
  assignedTeam:    string;
  requester:       string;
  requestedAt:     string;
  amount:          string;
  content:         string;
  attachments:     Attachment[];
  expenseCategory: string;
}

function RequestModal({ defaultRequester, initial, onClose, onSubmit }: {
  defaultRequester: string;
  initial?:  ExpenseItem;
  onClose:  () => void;
  onSubmit: (form: RequestForm) => Promise<void>;
}) {
  const isEdit = Boolean(initial);
  const [form, setForm] = useState<RequestForm>({
    title:           initial?.title           ?? "",
    assignedTeam:    initial?.assignedTeam    ?? "",
    requester:       initial?.requester       ?? defaultRequester,
    requestedAt:     initial?.requestedAt     ?? new Date().toISOString().slice(0, 10),
    amount:          initial?.amount != null ? String(initial.amount) : "",
    content:         initial?.content         ?? "",
    attachments:     parseAttachments(initial?.attachments ?? null),
    expenseCategory: initial?.expenseCategory ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [allUsers, setAllUsers] = useState<{ name: string; team: string | null }[]>([]);

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => setAllUsers((d.users ?? []).map((u: { name: string; team: string | null }) => ({ name: u.name, team: u.team }))))
      .catch(() => {});
  }, []);

  const filteredUsers = form.assignedTeam
    ? allUsers.filter((u) => u.team === form.assignedTeam)
    : allUsers;

  function set(k: keyof RequestForm, v: string) {
    if (k === "assignedTeam") {
      setForm((p) => ({ ...p, assignedTeam: v, requester: "" }));
      return;
    }
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.requester.trim()) return;
    setSaving(true);
    try { await onSubmit(form); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(25,31,40,0.45)" }} onClick={onClose}>
      <div className="rounded-2xl w-full max-w-lg mx-4 overflow-hidden" style={{ background: "#fff", boxShadow: "0 20px 60px rgba(22,31,51,0.18)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #F1F5F9" }}>
          <h2 className="text-sm font-bold" style={{ color: "#191F28" }}>{isEdit ? "내부지출 수정 후 재요청" : "내부지출 결재 요청"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form id="expense-form" onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>제목 <span style={{ color: "#EF4444" }}>*</span></label>
            <input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="지출 제목을 입력하세요"
              required
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
              style={{ background: "#F8FAFC", border: "1px solid #E9EBEF", color: "#191F28" }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>담당팀</label>
              <select
                value={form.assignedTeam}
                onChange={(e) => set("assignedTeam", e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none appearance-none"
                style={{ background: "#F8FAFC", border: "1px solid #E9EBEF", color: form.assignedTeam ? "#191F28" : "#94A3B8" }}
              >
                <option value="">선택</option>
                {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>요청자 <span style={{ color: "#EF4444" }}>*</span></label>
              <select
                value={form.requester}
                onChange={(e) => set("requester", e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none appearance-none"
                style={{ background: "#F8FAFC", border: "1px solid #E9EBEF", color: form.requester ? "#191F28" : "#94A3B8" }}
              >
                <option value="">선택</option>
                {filteredUsers.map((u) => <option key={u.name} value={u.name}>{u.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>요청일</label>
              <input
                type="date"
                value={form.requestedAt}
                onChange={(e) => set("requestedAt", e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={{ background: "#F8FAFC", border: "1px solid #E9EBEF", color: "#191F28" }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>금액</label>
              <input
                value={form.amount}
                onChange={(e) => set("amount", e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="0"
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={{ background: "#F8FAFC", border: "1px solid #E9EBEF", color: "#191F28" }}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>지출카테고리</label>
            <select
              value={form.expenseCategory}
              onChange={(e) => set("expenseCategory", e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none appearance-none"
              style={{ background: "#F8FAFC", border: "1px solid #E9EBEF", color: form.expenseCategory ? "#191F28" : "#94A3B8" }}
            >
              <option value="">선택 (선택사항)</option>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>내용</label>
            <textarea
              value={form.content}
              onChange={(e) => set("content", e.target.value)}
              placeholder="지출 사유 및 상세 내용을 입력하세요"
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
              style={{ background: "#F8FAFC", border: "1px solid #E9EBEF", color: "#191F28" }}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>영수증 및 계산서 첨부</label>
            <AttachmentUploader
              attachments={form.attachments}
              onChange={(next) => setForm((p) => ({ ...p, attachments: next }))}
            />
          </div>
        </form>

        <div className="flex gap-2 px-6 py-4" style={{ borderTop: "1px solid #F1F5F9" }}>
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold hover:opacity-80"
            style={{ background: "#F1F5F9", color: "#64748B" }}>취소</button>
          <button
            type="submit"
            form="expense-form"
            disabled={saving || !form.title.trim() || !form.requester.trim()}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            style={{ background: "#3182F6" }}>
            {saving ? "요청 중..." : isEdit ? "재요청" : "결재 요청"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 상세 모달 (조회 전용) ──────────────────────────────────
function DetailModal({ item, onClose, onDelete, onResubmit }: {
  item:        ExpenseItem;
  onClose:     () => void;
  onDelete:    (id: string) => Promise<void>;
  onResubmit?: () => void;
}) {
  const attachments = parseAttachments(item.attachments);
  const [deleting, setDeleting] = useState(false);
  const ss = STATUS_STYLE[item.status];

  async function openAttachment(a: Attachment) {
    const href = await resolveFileSrc(a.url);
    if (!href) { alert("파일을 불러오지 못했습니다."); return; }
    const link = document.createElement("a");
    link.href = href;
    link.download = a.name;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function handleDelete() {
    if (!confirm("요청을 취소하시겠습니까?")) return;
    setDeleting(true);
    try { await onDelete(item.id); } finally { setDeleting(false); }
  }

  const isImage = (name: string, url: string) => isImageValue(url, name);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(25,31,40,0.45)" }} onClick={onClose}>
      <div className="rounded-2xl w-full max-w-md mx-4 overflow-hidden" style={{ background: "#fff", boxShadow: "0 20px 60px rgba(22,31,51,0.18)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #F1F5F9" }}>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(49,130,246,0.1)", color: "#3182F6" }}>내부지출</span>
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
            {item.expenseCategory && (
              <div>
                <p className="text-xs mb-1" style={{ color: "#94A3B8" }}>지출카테고리</p>
                <p className="font-semibold" style={{ color: "#191F28" }}>{item.expenseCategory}</p>
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
              <div className="space-y-2">
                {attachments.map((a, i) =>
                  isImage(a.name, a.url) ? (
                    <div key={i} className="rounded-xl overflow-hidden border" style={{ borderColor: "#E9EBEF" }}>
                      <AttachmentImage url={a.url} name={a.name} />
                      <div className="flex items-center justify-between px-3 py-2" style={{ background: "#F8FAFC" }}>
                        <span className="text-xs truncate max-w-[200px]" style={{ color: "#64748B" }}>{a.name}</span>
                        <button onClick={() => openAttachment(a)} className="text-xs font-semibold hover:opacity-70" style={{ color: "#3182F6" }}>다운로드</button>
                      </div>
                    </div>
                  ) : (
                    <button key={i} onClick={() => openAttachment(a)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium hover:opacity-80 transition-opacity text-left"
                      style={{ background: "#F1F5F9", border: "1px solid #E9EBEF", color: "#475569" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                      <span className="truncate flex-1">{a.name}</span>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#3182F6" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                    </button>
                  )
                )}
              </div>
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
              <button
                onClick={onResubmit}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold hover:opacity-80"
                style={{ background: "rgba(49,130,246,0.1)", color: "#3182F6" }}>
                수정 후 재요청
              </button>
            )}
            {item.status === "대기" && (
              <button
                onClick={handleDelete}
                disabled={deleting}
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
export default function ExpensePage() {
  const { name: currentUser } = useUser();
  const [items, setItems]         = useState<ExpenseItem[]>([]);
  const [filterStatus, setStatus] = useState<Status | "전체">("전체");
  const [selected, setSelected]   = useState<ExpenseItem | null>(null);
  const [editItem, setEditItem]   = useState<ExpenseItem | null>(null);
  const [showForm, setShowForm]   = useState(false);
  const [loading, setLoading]     = useState(true);

  async function loadItems() {
    const res = await fetch("/api/approvals/expense").then((r) => r.json());
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

  async function handleSubmit(form: RequestForm) {
    const res = await fetch("/api/approvals/expense", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        title:           form.title,
        assignedTeam:    form.assignedTeam || null,
        requester:       form.requester,
        requestedAt:     form.requestedAt,
        amount:          form.amount ? parseInt(form.amount) : null,
        content:         form.content || null,
        attachments:     form.attachments.length ? JSON.stringify(form.attachments) : null,
        expenseCategory: form.expenseCategory || null,
      }),
    }).then((r) => r.json());
    setItems((p) => [res.item, ...p]);
    setShowForm(false);
  }

  async function handleResubmit(form: RequestForm) {
    if (!editItem) return;
    const res = await fetch(`/api/approvals/expense/${editItem.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        title:           form.title,
        assignedTeam:    form.assignedTeam || null,
        requester:       form.requester,
        requestedAt:     form.requestedAt,
        amount:          form.amount ? parseInt(form.amount) : null,
        content:         form.content || null,
        attachments:     form.attachments.length ? JSON.stringify(form.attachments) : null,
        expenseCategory: form.expenseCategory || null,
        status:          "대기",
        rejectReason:    null,
      }),
    }).then((r) => r.json());
    setItems((p) => p.map((i) => i.id === editItem.id ? res.item : i));
    setEditItem(null);
  }

  async function handleDelete(id: string) {
    await fetch(`/api/approvals/expense/${id}`, { method: "DELETE" });
    setItems((p) => p.filter((i) => i.id !== id));
    setSelected(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "#191F28" }}>내부지출</h1>
          <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>내부 지출 결재를 요청합니다.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90"
          style={{ background: "#3182F6" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          결재 요청
        </button>
      </div>

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
              {["제목", "담당팀", "요청자", "요청일", "금액", "상태"].map((h) => (
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
              const attCount = parseAttachments(item.attachments).length;
              return (
                <tr key={item.id}
                  className="border-t cursor-pointer"
                  style={{ borderColor: "#F1F5F9" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(49,130,246,0.03)")}
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showForm && (
        <RequestModal
          defaultRequester={currentUser}
          onClose={() => setShowForm(false)}
          onSubmit={handleSubmit}
        />
      )}

      {editItem && (
        <RequestModal
          defaultRequester={currentUser}
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
