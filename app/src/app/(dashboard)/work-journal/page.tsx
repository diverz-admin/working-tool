"use client";

import { useState, useEffect, useCallback } from "react";

const TEAMS = ["전체", "영업 1팀", "영업 2팀"];
const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

interface Journal {
  id: string;
  date: string;
  title: string;
  content: string;
  authorName: string;
  assignedTeam: string | null;
  clientId: string | null;
  projectId: string | null;
  clientName: string | null;
  projectName: string | null;
  createdAt: string;
}

interface Client { id: string; companyName: string; }
interface Project { id: string; campaignName: string; }

type RightMode = "empty" | "list" | "detail" | "create" | "edit";

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

// ─── 공통 컴포넌트 ────────────────────────────────────────

function TeamBadge({ team }: { team: string | null }) {
  if (!team) return null;
  const color = teamColor(team);
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
      style={{ background: `${color}18`, color }}>
      {team}
    </span>
  );
}

// ─── 캘린더 ───────────────────────────────────────────────

function Calendar({
  year, month,
  journalMap,
  selectedDate,
  onSelectDate,
}: {
  year: number;
  month: number;
  journalMap: Map<string, Journal[]>;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const firstDow = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();

  // 캘린더 그리드 셀 (빈 셀 + 날짜 셀)
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // 마지막 주를 6줄로 맞추기 (레이아웃 고정)
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E9EBEF" }}>
      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 border-b" style={{ borderColor: "#F1F5F9" }}>
        {DAY_NAMES.map((d, i) => (
          <div key={d} className="py-2.5 text-center text-xs font-bold"
            style={{ color: i === 0 ? "#EF4444" : i === 6 ? "#3182F6" : "#94A3B8" }}>
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="h-16 border-b border-r" style={{ borderColor: "#F8FAFC" }} />;
          }

          const dateStr = toDateStr(year, month, day);
          const isToday    = dateStr === today;
          const isSelected = dateStr === selectedDate;
          const entries    = journalMap.get(dateStr) ?? [];
          const hasEntries = entries.length > 0;
          const dow = (firstDow + day - 1) % 7;
          const isSun = dow === 0;
          const isSat = dow === 6;

          // 팀별 dot 색상 (중복 제거)
          const dotColors = [...new Set(entries.map((j) => teamColor(j.assignedTeam)))];

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(dateStr)}
              className="h-16 flex flex-col items-center pt-2 pb-1.5 gap-1 border-b border-r transition-colors relative"
              style={{
                borderColor: "#F8FAFC",
                background: isSelected
                  ? "rgba(49,130,246,0.08)"
                  : isToday
                  ? "rgba(49,130,246,0.03)"
                  : "transparent",
              }}
            >
              {/* 날짜 숫자 */}
              <span
                className="w-7 h-7 flex items-center justify-center rounded-full text-sm font-semibold transition-colors"
                style={{
                  background: isSelected ? "#3182F6" : isToday ? "rgba(49,130,246,0.12)" : "transparent",
                  color: isSelected
                    ? "#FFFFFF"
                    : isToday
                    ? "#3182F6"
                    : isSun
                    ? "#EF4444"
                    : isSat
                    ? "#3182F6"
                    : "#191F28",
                  fontWeight: isToday || isSelected ? 800 : 500,
                }}
              >
                {day}
              </span>

              {/* 일지 dot 표시 */}
              {hasEntries && (
                <div className="flex items-center gap-0.5">
                  {dotColors.slice(0, 3).map((color, i) => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: isSelected ? "#FFFFFF" : color }} />
                  ))}
                  {entries.length > 3 && (
                    <span className="text-xs font-bold" style={{ color: isSelected ? "#FFFFFF" : "#94A3B8", fontSize: 9 }}>
                      +{entries.length - 3}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── 폼 ──────────────────────────────────────────────────

function JournalForm({
  clients, projects, initial, defaultDate,
  onSave, onCancel,
}: {
  clients: Client[];
  projects: Project[];
  initial?: Partial<Journal>;
  defaultDate?: string;
  onSave: (data: Omit<Journal, "id" | "createdAt" | "clientName" | "projectName">) => Promise<void>;
  onCancel: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate]             = useState(initial?.date ?? defaultDate ?? today);
  const [title, setTitle]           = useState(initial?.title ?? "");
  const [content, setContent]       = useState(initial?.content ?? "");
  const [authorName, setAuthorName] = useState(initial?.authorName ?? "");
  const [assignedTeam, setTeam]     = useState(initial?.assignedTeam ?? "");
  const [clientId, setClientId]     = useState(initial?.clientId ?? "");
  const [projectId, setProjectId]   = useState(initial?.projectId ?? "");
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !authorName.trim() || !date) {
      setError("날짜, 제목, 작성자는 필수입니다."); return;
    }
    setSaving(true); setError(null);
    try {
      await onSave({
        date, title: title.trim(), content,
        authorName: authorName.trim(),
        assignedTeam: assignedTeam || null,
        clientId: clientId || null,
        projectId: projectId || null,
      });
    } catch {
      setError("저장에 실패했습니다."); setSaving(false);
    }
  }

  const inp = { background: "#F8FAFC", borderColor: "#E9EBEF", color: "#191F28" };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>날짜 *</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-xl outline-none border focus:border-[#3182F6] transition-colors"
            style={inp} />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>팀</label>
          <select value={assignedTeam} onChange={(e) => setTeam(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-xl outline-none border focus:border-[#3182F6] transition-colors"
            style={inp}>
            <option value="">선택 안함</option>
            <option>영업 1팀</option>
            <option>영업 2팀</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>작성자 *</label>
        <input type="text" value={authorName} onChange={(e) => setAuthorName(e.target.value)}
          placeholder="이름 입력"
          className="w-full px-3 py-2 text-sm rounded-xl outline-none border focus:border-[#3182F6] transition-colors"
          style={inp} />
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>제목 *</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="업무일지 제목"
          className="w-full px-3 py-2 text-sm rounded-xl outline-none border focus:border-[#3182F6] transition-colors"
          style={inp} />
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>내용</label>
        <textarea value={content} onChange={(e) => setContent(e.target.value)}
          placeholder="오늘 진행한 업무 내용을 입력하세요..."
          rows={7}
          className="w-full px-3 py-2 text-sm rounded-xl outline-none border focus:border-[#3182F6] transition-colors resize-none"
          style={inp} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>연관 고객사</label>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-xl outline-none border focus:border-[#3182F6] transition-colors"
            style={inp}>
            <option value="">없음</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>연관 프로젝트</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-xl outline-none border focus:border-[#3182F6] transition-colors"
            style={inp}>
            <option value="">없음</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.campaignName}</option>)}
          </select>
        </div>
      </div>

      {error && <p className="text-xs" style={{ color: "#EF4444" }}>{error}</p>}

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onCancel}
          className="flex-1 py-2 text-sm font-medium rounded-xl border transition-colors hover:bg-slate-50"
          style={{ borderColor: "#E9EBEF", color: "#64748B" }}>취소</button>
        <button type="submit" disabled={saving}
          className="flex-1 py-2 text-sm font-semibold rounded-xl text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" }}>
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </form>
  );
}

// ─── 상세 보기 ────────────────────────────────────────────

function JournalDetail({
  journal, onEdit, onDelete, onBack,
}: {
  journal: Journal;
  onEdit: () => void;
  onDelete: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-semibold hover:opacity-70 transition-opacity"
          style={{ color: "#64748B" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          목록으로
        </button>
        <div className="flex items-center gap-1.5">
          <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors" title="수정">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors" title="삭제">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <TeamBadge team={journal.assignedTeam} />
          <span className="text-xs" style={{ color: "#94A3B8" }}>{formatKo(journal.date)}</span>
          <span className="text-xs font-medium" style={{ color: "#64748B" }}>· {journal.authorName}</span>
        </div>
        <h2 className="text-lg font-bold leading-snug" style={{ color: "#191F28" }}>{journal.title}</h2>
      </div>

      {(journal.clientName || journal.projectName) && (
        <div className="flex gap-2 flex-wrap">
          {journal.clientName && (
            <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium"
              style={{ background: "rgba(49,130,246,0.08)", color: "#3182F6" }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              </svg>
              {journal.clientName}
            </span>
          )}
          {journal.projectName && (
            <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium"
              style={{ background: "rgba(16,185,129,0.08)", color: "#10B981" }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
              {journal.projectName}
            </span>
          )}
        </div>
      )}

      <div className="p-4 rounded-xl" style={{ background: "#F8FAFC", border: "1px solid #E9EBEF", minHeight: 160 }}>
        {journal.content ? (
          <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "#334155" }}>
            {journal.content}
          </p>
        ) : (
          <p className="text-sm" style={{ color: "#CBD5E1" }}>내용 없음</p>
        )}
      </div>
    </div>
  );
}

// ─── 날짜별 일지 목록 ─────────────────────────────────────

function DayJournalList({
  date, journals, onSelect, onCreateNew,
}: {
  date: string;
  journals: Journal[];
  onSelect: (j: Journal) => void;
  onCreateNew: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold" style={{ color: "#94A3B8" }}>선택된 날짜</p>
          <h3 className="text-base font-bold" style={{ color: "#191F28" }}>{formatKo(date)}</h3>
        </div>
        <button
          onClick={onCreateNew}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl text-white transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          일지 작성
        </button>
      </div>

      {journals.length === 0 ? (
        <div className="py-16 flex flex-col items-center gap-3" style={{ color: "#94A3B8" }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          <p className="text-sm text-center">이 날 업무일지가 없습니다.<br />첫 일지를 작성해보세요.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {journals.map((j) => (
            <button
              key={j.id}
              onClick={() => onSelect(j)}
              className="w-full text-left p-4 rounded-2xl border transition-all group"
              style={{ background: "#FAFBFC", borderColor: "#E9EBEF" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(49,130,246,0.04)";
                (e.currentTarget as HTMLElement).style.borderColor = "#3182F6";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "#FAFBFC";
                (e.currentTarget as HTMLElement).style.borderColor = "#E9EBEF";
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <TeamBadge team={j.assignedTeam} />
                    <span className="text-xs font-medium" style={{ color: "#94A3B8" }}>{j.authorName}</span>
                  </div>
                  <p className="text-sm font-semibold truncate" style={{ color: "#191F28" }}>{j.title}</p>
                  {j.content && (
                    <p className="text-xs mt-1 line-clamp-2 leading-relaxed" style={{ color: "#94A3B8" }}>
                      {j.content}
                    </p>
                  )}
                </div>
                <svg className="shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3182F6" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────

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

export default function WorkJournalPage() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [team,  setTeam]  = useState("전체");

  const [journals,  setJournals]  = useState<Journal[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [clients,   setClients]   = useState<Client[]>(_formCache?.data.clients ?? []);
  const [projects,  setProjects]  = useState<Project[]>(_formCache?.data.projects ?? []);

  const [selectedDate,    setSelectedDate]    = useState<string | null>(null);
  const [selectedJournal, setSelectedJournal] = useState<Journal | null>(null);
  const [mode, setMode] = useState<RightMode>("empty");

  const loadJournals = useCallback(() => {
    setLoading(true);
    const teamParam = team !== "전체" ? `&team=${encodeURIComponent(team)}` : "";
    fetch(`/api/work-journal?year=${year}&month=${month}${teamParam}`)
      .then((r) => r.json())
      .then((d) => setJournals(d.journals ?? []))
      .finally(() => setLoading(false));
  }, [year, month, team]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadJournals(); }, [loadJournals]);

  useEffect(() => {
    if (_formCache) { setClients(_formCache.data.clients); setProjects(_formCache.data.projects); return; }
    fetchFormOptions().then(({ clients: c, projects: p }) => { setClients(c); setProjects(p); });
  }, []);

  // 날짜 → 일지 Map
  const journalMap = new Map<string, Journal[]>();
  for (const j of journals) {
    const arr = journalMap.get(j.date) ?? [];
    arr.push(j);
    journalMap.set(j.date, arr);
  }

  function prevMonth() {
    setSelectedDate(null); setMode("empty");
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    setSelectedDate(null); setMode("empty");
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }

  function handleSelectDate(date: string) {
    setSelectedDate(date);
    setSelectedJournal(null);
    setMode("list");
  }

  function handleSelectJournal(j: Journal) {
    setSelectedJournal(j);
    setMode("detail");
  }

  function handleCreateNew() {
    setSelectedJournal(null);
    setMode("create");
  }

  async function handleCreate(data: Omit<Journal, "id" | "createdAt" | "clientName" | "projectName">) {
    const res = await fetch("/api/work-journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("fail");
    // 작성한 날짜로 이동
    const newDate = data.date;
    const [y, m] = newDate.split("-").map(Number);
    if (y !== year || m !== month) { setYear(y); setMonth(m); }
    setSelectedDate(newDate);
    setMode("list");
    loadJournals();
  }

  async function handleUpdate(data: Omit<Journal, "id" | "createdAt" | "clientName" | "projectName">) {
    if (!selectedJournal) return;
    const res = await fetch(`/api/work-journal/${selectedJournal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("fail");
    loadJournals();
    setMode("list");
  }

  async function handleDelete() {
    if (!selectedJournal || !confirm(`"${selectedJournal.title}" 일지를 삭제할까요?`)) return;
    await fetch(`/api/work-journal/${selectedJournal.id}`, { method: "DELETE" });
    setSelectedJournal(null);
    setMode("list");
    loadJournals();
  }

  const dayJournals = selectedDate ? (journalMap.get(selectedDate) ?? []) : [];

  function renderRight() {
    switch (mode) {
      case "create":
        return (
          <div>
            <h3 className="text-base font-bold mb-5" style={{ color: "#191F28" }}>새 업무일지 작성</h3>
            <JournalForm
              clients={clients} projects={projects}
              defaultDate={selectedDate ?? undefined}
              onSave={handleCreate}
              onCancel={() => setMode(selectedDate ? "list" : "empty")}
            />
          </div>
        );
      case "edit":
        return (
          <div>
            <h3 className="text-base font-bold mb-5" style={{ color: "#191F28" }}>업무일지 수정</h3>
            <JournalForm
              clients={clients} projects={projects}
              initial={selectedJournal ?? undefined}
              onSave={handleUpdate}
              onCancel={() => setMode("detail")}
            />
          </div>
        );
      case "detail":
        return selectedJournal ? (
          <JournalDetail
            journal={selectedJournal}
            onEdit={() => setMode("edit")}
            onDelete={handleDelete}
            onBack={() => setMode("list")}
          />
        ) : null;
      case "list":
        return selectedDate ? (
          <DayJournalList
            date={selectedDate}
            journals={dayJournals}
            onSelect={handleSelectJournal}
            onCreateNew={handleCreateNew}
          />
        ) : null;
      default:
        return (
          <div className="h-full flex flex-col items-center justify-center gap-3" style={{ color: "#94A3B8" }}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <p className="text-sm text-center leading-relaxed">캘린더에서 날짜를 클릭하면<br />해당 날의 업무일지를 확인할 수 있습니다.</p>
          </div>
        );
    }
  }

  return (
    <div className="flex flex-col gap-5 h-full">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black" style={{ color: "#191F28" }}>업무일지</h1>
          <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>팀원별 일일 업무 내용을 기록합니다.</p>
        </div>
        <button
          onClick={() => { setSelectedJournal(null); setMode("create"); }}
          className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl text-white transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          새 일지 작성
        </button>
      </div>

      {/* 필터 바 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <span className="text-sm font-bold w-24 text-center" style={{ color: "#191F28" }}>
            {year}년 {month}월
          </span>
          <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* 범례 */}
          <div className="flex items-center gap-3 mr-2">
            {[["영업 1팀", "#6366F1"], ["영업 2팀", "#10B981"]].map(([label, color]) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                <span className="text-xs" style={{ color: "#94A3B8" }}>{label}</span>
              </div>
            ))}
          </div>

          {/* 팀 필터 */}
          <div className="flex gap-1.5">
            {TEAMS.map((t) => (
              <button key={t} onClick={() => setTeam(t)}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all"
                style={{
                  background: team === t ? "rgba(49,130,246,0.1)" : "transparent",
                  borderColor: team === t ? "#3182F6" : "#E9EBEF",
                  color: team === t ? "#3182F6" : "#94A3B8",
                }}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 메인 영역 */}
      <div className="flex gap-5 flex-1 min-h-0">
        {/* 왼쪽: 캘린더 */}
        <div className="w-96 shrink-0">
          {loading ? (
            <div className="rounded-2xl py-16 text-center text-sm" style={{ background: "#FFFFFF", border: "1px solid #E9EBEF", color: "#94A3B8" }}>
              불러오는 중...
            </div>
          ) : (
            <Calendar
              year={year} month={month}
              journalMap={journalMap}
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
            />
          )}
        </div>

        {/* 오른쪽: 상세 패널 */}
        <div className="flex-1 rounded-2xl p-6 overflow-y-auto"
          style={{ background: "#FFFFFF", border: "1px solid #E9EBEF" }}>
          {renderRight()}
        </div>
      </div>
    </div>
  );
}
