"use client";

import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import {
  BarChart, Bar, LineChart, Line, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from "recharts";

// ─── 상수 ─────────────────────────────────────────────────────
const MONTHS_KO   = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const TEAMS       = ["전체", "영업 1팀", "영업 2팀"];
const TEAM_COLOR: Record<string, string> = { "영업 1팀": "#6366F1", "영업 2팀": "#10B981", "미지정": "#94A3B8" };
type AnalysisTab = "overview" | "team" | "person" | "project";
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

// ─── 회의록 노트 타입 ─────────────────────────────────────────
interface ReportNote { id: string; year: number; month: number; week: number|null; team: string; content: string; authorName: string|null; createdAt?: string; updatedAt?: string; }

function fmtNoteDate(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ─── 회의록 섹션 컴포넌트 ─────────────────────────────────────
function MeetingSection({ year, month }: { year: number; month: number }) {
  const [noteTeam, setNoteTeam] = useState("전체");
  const [notes,    setNotes]    = useState<ReportNote[]>([]);
  const [expanded, setExpanded] = useState<string>("월간"); // "월간" | "주간-N" | "" (모두 닫힘)
  const [draftContent, setDraftContent] = useState("");
  const [draftAuthor,  setDraftAuthor]  = useState("");
  const [saving,   setSaving]   = useState(false);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  // 노트 로드
  useEffect(() => {
    if (!year || !month) return;
    fetch(`/api/report-meetings?year=${year}&month=${month}`)
      .then(r => r.json()).then(d => setNotes(d.notes ?? []));
  }, [year, month]);

  // 달력 주차 계산 (달마다 5~6주)
  const firstDay    = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const weekRows    = Math.max(1, Math.ceil((firstDay + daysInMonth) / 7));
  const weekNums    = Array.from({ length: weekRows }, (_, i) => i + 1);

  const getNote = useCallback(
    (team: string, week: number | null) =>
      notes.find(n => n.team === team && (week === null ? n.week === null : n.week === week)),
    [notes],
  );

  const keyOf   = (week: number | null) => (week === null ? "월간" : `주간-${week}`);
  const weekOf  = (key: string): number | null => (key === "월간" ? null : parseInt(key.split("-")[1]));
  const activeWeek = expanded ? weekOf(expanded) : null;
  const activeNote = expanded ? getNote(noteTeam, activeWeek) : undefined;

  // 선택 항목 / 팀 변경 시 편집 draft 로드
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setDraftContent(activeNote?.content ?? "");
    setDraftAuthor(activeNote?.authorName ?? "");
  }, [activeNote?.id, expanded, noteTeam]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleSave() {
    if (!expanded) return;
    const week = weekOf(expanded);
    setSaving(true);
    const res = await fetch("/api/report-meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, month, week, team: noteTeam, content: draftContent, authorName: draftAuthor || null }),
    });
    const data = await res.json();
    if (data?.note) {
      setNotes(p => {
        const idx = p.findIndex(n => n.id === data.note.id);
        if (idx >= 0) { const next = [...p]; next[idx] = data.note; return next; }
        return [...p, data.note];
      });
      const k = expanded;
      setSavedKey(k);
      setTimeout(() => setSavedKey(cur => (cur === k ? null : cur)), 2000);
    }
    setSaving(false);
  }

  const [deleting, setDeleting] = useState(false);
  async function handleDelete() {
    if (!activeNote) return;
    if (!confirm(`${noteTeam} — ${fullLabel(activeWeek)} 기록을 삭제할까요?`)) return;
    setDeleting(true);
    const res = await fetch(`/api/report-meetings/${activeNote.id}`, { method: "DELETE" });
    if (res.ok) {
      const delId = activeNote.id;
      setNotes(p => p.filter(n => n.id !== delId));
      setDraftContent("");
      setDraftAuthor("");
    } else {
      alert("삭제에 실패했습니다.");
    }
    setDeleting(false);
  }

  const filled     = (team: string, week: number | null) => {
    const n = getNote(team, week);
    return !!n && n.content.trim().length > 0;
  };
  const teamHasAny = (team: string) => notes.some(n => n.team === team && n.content.trim().length > 0);

  const fullLabel  = (week: number | null) => (week === null ? `${month}월 월간회의` : `${month}월 ${week}주차 주간회의`);
  const shortLabel = (week: number | null) => (week === null ? "월간회의" : `${week}주차`);
  const accordionItems: (number | null)[] = [null, ...weekNums];

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
      {/* 헤더 + 팀 선택 */}
      <div className="flex items-center justify-between px-5 py-4 flex-wrap gap-3" style={{ borderBottom: "1px solid #F1F5F9", background: "#F8FAFC" }}>
        <div>
          <h3 className="text-sm font-bold" style={{ color: "#191F28" }}>회의록</h3>
          <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>{year}년 {month}월 · 월간회의 및 주간회의 기록</p>
        </div>
        <div className="flex gap-1">
          {TEAMS.map(t => (
            <button key={t} onClick={() => setNoteTeam(t)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: noteTeam === t ? `${TEAM_COLOR[t] ?? "#3182F6"}15` : "#fff",
                color:      noteTeam === t ? (TEAM_COLOR[t] ?? "#3182F6") : "#64748B",
                border:     `1px solid ${noteTeam === t ? `${TEAM_COLOR[t] ?? "#3182F6"}40` : "#E9EBEF"}`,
              }}>
              {t}
              {teamHasAny(t) && <span className="w-1.5 h-1.5 rounded-full" style={{ background: TEAM_COLOR[t] ?? "#3182F6" }} />}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5 flex flex-col lg:flex-row gap-5">
        {/* ── 왼쪽: 월 달력 ── */}
        <div className="lg:w-[380px] lg:shrink-0">
          {/* 월간회의 배너 */}
          <button onClick={() => setExpanded("월간")}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl mb-2 transition-colors"
            style={{
              background: expanded === "월간" ? "rgba(49,130,246,0.1)" : "#F8FAFC",
              border: `1px solid ${expanded === "월간" ? "rgba(49,130,246,0.35)" : "#E9EBEF"}`,
            }}>
            <span className="text-xs font-bold" style={{ color: expanded === "월간" ? "#3182F6" : "#475569" }}>월간회의</span>
            {filled(noteTeam, null)
              ? <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#3182F6" }} />
              : <span className="text-xs" style={{ color: "#CBD5E1" }}>미작성</span>}
          </button>

          {/* 요일 헤더 */}
          <div className="grid mb-1" style={{ gridTemplateColumns: "40px repeat(7, 1fr)" }}>
            <div />
            {DOW.map((d, i) => (
              <div key={d} className="text-center text-xs font-semibold py-1"
                style={{ color: i === 0 ? "#EF4444" : i === 6 ? "#3182F6" : "#94A3B8" }}>{d}</div>
            ))}
          </div>

          {/* 주차 행 (클릭 시 오른쪽 아코디언 열림) */}
          <div className="space-y-1">
            {weekNums.map(w => {
              const isSel = expanded === keyOf(w);
              const has   = filled(noteTeam, w);
              return (
                <button key={w} onClick={() => setExpanded(keyOf(w))}
                  className="w-full grid items-center rounded-xl transition-colors hover:bg-slate-50"
                  style={{
                    gridTemplateColumns: "40px repeat(7, 1fr)",
                    background: isSel ? "rgba(49,130,246,0.08)" : "transparent",
                    border: `1px solid ${isSel ? "rgba(49,130,246,0.3)" : "transparent"}`,
                  }}>
                  <div className="flex flex-col items-center justify-center py-1.5">
                    <span className="text-xs font-bold" style={{ color: isSel ? "#3182F6" : "#94A3B8" }}>{w}주</span>
                    {has && <span className="w-1 h-1 rounded-full mt-0.5" style={{ background: "#3182F6" }} />}
                  </div>
                  {Array.from({ length: 7 }, (_, dow) => {
                    const day = (w - 1) * 7 + dow - firstDay + 1;
                    const inMonth = day >= 1 && day <= daysInMonth;
                    return (
                      <div key={dow} className="text-center text-xs py-1.5"
                        style={{ color: !inMonth ? "transparent" : dow === 0 ? "#EF4444" : dow === 6 ? "#3182F6" : "#475569" }}>
                        {inMonth ? day : ""}
                      </div>
                    );
                  })}
                </button>
              );
            })}
          </div>
          <p className="text-xs mt-2 px-1" style={{ color: "#B0B8C1" }}>● 표시된 주차·월간을 클릭하면 오른쪽에서 열립니다.</p>
        </div>

        {/* ── 오른쪽: 아코디언 (보기 + 수정) ── */}
        <div className="flex-1 min-w-0 space-y-2">
          {accordionItems.map(w => {
            const key    = keyOf(w);
            const isOpen = expanded === key;
            const note   = getNote(noteTeam, w);
            const hasC   = !!note && note.content.trim().length > 0;
            return (
              <div key={key} className="rounded-xl overflow-hidden border" style={{ borderColor: isOpen ? "rgba(49,130,246,0.35)" : "#E9EBEF" }}>
                {/* 아코디언 헤더 */}
                <button onClick={() => setExpanded(isOpen ? "" : key)}
                  className="w-full flex items-center justify-between px-4 py-3 transition-colors"
                  style={{ background: isOpen ? "rgba(49,130,246,0.06)" : "#fff" }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={isOpen ? "#3182F6" : "#94A3B8"} strokeWidth="2.5" strokeLinecap="round"
                      style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0 }}>
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                    <span className="text-sm font-bold" style={{ color: isOpen ? "#3182F6" : "#191F28" }}>{shortLabel(w)}</span>
                    {hasC
                      ? <span className="text-xs px-2 py-0.5 rounded-full shrink-0" style={{ background: "rgba(16,185,129,0.1)", color: "#059669" }}>저장됨</span>
                      : <span className="text-xs px-2 py-0.5 rounded-full shrink-0" style={{ background: "#F1F5F9", color: "#94A3B8" }}>미작성</span>}
                    {!isOpen && hasC && <span className="text-xs truncate" style={{ color: "#94A3B8" }}>{note!.content.replace(/\s+/g, " ").trim()}</span>}
                  </div>
                  {!isOpen && hasC && (
                    <span className="text-xs shrink-0 ml-2 whitespace-nowrap" style={{ color: "#94A3B8" }}>
                      {fmtNoteDate(note!.updatedAt)}{note!.authorName ? ` · ${note!.authorName}` : ""}
                    </span>
                  )}
                </button>

                {/* 본문 — 보기 + 수정 + 삭제 */}
                {isOpen && (
                  <div className="px-4 pb-4 pt-1" style={{ background: "#fff" }}>
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                      <div className="min-w-0">
                        <span className="text-sm font-bold" style={{ color: TEAM_COLOR[noteTeam] ?? "#3182F6" }}>
                          {noteTeam} — {fullLabel(w)}
                        </span>
                        {note?.updatedAt && (
                          <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>
                            작성일 {fmtNoteDate(note.updatedAt)}
                            {note.authorName ? ` · ${note.authorName}` : ""}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <input value={draftAuthor} onChange={e => setDraftAuthor(e.target.value)} placeholder="작성자"
                          className="px-2.5 py-1.5 text-xs rounded-lg outline-none border transition-colors focus:border-[#3182F6]"
                          style={{ background: "#F8FAFC", borderColor: "#E9EBEF", color: "#191F28", width: 90 }} />
                        <button onClick={handleSave} disabled={saving || deleting}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                          style={{ background: savedKey === key ? "#10B981" : "linear-gradient(135deg,#3182F6,#2462D8)" }}>
                          {saving ? "저장 중..." : savedKey === key ? "저장됨 ✓" : note ? "수정 저장" : "저장"}
                        </button>
                        {note && (
                          <button onClick={handleDelete} disabled={deleting || saving}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                            style={{ background: "rgba(239,68,68,0.08)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.2)" }}>
                            {deleting ? "삭제 중..." : "삭제"}
                          </button>
                        )}
                      </div>
                    </div>
                    <textarea
                      value={draftContent}
                      onChange={e => setDraftContent(e.target.value)}
                      onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); handleSave(); } }}
                      rows={16}
                      placeholder={w === null
                        ? `${month}월 월간회의 내용을 입력하세요.\n\n예)\n• 이번 달 목표 달성 현황\n• 주요 이슈 및 액션 아이템\n• 다음 달 계획`
                        : `${month}월 ${w}주차 주간회의 내용을 입력하세요.\n\n예)\n• 금주 진행 현황\n• 이슈 사항\n• 다음 주 계획`}
                      className="w-full px-4 py-3 text-sm rounded-xl outline-none border resize-none leading-relaxed transition-colors focus:border-[#3182F6]"
                      style={{ background: "#F8FAFC", borderColor: "#E9EBEF", color: "#191F28", minHeight: 340 }}
                    />
                    <p className="text-xs mt-1.5 px-1" style={{ color: "#B0B8C1" }}>⌘S / Ctrl+S 로 저장</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── 포맷 유틸 ────────────────────────────────────────────────
function wonFmt(n: number) {
  if (n === 0) return "₩0";
  if (Math.abs(n) >= 100_000_000) return `₩${(n / 100_000_000).toFixed(1)}억`;
  if (Math.abs(n) >= 10_000)      return `₩${(n / 10_000).toFixed(0)}만`;
  return "₩" + n.toLocaleString();
}
function wonFull(n: number) { return "₩" + n.toLocaleString(); }
function pct(n: number) { return `${n.toFixed(1)}%`; }
function diffArrow(a: number, b: number) {
  if (b === 0) return null;
  const d = ((a - b) / b) * 100;
  return { val: Math.abs(d).toFixed(1), up: d >= 0 };
}

// ─── 공통 컴포넌트 ────────────────────────────────────────────
function KpiCard({ label, value, sub, color, icon }: {
  label: string; value: string; sub?: React.ReactNode; color: string; icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color: "#94A3B8" }}>{label}</span>
        <span className="p-2 rounded-xl" style={{ background: `${color}18`, color }}>{icon}</span>
      </div>
      <p className="text-xl font-black" style={{ color: "#191F28" }}>{value}</p>
      {sub && <div className="text-xs" style={{ color: "#94A3B8" }}>{sub}</div>}
    </div>
  );
}

function MarginBar({ rate }: { rate: number }) {
  const color = rate >= 40 ? "#059669" : rate >= 20 ? "#3182F6" : rate >= 0 ? "#F97316" : "#EF4444";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full" style={{ background: "#F1F5F9" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(Math.max(rate, 0), 100)}%`, background: color }} />
      </div>
      <span className="text-xs font-bold w-10 text-right" style={{ color }}>{pct(rate)}</span>
    </div>
  );
}

// ─── 커스텀 툴팁 ──────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-3 py-2.5 text-xs" style={{ background: "#191F28", border: "none", boxShadow: "0 4px 16px rgba(22,31,51,0.2)" }}>
      <p className="font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.7)" }}>{label}</p>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span style={{ color: "rgba(255,255,255,0.8)" }}>{p.name}</span>
          <span className="font-bold" style={{ color: "#fff" }}>{wonFmt(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

// ─── 타입 ─────────────────────────────────────────────────────
interface MonthData  { month: number; revenue: number; cost: number; margin: number; marginRate: number; count: number; }
interface TeamData   { team: string; projectCount: number; revenue: number; cost: number; margin: number; marginRate: number; monthly: MonthData[]; }
interface PersonData { name: string; team: string; projectCount: number; revenue: number; cost: number; margin: number; marginRate: number; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface ProjectRow { id: string; campaignName: string; advertiser: string|null; assignedTeam: string|null; assignedPerson: string|null; contractAmount: number|null; status: string; startDate: string|null; endDate: string|null; revenue: number; cost: number; margin: number; marginRate: number; revenueRows: any[]; costRows: any[]; }
interface ReportData { year: number; month: number; monthly: MonthData[]; teams: TeamData[]; persons: PersonData[]; projects: ProjectRow[]; totalSummary: { projectCount: number; revenue: number; cost: number; margin: number; marginRate: number }; }

// ─── 메인 ─────────────────────────────────────────────────────
export default function ProjectReportPage() {
  const now = new Date();
  const [year,   setYear]   = useState(now.getFullYear());
  const [month,  setMonth]  = useState(0); // 0 = 연간
  const [team,   setTeam]   = useState("전체");
  const [criteria, setCriteria] = useState<"캠페인 시작날짜" | "계산서날짜" | "통장">("캠페인 시작날짜");
  const [tab,    setTab]    = useState<AnalysisTab>("overview");
  const [data,   setData]   = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState<"revenue"|"margin"|"marginRate">("revenue");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({ year: String(year), month: String(month), criteria, ...(team !== "전체" ? { team } : {}) });
    fetch(`/api/projects/monthly-report?${p}`)
      .then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, [year, month, team, criteria]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // 이전 월 데이터 (MoM 비교용)
  const [prevData, setPrevData] = useState<ReportData | null>(null);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (month === 0) { setPrevData(null); return; }
    const py = month === 1 ? year - 1 : year;
    const pm = month === 1 ? 12 : month - 1;
    const p = new URLSearchParams({ year: String(py), month: String(pm), criteria, ...(team !== "전체" ? { team } : {}) });
    fetch(`/api/projects/monthly-report?${p}`).then(r => r.json()).then(setPrevData);
  }, [year, month, team, criteria]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const total = data?.totalSummary;
  const prevTotal = prevData?.totalSummary;

  // 차트 데이터
  const trendData = (data?.monthly ?? []).map((m, i) => ({
    month: MONTHS_SHORT[i],
    확정매출: m.revenue,
    승인매입: m.cost,
    마진:    m.margin,
  }));

  const activeMonths = month > 0
    ? trendData.slice(month - 1, month)
    : trendData.filter((_, i) => (data?.monthly[i]?.revenue ?? 0) > 0 || (data?.monthly[i]?.cost ?? 0) > 0);

  const teamBarData = (data?.teams ?? []).map(t => ({
    team: t.team,
    확정매출: t.revenue,
    승인매입: t.cost,
    마진:    t.margin,
  }));

  function exportExcel() {
    if (!data) return;
    const rows = data.projects.map(p => ({
      팀: p.assignedTeam ?? "미지정",
      캠페인명: p.campaignName, 광고주: p.advertiser ?? "",
      담당자: p.assignedPerson ?? "", 상태: p.status,
      계약금액: p.contractAmount ?? 0,
      확정매출: p.revenue, 승인매입: p.cost,
      마진: p.margin, 마진율: pct(p.marginRate),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [8,22,15,10,6,12,12,12,12,8].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${year}년${month > 0 ? `${month}월` : "연간"}`);
    XLSX.writeFile(wb, `리포트_${year}년${month > 0 ? `${month}월` : "연간"}${team !== "전체" ? `_${team}` : ""}.xlsx`);
  }

  const TABS: { key: AnalysisTab; label: string }[] = [
    { key: "overview", label: "종합" },
    { key: "team",     label: "팀별" },
    { key: "person",   label: "담당자별" },
    { key: "project",  label: "프로젝트별" },
  ];

  return (
    <div className="space-y-5">

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "#191F28" }}>프로젝트 리포트</h1>
          <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>
            {criteria === "통장"
              ? "매출: 입금 승인일 기준 · 매입: 승인일 기준"
              : criteria === "계산서날짜"
              ? "매출: 계산서 발행일 기준 · 매입: 계산서 발행일 기준"
              : "매출: 캠페인 시작일 기준 · 매입: 계산서 발행일 기준"}
          </p>
        </div>
        <button onClick={exportExcel} disabled={!total || total.projectCount === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all hover:bg-slate-50 disabled:opacity-40"
          style={{ borderColor: "#E9EBEF", color: "#475569" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          Excel
        </button>
      </div>

      {/* 필터 바 */}
      <div className="flex items-center gap-3 flex-wrap p-4 rounded-2xl" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
        {/* 연도 */}
        <div className="flex items-center gap-1">
          <button onClick={() => setYear(y => y - 1)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span className="text-sm font-bold w-14 text-center" style={{ color: "#191F28" }}>{year}년</span>
          <button onClick={() => setYear(y => y + 1)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>

        <div className="w-px h-5" style={{ background: "#E9EBEF" }} />

        {/* 월 (연간 포함) */}
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => setMonth(0)}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
            style={{ background: month === 0 ? "#191F28" : "#F8FAFC", color: month === 0 ? "#fff" : "#64748B", border: `1px solid ${month === 0 ? "#191F28" : "#E9EBEF"}` }}>
            연간
          </button>
          {MONTHS_KO.map((m, i) => (
            <button key={i} onClick={() => setMonth(i + 1)}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: month === i + 1 ? "#3182F6" : "#F8FAFC",
                color:      month === i + 1 ? "#fff" : "#64748B",
                border:     `1px solid ${month === i + 1 ? "#3182F6" : "#E9EBEF"}`,
              }}>
              {m}
            </button>
          ))}
        </div>

        <div className="w-px h-5" style={{ background: "#E9EBEF" }} />

        {/* 팀 */}
        <div className="flex gap-1">
          {TEAMS.map(t => (
            <button key={t} onClick={() => setTeam(t)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: team === t ? "rgba(49,130,246,0.1)" : "#F8FAFC",
                color:      team === t ? "#3182F6" : "#64748B",
                border:     `1px solid ${team === t ? "rgba(49,130,246,0.3)" : "#E9EBEF"}`,
              }}>
              {t}
            </button>
          ))}
        </div>

        <div className="w-px h-5" style={{ background: "#E9EBEF" }} />

        {/* 기준 토글 */}
        <div className="flex gap-1">
          {([
            { value: "캠페인 시작날짜", label: "캠페인 시작일" },
            { value: "계산서날짜",     label: "계산서 발행일" },
            { value: "통장",           label: "통장 기준" },
          ] as const).map(({ value, label }) => (
            <button key={value} onClick={() => setCriteria(value)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: criteria === value ? "rgba(16,185,129,0.1)" : "#F8FAFC",
                color:      criteria === value ? "#10B981" : "#64748B",
                border:     `1px solid ${criteria === value ? "rgba(16,185,129,0.3)" : "#E9EBEF"}`,
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="확정매출" value={loading ? "—" : wonFmt(total?.revenue ?? 0)}
          color="#3182F6"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>}
          sub={prevTotal && month > 0 && (() => {
            const d = diffArrow(total?.revenue ?? 0, prevTotal.revenue);
            if (!d) return null;
            return <span style={{ color: d.up ? "#22C55E" : "#EF4444", fontWeight: 700 }}>
              {d.up ? "▲" : "▼"} {d.val}% <span style={{ color: "#94A3B8", fontWeight: 400 }}>전월비</span>
            </span>;
          })()} />

        <KpiCard label="승인매입" value={loading ? "—" : wonFmt(total?.cost ?? 0)}
          color="#EF4444"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>}
          sub={prevTotal && month > 0 && (() => {
            const d = diffArrow(total?.cost ?? 0, prevTotal.cost);
            if (!d) return null;
            return <span style={{ color: d.up ? "#EF4444" : "#22C55E", fontWeight: 700 }}>
              {d.up ? "▲" : "▼"} {d.val}% <span style={{ color: "#94A3B8", fontWeight: 400 }}>전월비</span>
            </span>;
          })()} />

        <KpiCard label="마진" value={loading ? "—" : wonFmt(total?.margin ?? 0)}
          color={total && total.margin >= 0 ? "#10B981" : "#EF4444"}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>}
          sub={<span style={{ color: "#94A3B8" }}>프로젝트 {total?.projectCount ?? 0}건</span>} />

        <KpiCard label="마진율" value={loading ? "—" : pct(total?.marginRate ?? 0)}
          color={total && total.marginRate >= 30 ? "#10B981" : total && total.marginRate >= 15 ? "#3182F6" : "#F97316"}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>}
          sub={prevTotal && month > 0 && (() => {
            const d = diffArrow(total?.marginRate ?? 0, prevTotal.marginRate);
            if (!d) return null;
            return <span style={{ color: d.up ? "#22C55E" : "#EF4444", fontWeight: 700 }}>
              {d.up ? "▲" : "▼"} {d.val}%p <span style={{ color: "#94A3B8", fontWeight: 400 }}>전월비</span>
            </span>;
          })()} />
      </div>

      {/* 분석 탭 */}
      <div className="flex items-center gap-1 border-b" style={{ borderColor: "#E9EBEF" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-5 py-2.5 text-sm font-semibold transition-all"
            style={{
              color:       tab === t.key ? "#191F28" : "#94A3B8",
              borderBottom: tab === t.key ? "2px solid #3182F6" : "2px solid transparent",
              marginBottom: -1,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-24 text-center text-sm" style={{ color: "#94A3B8" }}>
          <svg className="animate-spin mx-auto mb-3" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          분석 중...
        </div>
      ) : (
        <>
          {/* ── 종합 탭 ── */}
          {tab === "overview" && (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-5">
                {/* 월별 추이 차트 */}
                <div className="col-span-2 rounded-2xl p-5" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold" style={{ color: "#191F28" }}>월별 추이</h3>
                      <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>{year}년 확정매출 · 승인매입 · 마진</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs" style={{ color: "#64748B" }}>
                      {[["확정매출","#3182F6"],["승인매입","#EF4444"],["마진","#10B981"]].map(([k,c]) => (
                        <span key={k} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: c }} />{k}</span>
                      ))}
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={trendData} barGap={2} barCategoryGap="35%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} tickFormatter={v => wonFmt(v)} width={55} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="확정매출" fill="#3182F6" radius={[3,3,0,0]} />
                      <Bar dataKey="승인매입" fill="#FCA5A5" radius={[3,3,0,0]} />
                      <Line dataKey="마진" stroke="#10B981" strokeWidth={2} dot={{ r: 3, fill: "#10B981" }} type="monotone" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* 마진율 게이지 + 요약 */}
                <div className="rounded-2xl p-5 flex flex-col gap-4" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
                  <h3 className="text-sm font-bold" style={{ color: "#191F28" }}>수익 구조</h3>

                  {/* 도넛형 마진율 표시 */}
                  <div className="flex flex-col items-center gap-1">
                    {(() => {
                      const r = total?.marginRate ?? 0;
                      const color = r >= 40 ? "#059669" : r >= 20 ? "#3182F6" : r >= 0 ? "#F97316" : "#EF4444";
                      const circ = 2 * Math.PI * 40;
                      const dash = circ * Math.min(Math.max(r / 100, 0), 1);
                      return (
                        <div className="relative w-28 h-28">
                          <svg width="112" height="112" viewBox="0 0 112 112">
                            <circle cx="56" cy="56" r="40" fill="none" stroke="#F1F5F9" strokeWidth="10" />
                            <circle cx="56" cy="56" r="40" fill="none" stroke={color} strokeWidth="10"
                              strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
                              transform="rotate(-90 56 56)" style={{ transition: "stroke-dasharray 0.6s ease" }} />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-xl font-black" style={{ color }}>{pct(r)}</span>
                            <span className="text-xs" style={{ color: "#94A3B8" }}>마진율</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="space-y-2 text-xs">
                    {[
                      { label: "확정매출", val: wonFmt(total?.revenue ?? 0), color: "#3182F6" },
                      { label: "승인매입", val: wonFmt(total?.cost ?? 0),    color: "#EF4444" },
                      { label: "마진",     val: wonFmt(total?.margin ?? 0),  color: total && total.margin >= 0 ? "#10B981" : "#EF4444" },
                    ].map(r => (
                      <div key={r.label} className="flex items-center justify-between px-3 py-2 rounded-xl" style={{ background: "#F8FAFC" }}>
                        <span style={{ color: "#64748B" }}>{r.label}</span>
                        <span className="font-bold" style={{ color: r.color }}>{r.val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 팀별 비교 차트 */}
              {(data?.teams ?? []).length > 1 && (
                <div className="rounded-2xl p-5" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
                  <h3 className="text-sm font-bold mb-4" style={{ color: "#191F28" }}>팀별 비교</h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={teamBarData} barCategoryGap="40%" barGap={4}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                      <XAxis dataKey="team" tick={{ fontSize: 12, fill: "#475569", fontWeight: 600 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} tickFormatter={v => wonFmt(v)} width={55} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="확정매출" radius={[4,4,0,0]}>
                        {teamBarData.map((entry, i) => <Cell key={i} fill={TEAM_COLOR[entry.team] ?? "#94A3B8"} />)}
                      </Bar>
                      <Bar dataKey="승인매입" fill="#CBD5E1" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  {/* 팀별 마진율 바 */}
                  <div className="mt-4 space-y-2">
                    {(data?.teams ?? []).map(t => (
                      <div key={t.team}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold" style={{ color: TEAM_COLOR[t.team] ?? "#94A3B8" }}>{t.team}</span>
                          <span className="text-xs" style={{ color: "#94A3B8" }}>{wonFmt(t.revenue)} · {t.projectCount}건</span>
                        </div>
                        <MarginBar rate={t.marginRate} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── 팀별 탭 ── */}
          {tab === "team" && (
            <div className="space-y-5">
              {(data?.teams ?? []).length === 0 ? (
                <div className="py-16 text-center text-sm" style={{ color: "#94A3B8" }}>해당 기간 팀별 데이터가 없습니다.</div>
              ) : (data?.teams ?? []).map(t => (
                <div key={t.team} className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: `1px solid ${TEAM_COLOR[t.team] ?? "#E9EBEF"}40` }}>
                  {/* 팀 헤더 */}
                  <div className="flex items-center justify-between px-5 py-4" style={{ background: `${TEAM_COLOR[t.team] ?? "#94A3B8"}08`, borderBottom: "1px solid #F1F5F9" }}>
                    <div className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: TEAM_COLOR[t.team] ?? "#94A3B8" }} />
                      <span className="font-bold" style={{ color: "#191F28" }}>{t.team}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: `${TEAM_COLOR[t.team] ?? "#94A3B8"}15`, color: TEAM_COLOR[t.team] ?? "#94A3B8" }}>{t.projectCount}건</span>
                    </div>
                    <div className="flex items-center gap-5 text-xs">
                      <span style={{ color: "#94A3B8" }}>매출 <span className="font-bold" style={{ color: "#191F28" }}>{wonFmt(t.revenue)}</span></span>
                      <span style={{ color: "#94A3B8" }}>매입 <span className="font-bold" style={{ color: "#191F28" }}>{wonFmt(t.cost)}</span></span>
                      <span style={{ color: "#94A3B8" }}>마진 <span className="font-bold" style={{ color: t.margin >= 0 ? "#059669" : "#EF4444" }}>{wonFmt(t.margin)}</span></span>
                      <span style={{ color: "#94A3B8" }}>마진율 <span className="font-bold" style={{ color: TEAM_COLOR[t.team] ?? "#94A3B8" }}>{pct(t.marginRate)}</span></span>
                    </div>
                  </div>

                  {/* 팀별 월별 차트 */}
                  <div className="p-5">
                    <p className="text-xs font-semibold mb-3" style={{ color: "#64748B" }}>월별 확정매출 추이</p>
                    <ResponsiveContainer width="100%" height={140}>
                      <ComposedChart data={t.monthly.map((m, i) => ({ month: MONTHS_SHORT[i], 매출: m.revenue, 마진: m.margin }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 9, fill: "#94A3B8" }} axisLine={false} tickLine={false} tickFormatter={v => wonFmt(v)} width={50} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="매출" fill={TEAM_COLOR[t.team] ?? "#94A3B8"} radius={[3,3,0,0]} opacity={0.7} />
                        <Line dataKey="마진" stroke={TEAM_COLOR[t.team] ?? "#94A3B8"} strokeWidth={2} dot={{ r: 2 }} type="monotone" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── 담당자별 탭 ── */}
          {tab === "person" && (
            <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
              <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #F1F5F9", background: "#F8FAFC" }}>
                <p className="text-sm font-bold" style={{ color: "#191F28" }}>담당자별 성과</p>
                <div className="flex gap-1">
                  {(["revenue","margin","marginRate"] as const).map(s => (
                    <button key={s} onClick={() => setSortBy(s)}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
                      style={{ background: sortBy === s ? "rgba(49,130,246,0.1)" : "transparent", color: sortBy === s ? "#3182F6" : "#94A3B8", border: `1px solid ${sortBy === s ? "rgba(49,130,246,0.3)" : "transparent"}` }}>
                      {s === "revenue" ? "매출순" : s === "margin" ? "마진순" : "마진율순"}
                    </button>
                  ))}
                </div>
              </div>

              {(data?.persons ?? []).length === 0 ? (
                <div className="py-16 text-center text-sm" style={{ color: "#94A3B8" }}>해당 기간 담당자 데이터가 없습니다.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "#F8FAFC" }}>
                      {["순위","담당자","팀","프로젝트","확정매출","승인매입","마진","마진율"].map(h => (
                        <th key={h} className="px-5 py-3 text-left text-xs font-semibold" style={{ color: "#64748B" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...(data?.persons ?? [])].sort((a, b) => b[sortBy] - a[sortBy]).map((p, i) => (
                      <tr key={p.name} className="border-t" style={{ borderColor: "#F1F5F9" }}>
                        <td className="px-5 py-3.5">
                          <span className="text-sm font-black w-6 h-6 flex items-center justify-center rounded-lg"
                            style={{
                              background: i === 0 ? "#FEF3C7" : i === 1 ? "#F1F5F9" : i === 2 ? "#FEF3C7" : "transparent",
                              color:      i === 0 ? "#D97706" : i === 1 ? "#64748B" : i === 2 ? "#92400E" : "#94A3B8",
                            }}>
                            {i + 1}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-semibold" style={{ color: "#191F28" }}>{p.name}</td>
                        <td className="px-5 py-3.5">
                          {p.team && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                              style={{ background: `${TEAM_COLOR[p.team] ?? "#94A3B8"}15`, color: TEAM_COLOR[p.team] ?? "#94A3B8" }}>
                              {p.team}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>{p.projectCount}건</td>
                        <td className="px-5 py-3.5 font-bold text-xs" style={{ color: "#3182F6" }}>{wonFull(p.revenue)}</td>
                        <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>{wonFull(p.cost)}</td>
                        <td className="px-5 py-3.5 font-bold text-xs" style={{ color: p.margin >= 0 ? "#059669" : "#EF4444" }}>{wonFull(p.margin)}</td>
                        <td className="px-5 py-3.5"><MarginBar rate={p.marginRate} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── 프로젝트별 탭 ── */}
          {tab === "project" && (
            <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
              <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #F1F5F9", background: "#F8FAFC" }}>
                <p className="text-sm font-bold" style={{ color: "#191F28" }}>프로젝트별 상세</p>
                <div className="flex gap-1">
                  {(["revenue","margin","marginRate"] as const).map(s => (
                    <button key={s} onClick={() => setSortBy(s)}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
                      style={{ background: sortBy === s ? "rgba(49,130,246,0.1)" : "transparent", color: sortBy === s ? "#3182F6" : "#94A3B8", border: `1px solid ${sortBy === s ? "rgba(49,130,246,0.3)" : "transparent"}` }}>
                      {s === "revenue" ? "매출순" : s === "margin" ? "마진순" : "마진율순"}
                    </button>
                  ))}
                </div>
              </div>

              {(data?.projects ?? []).length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-sm" style={{ color: "#94A3B8" }}>해당 기간에 집계된 프로젝트가 없습니다.</p>
                  <p className="text-xs mt-1" style={{ color: "#CBD5E1" }}>확정매출(계산서발급) 또는 승인매입이 있어야 표시됩니다.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "#F8FAFC" }}>
                      {["팀","캠페인명","광고주","담당자","확정매출","승인매입","마진","마진율",""].map(h => (
                        <th key={h} className="px-5 py-3 text-left text-xs font-semibold" style={{ color: "#64748B" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...(data?.projects ?? [])].sort((a, b) => b[sortBy] - a[sortBy]).map(p => {
                      const isOpen = expandedId === p.id;
                      return (
                        <>
                          <tr key={p.id} className="border-t cursor-pointer"
                            style={{ borderColor: "#F1F5F9", background: isOpen ? "rgba(49,130,246,0.02)" : "transparent" }}
                            onClick={() => setExpandedId(isOpen ? null : p.id)}>
                            <td className="px-5 py-3">
                              {p.assignedTeam ? (
                                <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                                  style={{ background: `${TEAM_COLOR[p.assignedTeam] ?? "#94A3B8"}15`, color: TEAM_COLOR[p.assignedTeam] ?? "#94A3B8" }}>
                                  {p.assignedTeam}
                                </span>
                              ) : <span className="text-xs" style={{ color: "#CBD5E1" }}>미지정</span>}
                            </td>
                            <td className="px-5 py-3 font-semibold" style={{ color: "#191F28" }}>
                              <div className="flex items-center gap-1.5">
                                {p.campaignName}
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={isOpen ? "#3182F6" : "#CBD5E1"} strokeWidth="2.5" strokeLinecap="round">
                                  {isOpen ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}
                                </svg>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-xs" style={{ color: "#475569" }}>{p.advertiser || "—"}</td>
                            <td className="px-5 py-3 text-xs" style={{ color: "#475569" }}>{p.assignedPerson || "—"}</td>
                            <td className="px-5 py-3 font-bold text-xs" style={{ color: "#3182F6" }}>{wonFull(p.revenue)}</td>
                            <td className="px-5 py-3 text-xs" style={{ color: "#475569" }}>{wonFull(p.cost)}</td>
                            <td className="px-5 py-3 font-bold text-xs" style={{ color: p.margin >= 0 ? "#059669" : "#EF4444" }}>{wonFull(p.margin)}</td>
                            <td className="px-5 py-3"><MarginBar rate={p.marginRate} /></td>
                            <td className="px-5 py-3">
                              <span className="text-xs px-2 py-0.5 rounded-full" style={{
                                background: p.status === "진행" ? "rgba(49,130,246,0.1)" : p.status === "종료" ? "#F1F5F9" : "rgba(139,92,246,0.1)",
                                color:      p.status === "진행" ? "#3182F6" : p.status === "종료" ? "#64748B" : "#8B5CF6",
                              }}>{p.status}</span>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr key={`${p.id}-d`} style={{ background: "rgba(49,130,246,0.01)" }}>
                              <td colSpan={9} className="px-10 pb-4 pt-1">
                                <div className="grid grid-cols-2 gap-5 text-xs">
                                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                  {(p as any).revenueRows?.length > 0 && (
                                    <div>
                                      <p className="font-bold mb-2" style={{ color: "#3182F6" }}>확정매출 내역</p>
                                      <table className="w-full">
                                        <thead><tr style={{ borderBottom: "1px solid #E9EBEF" }}>
                                          {["품명","계산서일","합계"].map(h => <th key={h} className="pb-1 text-left font-semibold" style={{ color: "#94A3B8" }}>{h}</th>)}
                                        </tr></thead>
                                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                        <tbody>{(p as any).revenueRows.map((r: any, i: number) => (
                                          <tr key={i}><td className="py-1" style={{ color: "#475569" }}>{r.productName || "—"}</td><td className="py-1" style={{ color: "#94A3B8" }}>{r.invoiceDate || "—"}</td><td className="py-1 font-semibold" style={{ color: "#3182F6" }}>{wonFull(r.total ?? 0)}</td></tr>
                                        ))}</tbody>
                                      </table>
                                    </div>
                                  )}
                                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                  {(p as any).costRows?.length > 0 && (
                                    <div>
                                      <p className="font-bold mb-2" style={{ color: "#059669" }}>승인매입 내역</p>
                                      <table className="w-full">
                                        <thead><tr style={{ borderBottom: "1px solid #E9EBEF" }}>
                                          {["품명","매입처","매입일","합계"].map(h => <th key={h} className="pb-1 text-left font-semibold" style={{ color: "#94A3B8" }}>{h}</th>)}
                                        </tr></thead>
                                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                        <tbody>{(p as any).costRows.map((c: any, i: number) => (
                                          <tr key={i}><td className="py-1" style={{ color: "#475569" }}>{c.productName || "—"}</td><td className="py-1" style={{ color: "#94A3B8" }}>{c.vendor || "—"}</td><td className="py-1" style={{ color: "#94A3B8" }}>{c.purchaseDate || "—"}</td><td className="py-1 font-semibold" style={{ color: "#059669" }}>{wonFull(c.total ?? 0)}</td></tr>
                                        ))}</tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "2px solid #E9EBEF", background: "rgba(49,130,246,0.04)" }}>
                      <td colSpan={4} className="px-5 py-3 text-xs font-bold" style={{ color: "#3182F6" }}>합계 ({(data?.projects ?? []).length}건)</td>
                      <td className="px-5 py-3 text-xs font-black" style={{ color: "#3182F6" }}>{wonFull(total?.revenue ?? 0)}</td>
                      <td className="px-5 py-3 text-xs font-bold" style={{ color: "#475569" }}>{wonFull(total?.cost ?? 0)}</td>
                      <td className="px-5 py-3 text-xs font-black" style={{ color: (total?.margin ?? 0) >= 0 ? "#059669" : "#EF4444" }}>{wonFull(total?.margin ?? 0)}</td>
                      <td className="px-5 py-3"><MarginBar rate={total?.marginRate ?? 0} /></td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {/* 회의록 섹션 — 분석과 별개로 항상 표시 */}
      <MeetingSection year={year} month={month > 0 ? month : new Date().getMonth() + 1} />
    </div>
  );
}
