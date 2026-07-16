"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { uploadAttachment, removeAttachment, useFileSrc, isPdfValue, isImageValue } from "@/lib/storage";

const TEAMS        = ["전체", "영업 1팀", "영업 2팀"];
const MEETING_TYPES = ["회의록", "미팅록", "기타"];
const DAY_NAMES    = ["일", "월", "화", "수", "목", "금", "토"];

interface MeetingNote {
  id: string;
  date: string;
  title: string;
  content: string;
  meetingType: string;
  attendees: string | null;
  location: string | null;
  authorName: string;
  assignedTeam: string | null;
  clientId: string | null;
  projectId: string | null;
  proposalFileUrl: string | null;
  proposalFileName: string | null;
  createdAt: string;
}

interface Client  { id: string; companyName: string; }
interface Project { id: string; campaignName: string; }

type RightMode = "empty" | "detail" | "create" | "edit";

// ─── 유틸 ────────────────────────────────────────────────

function toDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function formatKo(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
}
function teamColor(team: string | null) {
  if (team === "영업 1팀") return "#6366F1";
  if (team === "영업 2팀") return "#10B981";
  return "#3182F6";
}
function typeColor(type: string) {
  if (type === "회의록") return { bg: "rgba(49,130,246,0.1)", color: "#3182F6" };
  if (type === "미팅록") return { bg: "rgba(16,185,129,0.1)", color: "#059669" };
  return { bg: "rgba(148,163,184,0.1)", color: "#64748B" };
}

// ─── 달력 ────────────────────────────────────────────────

function Calendar({
  year, month, markedDates, selectedDate, onSelect,
}: {
  year: number; month: number;
  markedDates: Set<string>;
  selectedDate: string | null;
  onSelect: (d: string) => void;
}) {
  const firstDay   = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  const today = toDateStr(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map((d, i) => (
          <div key={d} className="text-center text-xs font-semibold py-1"
            style={{ color: i === 0 ? "#EF4444" : i === 6 ? "#3182F6" : "#94A3B8" }}>
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {Array.from({ length: totalCells }, (_, i) => {
          const day = i - firstDay + 1;
          if (day < 1 || day > daysInMonth) return <div key={i} />;
          const dateKey = toDateStr(year, month + 1, day);
          const isToday    = dateKey === today;
          const isSelected = dateKey === selectedDate;
          const hasNote    = markedDates.has(dateKey);
          const col        = i % 7;
          return (
            <button key={i} onClick={() => onSelect(dateKey)}
              className="relative flex flex-col items-center py-1 rounded-lg transition-colors hover:bg-slate-100"
              style={{ background: isSelected ? "rgba(49,130,246,0.1)" : "transparent" }}>
              <span className="text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full"
                style={{
                  background: isToday ? "#3182F6" : "transparent",
                  color: isToday ? "#fff" : col === 0 ? "#EF4444" : col === 6 ? "#3182F6" : "#475569",
                }}>
                {day}
              </span>
              {hasNote && (
                <span className="w-1 h-1 rounded-full mt-0.5"
                  style={{ background: isSelected ? "#3182F6" : "#94A3B8" }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── 폼 ──────────────────────────────────────────────────

interface NoteForm {
  date: string; title: string; content: string;
  meetingType: string; attendees: string; location: string;
  authorName: string; assignedTeam: string;
  clientId: string; projectId: string;
  proposalFileUrl: string; proposalFileName: string;
}

function emptyForm(date = ""): NoteForm {
  return { date, title: "", content: "", meetingType: "회의록", attendees: "", location: "", authorName: "", assignedTeam: "", clientId: "", projectId: "", proposalFileUrl: "", proposalFileName: "" };
}

function ProposalUpload({ fileUrl, fileName, onChange }: {
  fileUrl: string; fileName: string;
  onChange: (url: string, name: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const path = await uploadAttachment(file, "meeting-notes");
      onChange(path, file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    if (uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  const previewSrc = useFileSrc(fileUrl || null);
  const isPdf = isPdfValue(fileUrl, fileName);
  const isImg = isImageValue(fileUrl, fileName);

  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>
        제안서 첨부
        <span className="ml-1.5 font-normal" style={{ color: "#94A3B8" }}>PDF · 이미지</span>
      </label>

      {fileUrl ? (
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #E9EBEF" }}>
          {/* 파일 헤더 */}
          <div className="flex items-center justify-between px-4 py-3" style={{ background: "#F8FAFC", borderBottom: "1px solid #E9EBEF" }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: isPdf ? "rgba(239,68,68,0.1)" : "rgba(49,130,246,0.1)" }}>
                {isPdf ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <path d="M9 13h6M9 17h4"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3182F6" strokeWidth="2" strokeLinecap="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color: "#191F28" }}>{fileName}</p>
                <p className="text-xs" style={{ color: "#94A3B8" }}>{isPdf ? "PDF 문서" : "이미지"}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <a href={previewSrc ?? undefined} download={fileName} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-blue-50"
                style={{ color: previewSrc ? "#3182F6" : "#94A3B8", pointerEvents: previewSrc ? "auto" : "none" }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                다운로드
              </a>
              <button onClick={() => onChange("", "")}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-red-50"
                style={{ color: "#EF4444" }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
                삭제
              </button>
            </div>
          </div>
          {/* 미리보기 */}
          {isImg && (
            <div className="p-3" style={{ background: "#fff" }}>
              {previewSrc
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={previewSrc} alt={fileName} className="max-h-48 rounded-xl object-contain mx-auto" style={{ maxWidth: "100%" }} />
                : <p className="text-xs text-center py-6" style={{ color: "#CBD5E1" }}>미리보기 불러오는 중…</p>}
            </div>
          )}
          {isPdf && (
            <div className="p-3" style={{ background: "#fff" }}>
              {previewSrc
                ? <iframe src={previewSrc} className="w-full rounded-xl" style={{ height: 300, border: "none" }} />
                : <p className="text-xs text-center py-6" style={{ color: "#CBD5E1" }}>미리보기 불러오는 중…</p>}
            </div>
          )}
        </div>
      ) : (
        <div
          onClick={() => { if (!uploading) fileInputRef.current?.click(); }}
          onDragOver={e => { e.preventDefault(); if (!uploading) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className="rounded-2xl transition-all"
          style={{
            cursor: uploading ? "default" : "pointer",
            border: `2px dashed ${dragging ? "#3182F6" : "#E9EBEF"}`,
            background: dragging ? "rgba(49,130,246,0.04)" : "#FAFBFC",
            padding: "28px 20px",
          }}>
          <div className="flex flex-col items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: dragging || uploading ? "rgba(49,130,246,0.1)" : "#F1F5F9" }}>
              {uploading ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3182F6" strokeWidth="2" strokeLinecap="round" className="animate-spin">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={dragging ? "#3182F6" : "#94A3B8"} strokeWidth="1.8" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              )}
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold" style={{ color: dragging || uploading ? "#3182F6" : "#475569" }}>
                {uploading ? "업로드 중…" : dragging ? "여기에 놓으세요" : "파일을 끌어다 놓거나 클릭해 업로드"}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>PDF, PNG, JPG, JPEG · 최대 50MB</p>
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept=".pdf,image/*" className="hidden" onChange={onInputChange} disabled={uploading} />
        </div>
      )}
      {error && (
        <p className="text-xs mt-2 font-medium" style={{ color: "#EF4444" }}>{error}</p>
      )}
    </div>
  );
}

function NoteForm({
  form, setForm, clients, projects, onSave, onCancel, saving,
}: {
  form: NoteForm;
  setForm: (f: NoteForm) => void;
  clients: Client[]; projects: Project[];
  onSave: () => void; onCancel: () => void; saving: boolean;
}) {
  const inp = "w-full px-3 py-2 text-sm rounded-xl outline-none border transition-colors focus:border-[#3182F6]";
  const inpS = { background: "#F8FAFC", borderColor: "#E9EBEF", color: "#191F28" };
  const set = (k: keyof NoteForm, v: string) => setForm({ ...form, [k]: v });

  return (
    <div className="space-y-4">
      {/* 날짜 / 유형 / 팀 */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>날짜 *</label>
          <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className={inp} style={inpS} />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>유형</label>
          <select value={form.meetingType} onChange={(e) => set("meetingType", e.target.value)} className={inp} style={inpS}>
            {MEETING_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>팀</label>
          <select value={form.assignedTeam} onChange={(e) => set("assignedTeam", e.target.value)} className={inp} style={inpS}>
            <option value="">선택 안함</option>
            <option>영업 1팀</option><option>영업 2팀</option>
          </select>
        </div>
      </div>

      {/* 제목 */}
      <div>
        <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>제목 *</label>
        <input value={form.title} onChange={(e) => set("title", e.target.value)}
          placeholder="회의/미팅 제목을 입력하세요" className={inp} style={inpS} />
      </div>

      {/* 작성자 / 장소 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>작성자 *</label>
          <input value={form.authorName} onChange={(e) => set("authorName", e.target.value)}
            placeholder="이름" className={inp} style={inpS} />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>장소 / 방식</label>
          <input value={form.location} onChange={(e) => set("location", e.target.value)}
            placeholder="회의실, 줌, 현장…" className={inp} style={inpS} />
        </div>
      </div>

      {/* 참석자 */}
      <div>
        <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>참석자</label>
        <input value={form.attendees} onChange={(e) => set("attendees", e.target.value)}
          placeholder="홍길동, 김영업, 이마케팅…" className={inp} style={inpS} />
      </div>

      {/* 고객사 / 프로젝트 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>고객사</label>
          <select value={form.clientId} onChange={(e) => set("clientId", e.target.value)} className={inp} style={inpS}>
            <option value="">없음</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>프로젝트</label>
          <select value={form.projectId} onChange={(e) => set("projectId", e.target.value)} className={inp} style={inpS}>
            <option value="">없음</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.campaignName}</option>)}
          </select>
        </div>
      </div>

      {/* 내용 */}
      <div>
        <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>내용</label>
        <textarea value={form.content} onChange={(e) => set("content", e.target.value)}
          rows={20} placeholder="회의/미팅 내용, 결정사항, 액션 아이템 등을 기록하세요."
          className={`${inp} resize-none leading-relaxed`}
          style={{ ...inpS, minHeight: 480 }} />
      </div>

      {/* 제안서 첨부 */}
      <ProposalUpload
        fileUrl={form.proposalFileUrl}
        fileName={form.proposalFileName}
        onChange={(url, name) => setForm({ ...form, proposalFileUrl: url, proposalFileName: name })}
      />

      {/* 버튼 */}
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel}
          className="px-4 py-2 rounded-xl text-sm font-semibold border transition-colors hover:bg-slate-50"
          style={{ borderColor: "#E9EBEF", color: "#64748B" }}>
          취소
        </button>
        <button onClick={onSave} disabled={saving || !form.date || !form.title.trim() || !form.authorName.trim()}
          className="px-5 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" }}>
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );
}

// ─── 상세 보기 ────────────────────────────────────────────

function NoteDetail({ note, clients, projects, onEdit, onDelete }: {
  note: MeetingNote;
  clients: Client[]; projects: Project[];
  onEdit: () => void; onDelete: () => void;
}) {
  const tc = typeColor(note.meetingType);
  const clientName  = note.clientId  ? clients.find((c) => c.id === note.clientId)?.companyName  : null;
  const projectName = note.projectId ? projects.find((p) => p.id === note.projectId)?.campaignName : null;
  const proposalSrc = useFileSrc(note.proposalFileUrl);
  const proposalIsPdf = isPdfValue(note.proposalFileUrl, note.proposalFileName);
  const proposalIsImg = isImageValue(note.proposalFileUrl, note.proposalFileName);

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: tc.bg, color: tc.color }}>
              {note.meetingType}
            </span>
            {note.assignedTeam && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: `${teamColor(note.assignedTeam)}18`, color: teamColor(note.assignedTeam) }}>
                {note.assignedTeam}
              </span>
            )}
          </div>
          <h2 className="text-lg font-bold leading-snug" style={{ color: "#191F28" }}>{note.title}</h2>
          <p className="text-xs mt-1" style={{ color: "#94A3B8" }}>{formatKo(note.date)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onEdit}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors hover:bg-slate-50"
            style={{ borderColor: "#E9EBEF", color: "#64748B" }}>
            수정
          </button>
          <button onClick={onDelete}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
            style={{ background: "rgba(239,68,68,0.08)", color: "#EF4444" }}>
            삭제
          </button>
        </div>
      </div>

      {/* 메타 정보 */}
      <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl" style={{ background: "#F8FAFC", border: "1px solid #E9EBEF" }}>
        <MetaRow icon="👤" label="작성자" value={note.authorName} />
        {note.location && <MetaRow icon="📍" label="장소/방식" value={note.location} />}
        {note.attendees && <MetaRow icon="👥" label="참석자" value={note.attendees} />}
        {clientName  && <MetaRow icon="🏢" label="고객사" value={clientName} />}
        {projectName && <MetaRow icon="📁" label="프로젝트" value={projectName} />}
      </div>

      {/* 내용 */}
      {note.content ? (
        <div className="p-4 rounded-2xl" style={{ background: "#FFFFFF", border: "1px solid #E9EBEF" }}>
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "#334155" }}>
            {note.content}
          </p>
        </div>
      ) : (
        <div className="py-8 text-center" style={{ color: "#CBD5E1" }}>
          <p className="text-sm">내용이 없습니다.</p>
        </div>
      )}

      {/* 제안서 */}
      {note.proposalFileUrl && (
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: "#64748B" }}>첨부 제안서</p>
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #E9EBEF" }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ background: "#F8FAFC", borderBottom: "1px solid #E9EBEF" }}>
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: proposalIsPdf ? "rgba(239,68,68,0.1)" : "rgba(49,130,246,0.1)" }}>
                  {proposalIsPdf ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/><path d="M9 13h6M9 17h4"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3182F6" strokeWidth="2" strokeLinecap="round">
                      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: "#191F28" }}>{note.proposalFileName}</p>
                  <p className="text-xs" style={{ color: "#94A3B8" }}>
                    {proposalIsPdf ? "PDF 문서" : "이미지"}
                  </p>
                </div>
              </div>
              <a href={proposalSrc ?? undefined} download={note.proposalFileName} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-blue-50"
                style={{ color: proposalSrc ? "#3182F6" : "#94A3B8", pointerEvents: proposalSrc ? "auto" : "none" }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                다운로드
              </a>
            </div>
            {proposalIsImg && (
              <div className="p-3" style={{ background: "#fff" }}>
                {proposalSrc
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={proposalSrc} alt={note.proposalFileName ?? "제안서"} className="max-h-64 rounded-xl object-contain mx-auto" style={{ maxWidth: "100%" }} />
                  : <p className="text-xs text-center py-8" style={{ color: "#CBD5E1" }}>미리보기 불러오는 중…</p>}
              </div>
            )}
            {proposalIsPdf && (
              <div className="p-3" style={{ background: "#fff" }}>
                {proposalSrc
                  ? <iframe src={proposalSrc} className="w-full rounded-xl" style={{ height: 360, border: "none" }} />
                  : <p className="text-xs text-center py-8" style={{ color: "#CBD5E1" }}>미리보기 불러오는 중…</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MetaRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-sm shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-semibold mb-0.5" style={{ color: "#94A3B8" }}>{label}</p>
        <p className="text-xs font-medium break-words" style={{ color: "#334155" }}>{value}</p>
      </div>
    </div>
  );
}

// ─── 메인 페이지 ─────────────────────────────────────────

/* ── 폼 옵션 캐시 (광고주·프로젝트 드롭다운용) ── */
type FormOptions = { clients: Client[]; projects: Project[] };
let _formCache: { data: FormOptions; ts: number } | null = null;
let _formPending: Promise<FormOptions> | null = null;

function fetchFormOptions(): Promise<FormOptions> {
  if (_formPending) return _formPending;
  _formPending = fetch("/api/notes-init")
    .then((r) => r.json())
    .then((d) => {
      const data = { clients: d.clients ?? [], projects: d.projects ?? [] };
      _formCache = { data, ts: Date.now() };
      _formPending = null;
      return data;
    })
    .catch(() => { _formPending = null; return { clients: [], projects: [] }; });
  return _formPending;
}
fetchFormOptions();

export default function MeetingNotesPage() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [team,  setTeam]  = useState("전체");

  const [notes,    setNotes]    = useState<MeetingNote[]>([]);
  const [clients,  setClients]  = useState<Client[]>(_formCache?.data.clients ?? []);
  const [projects, setProjects] = useState<Project[]>(_formCache?.data.projects ?? []);
  const [loading,  setLoading]  = useState(true);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [rightMode,    setRightMode]    = useState<RightMode>("empty");
  const [activeNote,   setActiveNote]   = useState<MeetingNote | null>(null);
  const [form,         setForm]         = useState<NoteForm>(emptyForm());
  const [saving,       setSaving]       = useState(false);

  const fetchNotes = useCallback(() => {
    setLoading(true);
    fetch(`/api/meeting-notes?year=${year}&month=${month + 1}&team=${encodeURIComponent(team)}`)
      .then((r) => r.json())
      .then((d) => setNotes(d.notes ?? []))
      .finally(() => setLoading(false));
  }, [year, month, team]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  useEffect(() => {
    if (_formCache) { setClients(_formCache.data.clients); setProjects(_formCache.data.projects); return; }
    fetchFormOptions().then(({ clients: c, projects: p }) => { setClients(c); setProjects(p); });
  }, []);

  function prevMonth() { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); }

  const markedDates = new Set(notes.map((n) => n.date));

  const dayNotes = selectedDate ? notes.filter((n) => n.date === selectedDate) : [];

  function openCreate(date?: string) {
    setForm(emptyForm(date ?? selectedDate ?? toDateStr(year, month + 1, new Date().getDate())));
    setRightMode("create");
    setActiveNote(null);
  }

  function openDetail(note: MeetingNote) {
    setActiveNote(note);
    setRightMode("detail");
    setSelectedDate(note.date);
  }

  function openEdit(note: MeetingNote) {
    setForm({
      date:             note.date,
      title:            note.title,
      content:          note.content,
      meetingType:      note.meetingType,
      attendees:        note.attendees ?? "",
      location:         note.location ?? "",
      authorName:       note.authorName,
      assignedTeam:     note.assignedTeam ?? "",
      clientId:         note.clientId ?? "",
      projectId:        note.projectId ?? "",
      proposalFileUrl:  note.proposalFileUrl ?? "",
      proposalFileName: note.proposalFileName ?? "",
    });
    setActiveNote(note);
    setRightMode("edit");
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body = {
        ...form,
        clientId:         form.clientId         || null,
        projectId:        form.projectId        || null,
        assignedTeam:     form.assignedTeam     || null,
        attendees:        form.attendees        || null,
        location:         form.location         || null,
        proposalFileUrl:  form.proposalFileUrl  || null,
        proposalFileName: form.proposalFileName || null,
      };
      const url    = rightMode === "create" ? "/api/meeting-notes" : `/api/meeting-notes/${activeNote?.id}`;
      const method = rightMode === "create" ? "POST" : "PATCH";
      if (rightMode === "edit" && !activeNote) return;

      const res  = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.note) {
        alert(`저장에 실패했습니다.\n${data?.error ?? `오류 코드 ${res.status}`}`);
        return;
      }
      if (rightMode === "create") {
        setNotes((p) => [data.note, ...p]);
      } else {
        setNotes((p) => p.map((n) => n.id === data.note.id ? data.note : n));
      }
      openDetail(data.note);
    } catch (e) {
      alert(`저장 중 오류가 발생했습니다.\n${e instanceof Error ? e.message : ""}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(note: MeetingNote) {
    if (!confirm(`"${note.title}" 을(를) 삭제할까요?`)) return;
    const res = await fetch(`/api/meeting-notes/${note.id}`, { method: "DELETE" });
    if (!res.ok) { alert("삭제에 실패했습니다."); return; }
    void removeAttachment(note.proposalFileUrl);   // 첨부 스토리지 정리 (best-effort)
    setNotes((p) => p.filter((n) => n.id !== note.id));
    setRightMode("empty");
    setActiveNote(null);
  }

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "#191F28" }}>회의/미팅록</h1>
          <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>회의록과 미팅록을 날짜별로 관리합니다.</p>
        </div>
        <button onClick={() => openCreate()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity"
          style={{ background: "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          새 회의/미팅록
        </button>
      </div>

      <div className="flex gap-5">
        {/* ── 왼쪽: 달력 + 목록 ── */}
        <div className="flex flex-col gap-4" style={{ width: 300, minWidth: 300 }}>
          {/* 달력 카드 */}
          <div className="rounded-2xl p-4" style={{ background: "#FFFFFF", border: "1px solid #E9EBEF" }}>
            {/* 월 네비 */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <span className="text-sm font-bold" style={{ color: "#191F28" }}>{year}년 {month + 1}월</span>
              <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>

            {/* 팀 필터 */}
            <div className="flex gap-1 mb-4 p-0.5 rounded-xl" style={{ background: "#F1F5F9" }}>
              {TEAMS.map((t) => (
                <button key={t} onClick={() => setTeam(t)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{ background: team === t ? "#fff" : "transparent", color: team === t ? "#191F28" : "#94A3B8", boxShadow: team === t ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}>
                  {t}
                </button>
              ))}
            </div>

            <Calendar year={year} month={month} markedDates={markedDates}
              selectedDate={selectedDate} onSelect={(d) => { setSelectedDate(d); setRightMode("empty"); setActiveNote(null); }} />
          </div>

          {/* 선택 날짜 목록 */}
          {selectedDate && (
            <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E9EBEF" }}>
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #F1F5F9" }}>
                <h3 className="text-sm font-bold" style={{ color: "#191F28" }}>{formatKo(selectedDate)}</h3>
                <button onClick={() => openCreate(selectedDate)}
                  className="text-xs font-semibold flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-colors hover:bg-slate-100"
                  style={{ color: "#3182F6" }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  추가
                </button>
              </div>
              <div className="p-2 space-y-1">
                {dayNotes.length === 0 ? (
                  <p className="text-xs text-center py-4" style={{ color: "#CBD5E1" }}>이 날의 회의/미팅록이 없습니다.</p>
                ) : dayNotes.map((note) => {
                  const tc = typeColor(note.meetingType);
                  const isActive = activeNote?.id === note.id;
                  return (
                    <button key={note.id} onClick={() => openDetail(note)}
                      className="w-full text-left p-3 rounded-xl transition-all"
                      style={{ background: isActive ? "rgba(49,130,246,0.07)" : "transparent", border: `1px solid ${isActive ? "rgba(49,130,246,0.2)" : "transparent"}` }}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
                          style={{ background: tc.bg, color: tc.color }}>{note.meetingType}</span>
                        {note.assignedTeam && (
                          <span className="text-xs font-semibold" style={{ color: teamColor(note.assignedTeam) }}>{note.assignedTeam}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold truncate" style={{ color: "#191F28" }}>{note.title}</p>
                        {note.proposalFileUrl && (
                          <span className="shrink-0 text-xs px-1.5 py-0.5 rounded-md font-semibold" style={{ background: "rgba(49,130,246,0.08)", color: "#3182F6" }}>제안서</span>
                        )}
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>{note.authorName}{note.attendees ? ` · ${note.attendees}` : ""}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 이번달 전체 목록 */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E9EBEF" }}>
            <div className="px-4 py-3" style={{ borderBottom: "1px solid #F1F5F9" }}>
              <h3 className="text-sm font-bold" style={{ color: "#191F28" }}>
                {month + 1}월 전체
                <span className="font-normal text-xs ml-1.5" style={{ color: "#94A3B8" }}>{notes.length}건</span>
              </h3>
            </div>
            <div className="p-2 space-y-0.5 max-h-64 overflow-y-auto">
              {loading ? (
                <p className="text-xs text-center py-4" style={{ color: "#CBD5E1" }}>불러오는 중...</p>
              ) : notes.length === 0 ? (
                <p className="text-xs text-center py-4" style={{ color: "#CBD5E1" }}>등록된 회의/미팅록이 없습니다.</p>
              ) : notes.map((note) => {
                const tc = typeColor(note.meetingType);
                const isActive = activeNote?.id === note.id;
                return (
                  <button key={note.id} onClick={() => openDetail(note)}
                    className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-xl transition-colors hover:bg-slate-50"
                    style={{ background: isActive ? "rgba(49,130,246,0.06)" : "transparent" }}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: tc.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate" style={{ color: "#191F28" }}>{note.title}</p>
                    </div>
                    <span className="text-xs tabular-nums shrink-0" style={{ color: "#94A3B8" }}>
                      {parseInt(note.date.split("-")[2])}일
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── 오른쪽: 상세/작성/수정 ── */}
        <div className="flex-1 min-w-0">
          {rightMode === "empty" && (
            <div className="h-full flex flex-col items-center justify-center gap-3 rounded-2xl"
              style={{ background: "#FFFFFF", border: "1px solid #E9EBEF", minHeight: 400 }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: "rgba(49,130,246,0.08)" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3182F6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold" style={{ color: "#191F28" }}>회의/미팅록을 선택하거나 새로 작성하세요</p>
                <p className="text-xs mt-1" style={{ color: "#94A3B8" }}>날짜를 클릭하면 해당 날의 회의/미팅록을 볼 수 있습니다.</p>
              </div>
              <button onClick={() => openCreate()}
                className="mt-2 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                style={{ background: "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" }}>
                새 회의/미팅록 작성
              </button>
            </div>
          )}

          {(rightMode === "create" || rightMode === "edit") && (
            <div className="rounded-2xl p-6" style={{ background: "#FFFFFF", border: "1px solid #E9EBEF" }}>
              <h2 className="text-base font-bold mb-5" style={{ color: "#191F28" }}>
                {rightMode === "create" ? "새 회의/미팅록 작성" : "회의/미팅록 수정"}
              </h2>
              <NoteForm form={form} setForm={setForm} clients={clients} projects={projects}
                onSave={handleSave} onCancel={() => setRightMode(activeNote ? "detail" : "empty")} saving={saving} />
            </div>
          )}

          {rightMode === "detail" && activeNote && (
            <div className="rounded-2xl p-6" style={{ background: "#FFFFFF", border: "1px solid #E9EBEF" }}>
              <NoteDetail note={activeNote} clients={clients} projects={projects}
                onEdit={() => openEdit(activeNote)} onDelete={() => handleDelete(activeNote)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
