"use client";

/**
 * 정기 회의록 — 월간회의 / 주간회의.
 *
 * 설계 의도: 회의록을 "이번에 무슨 얘기를 했나"가 아니라 **직전 회의와의 연결**로 만든다.
 * 직전 회의의 같은 축 기록이 화면 위쪽에 읽기전용으로 자동으로 붙고, 그것과 비교해 아래를 채운다.
 *
 * 축마다 지난 기간 · 이번 기간 · 다음 기간을 시간 순으로 가로에 늘어놓는다.
 *   월간회의 — 전월 · 당월 · 익월
 *   주간회의 — 전주 · 금주 · 차주
 * 가운데 칸(금주·당월 현황)이 다음 회의의 왼쪽 끝 칸으로 그대로 넘어온다 —
 * 2주차 회의에 적은 "금주 현황"이 3주차 회의에서는 "전주"다. 같은 주를 가리키므로 그대로 옮겨진다.
 * 넘겨받은 내용은 지우고 다시 쓰라는 뜻이 아니라, 그 아래에 그 뒤로 어떻게 됐는지를 덧붙이라는 뜻이다.
 *
 * 매출현황 축만 입력 칸이 없다. 자동 집계가 회의에서 읽을 수치를 전부 만들어 주므로
 * 같은 숫자를 손으로 옮겨 적게 두면 집계와 어긋나는 순간 어느 쪽이 맞는지 알 수 없어진다.
 *
 * 비교 대상:
 *   월간회의   → 전월 월간회의
 *   N주차 회의 → 같은 달 N-1주차 (미작성이면 그 앞 주차로 내려가며 탐색)
 *   1주차 회의 → 전월 마지막 주차 (달이 바뀌어도 주간 흐름이 끊기지 않게)
 *
 * 표현 원칙: 사람이 쓰는 영역에는 색을 쓰지 않는다.
 * 축마다 색을 주면 네 색이 서로 경쟁해서 정작 읽어야 할 본문이 묻힌다.
 * 축 구분은 여백과 굵기로 하고, 파랑은 "지금 선택된 것"과 "저장"에만 쓴다.
 * 색이 있는 곳은 자동 집계 블록뿐이며(목표/실적/전망 = 보라/파랑/초록),
 * 덕분에 "색이 있으면 시스템이 계산한 값"이라는 신호가 된다.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { fetchJson, saveErrorMessage } from "@/lib/fetch-json";
import { TEAM_FILTERS } from "@/lib/teams";
import {
  normalizeMeetingSections, meetingSectionsAreEmpty, axisHasText, MEETING_WRITABLE_AXIS_KEYS,
} from "@/lib/meeting-sections";
import { briefStats, briefText, briefProgress, wonExact, BRIEF_TONE, type RevenueBriefData } from "@/lib/meeting-brief";
import { renderMeetingImage } from "@/lib/meeting-image";
import type { MeetingAxisKey, MeetingSections } from "@/db/schema";

// ─── 타입 ─────────────────────────────────────────────────────
export interface ReportNote {
  id: string; year: number; month: number; week: number | null; team: string;
  content: string; sections: MeetingSections | null;
  authorName: string | null; createdAt?: string; updatedAt?: string;
}

interface MonthFigure { month: number; revenue: number; cost: number; margin: number; marginRate: number; count: number }
interface FiguresSource { monthly: MonthFigure[]; teams: { team: string; monthly: MonthFigure[] }[] }

// ─── 상수 ─────────────────────────────────────────────────────
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const TEAMS = TEAM_FILTERS;

/** 앱 공통 토큰(--diverz-*)과 같은 값. 회의록만 따로 노는 색을 만들지 않는다. */
const C = {
  ink:    "#191F28",   // 제목
  body:   "#333D4B",   // 본문
  muted:  "#6B7684",   // 라벨·보조 설명
  faint:  "#8B95A1",   // 비어 있음·부가 안내
  line:   "#E5E8EB",   // 경계선
  soft:   "#F7F8FA",   // 읽기 전용 영역 배경
  accent: "#3182F6",
  accentSoft: "#EAF2FE",
};

/** 자동 집계 전용 색 — 화면·공유 이미지가 같은 값을 쓰도록 lib에 둔다 */
const K = BRIEF_TONE;

const AXES: { key: MeetingAxisKey; label: string; hint: string }[] = [
  { key: "revenue",   label: "매출현황",     hint: "자동 집계 — 매출·매입·마진, 목표 대비 달성" },
  { key: "operation", label: "관리운영현황", hint: "현재 관리중인 프로젝트 운영 현황" },
  { key: "sales",     label: "영업현황",     hint: "신규 모집을 위한 영업 현황" },
  { key: "marketing", label: "마케팅현황",   hint: "신규 모집을 위한 마케팅 현황" },
];

const emptySections = (): MeetingSections => normalizeMeetingSections(null);

/** 사람이 쓰는 축만 — 매출현황은 자동 집계라 작성 여부를 세지 않는다. */
const WRITABLE = AXES.filter(a => MEETING_WRITABLE_AXIS_KEYS.includes(a.key));

/** 저장된 값이 없거나 구버전(3칸) 형태여도 항상 4축을 채워 돌려준다. */
const normalize = (s: MeetingSections | null | undefined): MeetingSections => normalizeMeetingSections(s);

// ─── 유틸 ─────────────────────────────────────────────────────
const pct = (n: number) => `${n.toFixed(1)}%`;

function fmtNoteDate(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 달력에 표시되는 주(행) 수 — 달마다 4~6주 */
function weekRowsOf(y: number, m: number) {
  const firstDay = new Date(y, m - 1, 1).getDay();
  const days     = new Date(y, m, 0).getDate();
  return Math.max(1, Math.ceil((firstDay + days) / 7));
}

function noteHasContent(n?: ReportNote | null) {
  if (!n) return false;
  if (n.content.trim()) return true;
  if (!n.sections) return false;
  return !meetingSectionsAreEmpty(normalize(n.sections));
}

/**
 * 비교 대상 회의록을 고른다.
 * 주간은 지정 주차부터 앞 주차로 내려가며 찾는다 — 중간 주차를 건너뛴 달에도 흐름이 끊기지 않게.
 */
function findPrevNote(pool: ReportNote[], m: number, w: number | null, team: string): { note?: ReportNote; label: string } {
  if (w === null) {
    return { note: pool.find(n => n.team === team && n.week === null), label: `${m}월 월간회의` };
  }
  for (let i = w; i >= 1; i--) {
    const note = pool.find(n => n.team === team && n.week === i && noteHasContent(n));
    if (note) return { note, label: `${m}월 ${i}주차 주간회의` };
  }
  return { label: `${m}월 주간회의` };
}

const ZERO_FIGURE: MonthFigure = { month: 0, revenue: 0, cost: 0, margin: 0, marginRate: 0, count: 0 };

/** 팀별 월 실적. 팀이 집계에 없으면 실적이 없다는 뜻이므로 0으로 본다. */
function pickFigure(src: FiguresSource | null, team: string, m: number): MonthFigure | null {
  if (!src) return null;
  const arr = team === "전체" ? src.monthly : src.teams.find(t => t.team === team)?.monthly;
  if (!arr) return { ...ZERO_FIGURE, month: m };
  return arr[m - 1] ?? { ...ZERO_FIGURE, month: m };
}

function delta(cur: number, prev: number) {
  if (prev === 0) return null;
  const d = ((cur - prev) / prev) * 100;
  return { val: Math.abs(d).toFixed(0), up: d >= 0 };
}

// ─── 메인 ─────────────────────────────────────────────────────
export default function MeetingSection({ year, month, criteria, criteriaLabel }: {
  year: number; month: number; criteria: string; criteriaLabel: string;
}) {
  const [noteTeam,  setNoteTeam]  = useState("전체");
  const [notes,     setNotes]     = useState<ReportNote[]>([]);
  const [prevNotes, setPrevNotes] = useState<ReportNote[]>([]);
  const [selected,  setSelected]  = useState<number | null>(null); // null = 월간회의, 1~N = 주차
  const [showCal,   setShowCal]   = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const [draftSections, setDraftSections] = useState<MeetingSections>(emptySections);
  const [draftContent,  setDraftContent]  = useState("");
  const [draftAuthor,   setDraftAuthor]   = useState("");

  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [copied,   setCopied]   = useState(false);
  const [imaging,  setImaging]  = useState(false);
  const [canShareFile, setCanShareFile] = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  // navigator를 렌더 중에 보면 서버 렌더 결과와 어긋나므로 마운트 뒤에 확인한다
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const probe = new File([new Uint8Array()], "probe.png", { type: "image/png" });
    setCanShareFile(!!navigator.canShare?.({ files: [probe] }));
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const weekRows = weekRowsOf(year, month);
  const weekNums = useMemo(() => Array.from({ length: weekRows }, (_, i) => i + 1), [weekRows]);

  // ── 회의록 로드 (당월 + 전월) ──
  const reloadNotes = useCallback(() => {
    if (!year || !month) return;
    fetchJson<{ notes: ReportNote[]; prevNotes: ReportNote[] }>(`/api/report-meetings?year=${year}&month=${month}`)
      .then(d => { setNotes(d.notes ?? []); setPrevNotes(d.prevNotes ?? []); })
      .catch(() => { setNotes([]); setPrevNotes([]); });
  }, [year, month]);
  useEffect(() => { reloadNotes(); }, [reloadNotes]);

  // ── 매출 자동 수치 (연간 집계를 받아 월 단위로 꺼내 쓴다) ──
  const [curFig,      setCurFig]      = useState<FiguresSource | null>(null);
  const [prevYearFig, setPrevYearFig] = useState<FiguresSource | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let alive = true;
    setCurFig(null);
    fetchJson<FiguresSource>(`/api/projects/monthly-report?year=${year}&month=0&criteria=${encodeURIComponent(criteria)}`)
      .then(d => { if (alive) setCurFig(d); })
      .catch(() => { if (alive) setCurFig(null); });
    return () => { alive = false; };
  }, [year, criteria]);

  // 1월 회의는 전월이 전년 12월이라 별도 연도 집계가 필요하다
  useEffect(() => {
    if (month !== 1) { setPrevYearFig(null); return; }
    let alive = true;
    fetchJson<FiguresSource>(`/api/projects/monthly-report?year=${year - 1}&month=0&criteria=${encodeURIComponent(criteria)}`)
      .then(d => { if (alive) setPrevYearFig(d); })
      .catch(() => { if (alive) setPrevYearFig(null); });
    return () => { alive = false; };
  }, [year, month, criteria]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── 선택된 회의 / 직전 회의 ──
  // 5주짜리 달에서 5주차를 보다가 4주만 있는 달로 옮기면 없는 주차가 선택된 채 남는다 — 표시 단계에서 접는다.
  const week = selected === null ? null : Math.min(selected, weekRows);
  const isMonthly = week === null;
  const currentNote = useMemo(
    () => notes.find(n => n.team === noteTeam && (week === null ? n.week === null : n.week === week)),
    [notes, noteTeam, week],
  );

  const prevRef = useMemo(() => {
    if (week === null) {
      const y = month === 1 ? year - 1 : year;
      const m = month === 1 ? 12 : month - 1;
      return { y, m, w: null as number | null, fromPrevMonth: true };
    }
    if (week > 1) return { y: year, m: month, w: week - 1, fromPrevMonth: false };
    const y = month === 1 ? year - 1 : year;
    const m = month === 1 ? 12 : month - 1;
    return { y, m, w: weekRowsOf(y, m), fromPrevMonth: true };
  }, [week, year, month]);

  /** 직전 회의록 — 해당 주차가 비어 있으면 앞 주차로 내려가며 찾는다. */
  const prev = findPrevNote(prevRef.fromPrevMonth ? prevNotes : notes, prevRef.m, prevRef.w, noteTeam);

  const prevSections = normalize(prev.note?.sections);

  // ── 선택/팀 변경 시 draft 재적재 ──
  const loadKey = `${noteTeam}|${week ?? "M"}|${currentNote?.id ?? "new"}`;
  const loadedRef = useRef("");
  useEffect(() => {
    if (loadedRef.current === loadKey) return;
    loadedRef.current = loadKey;
    setDraftSections(normalize(currentNote?.sections));
    setDraftContent(currentNote?.content ?? "");
    setDraftAuthor(currentNote?.authorName ?? "");
    setError(null);
    setSaved(false);
  }, [loadKey, currentNote]);

  /**
   * 직전 회의의 "금주(당월) 현황"을 이번 회의의 "전주(전월)" 칸으로 넘겨받는다.
   * 2주차의 금주와 3주차의 전주는 둘 다 2주차를 가리키므로 같은 내용이 그대로 옮겨진다.
   * 비어 있는 칸에만 넣으므로 이미 쓴 내용을 덮지 않는다.
   *
   * 적재(위 effect)와 분리한 이유: 직전 회의록은 당월·전월을 함께 받아오느라
   * 화면이 먼저 그려진 뒤에 도착할 수 있다. 같은 effect에 두면 그때 이미 늦는다.
   */
  const carriedRef = useRef("");
  useEffect(() => {
    if (carriedRef.current === loadKey || !prev.note) return;
    carriedRef.current = loadKey;
    setDraftSections(p => {
      let changed = false;
      const out = { ...p };
      for (const a of WRITABLE) {
        const carry = prevSections[a.key].current.trim();
        if (!carry || p[a.key].prev.trim()) continue;
        out[a.key] = { ...p[a.key], prev: carry };
        changed = true;
      }
      return changed ? out : p;
    });
  }, [loadKey, prev.note, prevSections]);

  const dirty = useMemo(() => {
    const saved0 = normalize(currentNote?.sections);
    if ((currentNote?.content ?? "") !== draftContent) return true;
    if ((currentNote?.authorName ?? "") !== draftAuthor) return true;
    return WRITABLE.some(a =>
      saved0[a.key].prev    !== draftSections[a.key].prev ||
      saved0[a.key].current !== draftSections[a.key].current ||
      saved0[a.key].next    !== draftSections[a.key].next
    );
  }, [currentNote, draftSections, draftContent, draftAuthor]);

  /** 저장 안 된 내용이 있으면 확인 후 이동 */
  function switchTo(next: () => void) {
    if (dirty && !confirm("저장하지 않은 내용이 있습니다. 이동하면 사라집니다. 계속할까요?")) return;
    next();
  }

  // ── 라벨 ──
  const fullLabel = isMonthly ? `${month}월 월간회의` : `${month}월 ${week}주차 주간회의`;
  // 가로 3칸의 머리말은 기간 이름만 둔다 — 무엇을 적는지는 그 옆 note가 설명한다
  const prevLabel = isMonthly ? "전월" : "전주";
  const nowLabel  = isMonthly ? "당월" : "금주";
  const nextLabel = isMonthly ? "익월" : "차주";

  // ── 저장 / 삭제 ──
  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/report-meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        year, month, week, team: noteTeam,
        sections: draftSections, content: draftContent, authorName: draftAuthor || null,
      }),
    });
    if (!res.ok) {
      setError(await saveErrorMessage(res));
      setSaving(false);
      return;
    }
    const data = await res.json();
    if (data?.note) {
      setNotes(p => {
        const idx = p.findIndex(n => n.id === data.note.id);
        if (idx >= 0) { const next = [...p]; next[idx] = data.note; return next; }
        return [...p, data.note];
      });
      // 저장하면 새 회의록의 id가 붙어 loadKey가 바뀐다. 두 ref를 함께 옮겨야
      // 적재가 draft를 다시 덮거나, 지운 점검 내용이 다시 넘어오는 일이 없다.
      const savedKey = `${noteTeam}|${week ?? "M"}|${data.note.id}`;
      loadedRef.current  = savedKey;
      carriedRef.current = savedKey;
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!currentNote) return;
    if (!confirm(`${noteTeam} — ${fullLabel} 기록을 삭제할까요?`)) return;
    setDeleting(true);
    const res = await fetch(`/api/report-meetings/${currentNote.id}`, { method: "DELETE" });
    if (res.ok) {
      const delId = currentNote.id;
      setNotes(p => p.filter(n => n.id !== delId));
      loadedRef.current = "";
      setDraftSections(emptySections());
      setDraftContent("");
    } else {
      setError("삭제에 실패했습니다.");
    }
    setDeleting(false);
  }

  /** 회의록 전문을 텍스트로 복사 — 메신저·메일 공유용 */
  async function handleCopy() {
    const lines: string[] = [`[${noteTeam}] ${year}년 ${fullLabel}`];
    if (draftAuthor) lines.push(`작성자: ${draftAuthor}`);
    lines.push(`비교 기준: ${prev.label}`, "");
    for (const a of WRITABLE) {
      const e = draftSections[a.key];
      if (!axisHasText(e)) continue;
      lines.push(`■ ${a.label}`);
      if (e.prev.trim())    lines.push(`  [${prevLabel}]\n${e.prev.trim()}`);
      if (e.current.trim()) lines.push(`  [${nowLabel}]\n${e.current.trim()}`);
      if (e.next.trim())    lines.push(`  [${nextLabel} 계획]\n${e.next.trim()}`);
      lines.push("");
    }
    if (draftContent.trim()) lines.push("■ 기타 논의·메모", draftContent.trim());
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("클립보드 복사가 차단되었습니다.");
    }
  }

  /**
   * 회의록 요약을 이미지 한 장으로 만든다 — 카카오톡 공유용.
   *
   * 내려받기는 어디서나 되고, 공유 시트(navigator.share)는 대체로 모바일에만 있다.
   * 공유가 되는 기기에서는 카톡을 바로 고를 수 있으므로 버튼을 하나 더 내준다.
   * 어느 쪽이든 같은 이미지다.
   */
  async function handleImage(mode: "download" | "share") {
    setImaging(true);
    setError(null);
    // 파일 이름에 못 쓰는 문자와 공백을 걷어낸다
    const fileName = `${noteTeam}_${year}_${fullLabel}`.replace(/[\s/\\:*?"<>|]/g, "") + ".png";
    try {
      const blob = await renderMeetingImage({
        team:    noteTeam,
        title:   fullLabel,
        caption: `${year}년 · ${criteriaLabel}${draftAuthor ? ` · ${draftAuthor}` : ""}`,
        nowLabel, nextLabel,
        stats: brief ? briefStats(brief, isMonthly) : [],
        kpi:   brief ? briefProgress(brief, isMonthly) : null,
        trend: curFig ? { year, values: yearRevenues, highlight: month } : null,
        axes:  WRITABLE.map(a => ({
          label:   a.label,
          current: draftSections[a.key].current,
          next:    draftSections[a.key].next,
        })),
        memo: draftContent,
      });
      if (mode === "share") {
        const file = new File([blob], fileName, { type: "image/png" });
        await navigator.share({ files: [file], title: `${noteTeam} ${fullLabel}` });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        // 문서에 붙였다 떼야 한다. 떠 있는 a가 아니면 클릭이 무시되는 브라우저가 있다.
        document.body.appendChild(a);
        a.click();
        a.remove();
        // 바로 revoke하면 내려받기가 시작되기 전에 주소가 사라져 파일이 안 떨어진다
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (e) {
      // 공유 시트를 사용자가 그냥 닫은 것은 실패가 아니다
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setError("이미지를 만들지 못했습니다.");
      }
    }
    setImaging(false);
  }

  // ── 매출 브리핑 ──
  /**
   * "N일 매출"의 기준일.
   * 주간회의는 그 주 마지막 날까지, 월간회의는 월말까지 본다.
   * 진행 중인 달이면 아직 오지 않은 날은 셀 수 없으므로 오늘로 자른다.
   */
  const asOfDate = useMemo(() => {
    const dim = new Date(year, month, 0).getDate();
    const fd  = new Date(year, month - 1, 1).getDay();
    const weekEnd = week === null ? dim : Math.min(dim, week * 7 - fd);
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
    const day = Math.max(1, isCurrentMonth ? Math.min(weekEnd, today.getDate()) : weekEnd);
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }, [year, month, week]);

  // 응답에 요청 조건을 함께 담아둔다 — 조건이 바뀌면 이전 팀·주차의 수치가 잠깐 보이는 일이 없다.
  const briefKey = `${year}|${month}|${noteTeam}|${criteria}|${asOfDate}`;
  const [briefState, setBriefState] = useState<{ key: string; data: RevenueBriefData } | null>(null);
  useEffect(() => {
    let alive = true;
    const p = new URLSearchParams({ year: String(year), month: String(month), team: noteTeam, criteria, asOf: asOfDate });
    fetchJson<RevenueBriefData>(`/api/projects/revenue-brief?${p}`)
      .then(d => { if (alive) setBriefState({ key: briefKey, data: d }); })
      .catch(() => { /* 집계 실패 시 브리핑만 비운다 — 회의록 작성은 막지 않는다 */ });
    return () => { alive = false; };
  }, [briefKey, year, month, noteTeam, criteria, asOfDate]);
  const brief = briefState?.key === briefKey ? briefState.data : null;

  // ── 매출 자동 수치 ──
  // 매출 집계는 월 단위밖에 없다. 주간회의에서도 "전주 대비"인 척하지 않고 당월 vs 전월로 고정한다.
  const figPrevMonth = month === 1 ? 12 : month - 1;
  /** 공유 이미지 월별 추이용 — 조회 중인 해의 1~12월 매출. 실적이 없는 달은 0이다. */
  const yearRevenues = useMemo(
    () => Array.from({ length: 12 }, (_, i) => pickFigure(curFig, noteTeam, i + 1)?.revenue ?? 0),
    [curFig, noteTeam],
  );
  const curFigure  = pickFigure(curFig, noteTeam, month);
  const prevFigure = pickFigure(month === 1 ? prevYearFig : curFig, noteTeam, figPrevMonth);

  // ── 작성 현황 ──
  const teamHasAny = useCallback(
    (t: string) => notes.some(n => n.team === t && noteHasContent(n)),
    [notes],
  );
  const meetingFilled = useCallback(
    (w: number | null) => noteHasContent(notes.find(n => n.team === noteTeam && (w === null ? n.week === null : n.week === w))),
    [notes, noteTeam],
  );
  const axisFilled = (k: MeetingAxisKey) => axisHasText(draftSections[k]);
  const filledCount = WRITABLE.filter(a => axisFilled(a.key)).length;

  // 달력의 회의록 작성일 점
  const writtenDays = useMemo(() => {
    const map = new Map<number, string[]>();
    notes
      .filter(n => n.team === noteTeam && noteHasContent(n) && n.updatedAt)
      .forEach(n => {
        const d = new Date(n.updatedAt!);
        if (isNaN(d.getTime()) || d.getFullYear() !== year || d.getMonth() + 1 !== month) return;
        const day = d.getDate();
        const arr = map.get(day) ?? [];
        arr.push(n.week === null ? "월간회의" : `${n.week}주차`);
        map.set(day, arr);
      });
    return map;
  }, [notes, noteTeam, year, month]);

  const firstDay    = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  // ── 렌더 ──
  return (
    <div className="rounded-2xl" style={{ background: "#fff", border: `1px solid ${C.line}` }}>

      {/* 팀 선택 */}
      <div className="flex items-center gap-1 px-5 py-3 flex-wrap" style={{ borderBottom: `1px solid ${C.line}` }}>
        {TEAMS.map(t => {
          const on = noteTeam === t;
          return (
            <button key={t} onClick={() => switchTo(() => setNoteTeam(t))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] transition-colors"
              style={{
                background: on ? C.accentSoft : "transparent",
                color:      on ? C.accent : C.muted,
                fontWeight: on ? 700 : 500,
              }}>
              {t}
              {teamHasAny(t) && <Dot on />}
            </button>
          );
        })}
      </div>

      {/* 회의 선택 — 앱의 탭 방식(밑줄)을 그대로 쓴다 */}
      <div className="flex items-center px-5 gap-1 flex-wrap" style={{ borderBottom: `1px solid ${C.line}` }}>
        <MeetingTab label="월간회의" active={isMonthly} filled={meetingFilled(null)}
          onClick={() => switchTo(() => setSelected(null))} />
        {weekNums.map(w => (
          <MeetingTab key={w} label={`${w}주차`} active={week === w} filled={meetingFilled(w)}
            onClick={() => switchTo(() => setSelected(w))} />
        ))}
        <button onClick={() => setShowCal(v => !v)}
          className="ml-auto text-xs py-2.5 transition-colors hover:opacity-70"
          style={{ color: C.faint }}>
          {showCal ? "달력 닫기" : "달력"}
        </button>
      </div>

      {/* 달력 — 회의록 작성일 확인용 */}
      {showCal && (
        <div className="px-5 py-4" style={{ borderBottom: `1px solid ${C.line}` }}>
          <div className="max-w-[420px]">
            <div className="grid" style={{ gridTemplateColumns: "36px repeat(7, 1fr)" }}>
              <div />
              {DOW.map(d => (
                <div key={d} className="text-center text-xs py-1" style={{ color: C.faint }}>{d}</div>
              ))}
            </div>
            {weekNums.map(w => {
              const isSel = week === w;
              return (
                <button key={w} onClick={() => switchTo(() => setSelected(w))}
                  className="w-full grid items-center rounded-lg transition-colors hover:bg-slate-50"
                  style={{ gridTemplateColumns: "36px repeat(7, 1fr)", background: isSel ? C.accentSoft : "transparent" }}>
                  <span className="text-xs py-1.5" style={{ color: isSel ? C.accent : C.faint, fontWeight: isSel ? 700 : 400 }}>{w}주</span>
                  {Array.from({ length: 7 }, (_, dow) => {
                    const day = (w - 1) * 7 + dow - firstDay + 1;
                    const inMonth = day >= 1 && day <= daysInMonth;
                    const written = inMonth ? writtenDays.get(day) : undefined;
                    return (
                      <span key={dow} className="flex flex-col items-center justify-center py-1.5" style={{ minHeight: 28 }}
                        title={written ? `${written.join(", ")} 작성일` : undefined}>
                        {inMonth && (
                          <>
                            <span style={{ fontSize: 12, color: written ? C.accent : C.body, fontWeight: written ? 700 : 400 }}>{day}</span>
                            {written && <Dot on />}
                          </>
                        )}
                      </span>
                    );
                  })}
                </button>
              );
            })}
            <p className="text-xs mt-2" style={{ color: C.faint }}>점 = 회의록 작성일</p>
          </div>
        </div>
      )}

      {/* 선택된 회의 */}
      <div className="px-5 py-4 flex items-start justify-between gap-3 flex-wrap" style={{ borderBottom: `1px solid ${C.line}` }}>
        <div className="min-w-0">
          <p className="text-[17px] font-bold" style={{ color: C.ink }}>
            {noteTeam} · {fullLabel}
          </p>
          <p className="text-[13px] mt-1" style={{ color: C.muted }}>
            {filledCount}/{WRITABLE.length} 축 작성 · 비교 대상 {prev.label}{!prev.note && " (기록 없음)"}
            {currentNote?.updatedAt && ` · 저장 ${fmtNoteDate(currentNote.updatedAt)}`}
            {dirty && <span style={{ color: "#E8590C", fontWeight: 700 }}> · 저장 안 됨</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input value={draftAuthor} onChange={e => setDraftAuthor(e.target.value)} placeholder="작성자"
            className="px-3 py-2 text-[13px] rounded-lg outline-none border transition-colors focus:border-[#3182F6] placeholder:text-[#8B95A1]"
            style={{ borderColor: C.line, color: C.ink, width: 92 }} />
          <TextButton onClick={handleCopy}>{copied ? "복사됨" : "복사"}</TextButton>
          <TextButton onClick={() => handleImage("download")} disabled={imaging}>
            {imaging ? "만드는 중" : "이미지 저장"}
          </TextButton>
          {canShareFile && (
            <TextButton onClick={() => handleImage("share")} disabled={imaging}>공유</TextButton>
          )}
          {currentNote && <TextButton onClick={handleDelete} disabled={deleting || saving} danger>{deleting ? "삭제 중" : "삭제"}</TextButton>}
          <button onClick={handleSave} disabled={saving || deleting}
            className="px-4 py-2 rounded-lg text-[13px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: C.accent }}>
            {saving ? "저장 중" : saved ? "저장됨" : "저장"}
          </button>
        </div>
      </div>

      {error && (
        <div className="px-5 py-2.5 text-[13px]" style={{ background: "#FFF5F5", color: "#E03131", borderBottom: `1px solid ${C.line}` }}>
          {error}
        </div>
      )}

      {/* 4개 축 + 기타 메모 */}
      <div onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); handleSave(); } }}>
        {AXES.map(axis => {
          const open     = !collapsed[axis.key];
          const writable = axis.key !== "revenue";
          const entry    = draftSections[axis.key];
          // 직전 회의에 적은 그 기간의 현황 — 이번 회의의 전주(전월) 칸이 가리키는 바로 그 기간이다
          const carry = prevSections[axis.key].current.trim();
          const set = (field: keyof typeof entry, v: string) =>
            setDraftSections(p => ({ ...p, [axis.key]: { ...p[axis.key], [field]: v } }));
          // 다시 가져올 때 이미 쓴 내용을 덮지 않도록 아래에 잇는다
          const pullCarry = () => set("prev", entry.prev.trim() ? `${entry.prev.trimEnd()}\n\n${carry}` : carry);

          return (
            <section key={axis.key} style={{ borderBottom: `1px solid ${C.line}` }}>
              <button onClick={() => setCollapsed(p => ({ ...p, [axis.key]: !p[axis.key] }))}
                className="w-full flex items-center gap-2 px-5 py-3.5 text-left transition-colors hover:bg-slate-50">
                <Chevron open={open} />
                <span className="text-[15px] font-bold" style={{ color: C.ink }}>{axis.label}</span>
                <span className="text-xs truncate" style={{ color: C.faint }}>{axis.hint}</span>
                {writable ? (
                  <span className="ml-auto flex items-center gap-1.5 text-xs shrink-0"
                    style={{ color: axisFilled(axis.key) ? C.accent : C.faint }}>
                    <Dot on={axisFilled(axis.key)} />
                    {axisFilled(axis.key) ? "작성됨" : "미작성"}
                  </span>
                ) : (
                  // 쓸 칸이 없는 축에 "미작성"을 띄우면 빠뜨린 것처럼 읽힌다
                  <span className="ml-auto text-xs shrink-0" style={{ color: C.faint }}>자동 집계</span>
                )}
              </button>

              {open && (
                <div className="px-5 pb-5">
                  {/* 매출현황은 자동 집계만 본다 — 손으로 옮겨 적을 칸을 두지 않는다 */}
                  {!writable ? (
                    <RevenueBrief brief={brief} month={month} prevMonth={figPrevMonth}
                      isMonthly={isMonthly} cur={curFigure} prevFig={prevFigure} />
                  ) : (
                    /* 지난 기간 · 이번 기간 · 다음 기간을 시간 순으로 가로 배치 */
                    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
                      <Field label={prevLabel} note="지난 기간"
                        placeholder={`${prev.label}에 적은 현황이 넘어옵니다\n그 뒤로 어떻게 됐는지 덧붙이세요`}
                        value={entry.prev} onChange={v => set("prev", v)}
                        action={carry
                          ? <MiniButton onClick={pullCarry}>{prev.label}에서 가져오기</MiniButton>
                          : <span className="text-xs" style={{ color: C.faint }}>가져올 내용 없음</span>} />
                      <Field label={nowLabel} note="현황"
                        placeholder={"현재 상태\n예) 수치, 진행 건, 이슈"}
                        value={entry.current} onChange={v => set("current", v)} />
                      <Field label={nextLabel} note="계획"
                        placeholder={`${isMonthly ? "다음 달" : "다음 주"}까지 할 일\n예) 담당 · 기한 · 목표 수치`}
                        value={entry.next} onChange={v => set("next", v)} />
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}

        {/* 기타 논의·메모 */}
        <section className="px-5 py-4">
          <p className="text-[15px] font-bold mb-1" style={{ color: C.ink }}>기타 논의 · 메모</p>
          <p className="text-xs mb-2.5" style={{ color: C.faint }}>4개 축에 들어가지 않는 안건</p>
          <textarea value={draftContent} onChange={e => setDraftContent(e.target.value)} rows={3}
            placeholder="공지, 인사, 일정 등"
            className="w-full px-3.5 py-2.5 text-sm rounded-lg outline-none border leading-relaxed transition-colors focus:border-[#3182F6] placeholder:text-[#8B95A1]"
            style={{ borderColor: C.line, color: C.ink, resize: "vertical" }} />
          <p className="text-xs mt-2" style={{ color: C.faint }}>⌘S / Ctrl+S 로 저장</p>
        </section>
      </div>
    </div>
  );
}

// ─── 하위 컴포넌트 ────────────────────────────────────────────
function Dot({ on }: { on: boolean }) {
  return <span className="rounded-full shrink-0" style={{ width: 5, height: 5, background: on ? "#3182F6" : "#D1D6DB" }} />;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8B95A1" strokeWidth="2.5" strokeLinecap="round"
      style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0 }}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function MeetingTab({ label, active, filled, onClick }: {
  label: string; active: boolean; filled: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-2.5 text-[13px] transition-colors"
      style={{
        color: active ? C.ink : C.muted,
        fontWeight: active ? 700 : 500,
        borderBottom: `2px solid ${active ? C.accent : "transparent"}`,
        marginBottom: -1,
      }}>
      {label}
      <Dot on={filled} />
    </button>
  );
}

function TextButton({ children, onClick, disabled, danger }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="px-3 py-2 rounded-lg text-[13px] font-semibold border transition-colors hover:bg-slate-50 disabled:opacity-40"
      style={{ color: danger ? "#E03131" : C.muted, borderColor: C.line }}>
      {children}
    </button>
  );
}

/** 칸 머리말 옆에 붙는 작은 보조 동작. 저장·삭제와 경쟁하지 않게 테두리 없이 둔다. */
function MiniButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="text-xs font-bold px-2 py-0.5 rounded-md transition-colors hover:brightness-95"
      style={{ color: C.accent, background: C.accentSoft }}>
      {children}
    </button>
  );
}

/** 축 안의 입력 한 칸. 테두리 1px + 포커스 시 파랑 — 그 이상 장식하지 않는다. */
function Field({ label, value, onChange, placeholder, rows = 5, note, action }: {
  label?: string; value: string; onChange: (v: string) => void;
  placeholder: string; rows?: number; note?: string; action?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      {(label || action) && (
        <div className="flex items-center gap-2 mb-1.5 min-h-[22px]">
          {label && (
            <p className="text-[13px] font-semibold" style={{ color: C.body }}>
              {label}
              {note && <span className="font-normal ml-1.5" style={{ color: C.faint }}>{note}</span>}
            </p>
          )}
          {action && <span className="ml-auto shrink-0">{action}</span>}
        </div>
      )}
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} placeholder={placeholder}
        className="w-full px-3.5 py-2.5 text-sm rounded-lg outline-none border leading-relaxed transition-colors focus:border-[#3182F6] placeholder:text-[#8B95A1]"
        style={{ borderColor: C.line, color: C.ink, resize: "vertical" }} />
    </div>
  );
}

/**
 * 매출현황 축 맨 위 자동 집계.
 *
 * 한 덩어리 목록으로 두면 전부 같은 크기의 회색 글자가 되어 무엇이 중요한지 안 보인다.
 * 세 묶음으로 끊고 크기 차이를 준다.
 *   ① 핵심 금액 3개 — 크게 (월 KPI / 기준일 매출 / 월말 예상)
 *   ② 프로젝트 건수 — 중간
 *   ③ 전월 대비     — 작게, 배경을 깔아 참고 정보임을 드러낸다
 */
function RevenueBrief({ brief, month, prevMonth, cur, prevFig, isMonthly }: {
  brief: RevenueBriefData | null; month: number; prevMonth: number;
  cur: MonthFigure | null; prevFig: MonthFigure | null; isMonthly: boolean;
}) {
  const [copied, setCopied] = useState(false);

  if (!brief) {
    return (
      <div className="rounded-lg px-3.5 py-3 text-[13px]" style={{ background: C.soft, color: C.muted }}>
        자동 집계를 불러오는 중입니다.
      </div>
    );
  }

  const { asOfDay, projects: p } = brief;
  const statRow = (
    <div className="grid gap-px" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", background: C.line }}>
      {briefStats(brief, isMonthly).map(st => (
        <Stat key={st.label} label={st.label} tone={K[st.tone]} value={st.value} sub={st.sub} dim={st.dim} />
      ))}
    </div>
  );

  /** 회의록에는 옮겨 적지 않는다. 메신저·메일로 그대로 넘길 수 있게 복사만 준다. */
  const copy = async (monthly: boolean) => {
    try {
      await navigator.clipboard.writeText(briefText(brief, monthly));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* 클립보드가 막힌 환경 — 화면의 수치는 그대로 읽을 수 있다 */ }
  };

  /**
   * 주간회의는 월 KPI · 월 누적 매출 · 월 누적 매입 세 가지만 본다.
   * 주 단위 회의에서 필요한 건 "이번 달 어디까지 왔나"이지 프로젝트 구성이나 월말 전망이 아니다.
   *
   * 여기서는 기준일로 자르지 않고 그 달 전체를 집계한다.
   * 수주 기준에서는 캠페인 시작일이 아직 안 왔어도 이미 계약된 8월 매출이라, 오늘로 자르면
   * 프로젝트 관리·리포트가 보여주는 월 매출과 값이 어긋난다. 회의록만 다른 숫자를 말하면 안 된다.
   */
  if (!isMonthly) {
    return (
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
        <BriefHeader label={`자동 집계 · ${month}월 전체`} copied={copied} onCopy={() => copy(false)} />
        {statRow}
      </div>
    );
  }

  // 마진율은 비율이라 증감을 %가 아니라 %p(절대 차이)로 본다
  const marginRateDelta = cur && prevFig
    ? { val: Math.abs(cur.marginRate - prevFig.marginRate).toFixed(1), up: cur.marginRate >= prevFig.marginRate }
    : null;

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
      <BriefHeader label={`자동 집계 · ${month}월 ${asOfDay}일 기준`} copied={copied} onCopy={() => copy(true)} />

      {/* 핵심 금액 — 목표·실적·전망을 색으로 가른다 */}
      {statRow}

      {/* 프로젝트 건수 */}
      <div className="px-4 py-3" style={{ borderTop: `1px solid ${C.line}` }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs shrink-0" style={{ color: C.muted, minWidth: 52 }}>프로젝트</span>
          <Count label="보장형" n={p.guaranteed} tone={K.actual} />
          <Count label="관리형" n={p.managed}    tone={K.target} />
          <Count label="신규"   n={p.fresh}      tone={K.forecast} />
          <span className="text-xs" style={{ color: C.faint }}>
            당월 시작 {p.total}건 · 신규 = 첫 거래 광고주
          </span>
        </div>
      </div>

      {/* 전월 대비 — 참고 정보라 배경을 깔고 가장 작게 */}
      {cur && (
        <div className="px-4 py-3" style={{ borderTop: `1px solid ${C.line}`, background: C.soft }}>
          <p className="text-xs mb-2" style={{ color: C.faint }}>{month}월 전체 · {prevMonth}월 대비</p>
          <div className="flex gap-x-5 gap-y-2 flex-wrap">
            <FigItem label="확정매출" value={wonExact(cur.revenue)} d={prevFig ? delta(cur.revenue, prevFig.revenue) : null} goodUp />
            <FigItem label="승인매입" value={wonExact(cur.cost)}    d={prevFig ? delta(cur.cost, prevFig.cost) : null} />
            <FigItem label="마진"     value={wonExact(cur.margin)}  d={prevFig ? delta(cur.margin, prevFig.margin) : null} goodUp />
            <FigItem label="마진율"   value={pct(cur.marginRate)} d={marginRateDelta} unit="%p" goodUp />
          </div>
        </div>
      )}
    </div>
  );
}

function BriefHeader({ label, copied, onCopy }: {
  label: string; copied: boolean; onCopy: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2.5" style={{ background: C.soft, borderBottom: `1px solid ${C.line}` }}>
      <span className="text-xs font-semibold" style={{ color: C.muted }}>{label}</span>
      <button onClick={onCopy}
        className="text-xs font-bold px-2.5 py-1 rounded-md transition-colors"
        style={{ color: C.accent, background: C.accentSoft }}>
        {copied ? "복사됨" : "수치 복사"}
      </button>
    </div>
  );
}

/** 핵심 금액 한 칸. 라벨은 지표 색으로, 금액은 크고 검게 — 색이 금액을 가리면 안 된다. */
function Stat({ label, value, sub, dim, tone }: {
  label: string; value: string; sub?: string; dim?: boolean; tone: { fg: string; bg: string };
}) {
  return (
    <div className="px-4 py-3" style={{ background: dim ? "#fff" : tone.bg }}>
      <p className="text-xs font-bold" style={{ color: dim ? C.muted : tone.fg }}>{label}</p>
      <p className="text-xl font-bold tabular-nums mt-1" style={{ color: dim ? C.faint : C.ink }}>{value}</p>
      {sub && <p className="text-xs mt-0.5 font-semibold tabular-nums" style={{ color: dim ? C.faint : tone.fg }}>{sub}</p>}
    </div>
  );
}

/** 프로젝트 유형별 건수 배지 */
function Count({ label, n, tone }: { label: string; n: number; tone: { fg: string; bg: string } }) {
  return (
    <span className="text-[13px] px-2 py-1 rounded-md" style={{ background: tone.bg, color: tone.fg }}>
      {label} <b className="text-[15px] tabular-nums">{n}</b>건
    </span>
  );
}

function FigItem({ label, value, d, goodUp, unit = "%" }: {
  label: string; value: string; d?: { val: string; up: boolean } | null; goodUp?: boolean; unit?: string;
}) {
  const good = d ? d.up === !!goodUp : false;
  return (
    <span className="text-[13px] flex items-baseline gap-1.5" style={{ color: C.muted }}>
      {label}
      <b className="text-[15px] tabular-nums" style={{ color: C.ink }}>{value}</b>
      {d && (
        <span className="text-xs font-bold tabular-nums px-1.5 py-0.5 rounded"
          style={{ color: good ? "#2B8A3E" : "#C92A2A", background: good ? "#EBFBEE" : "#FFF5F5" }}>
          {d.up ? "▲" : "▼"}{d.val}{unit}
        </span>
      )}
    </span>
  );
}
