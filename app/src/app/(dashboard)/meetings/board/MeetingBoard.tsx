"use client";

/**
 * 정기 회의록 — 회의 순서대로 한 화면에 읽어 내려가는 문서.
 *
 *   ① 전체 매출  ② 영업팀  ③ 영업관리팀  ④ 프로젝트 일정
 *   ─ 회사 내부 ─  ⑤ 마케팅팀  ⑥ 개발팀  ⑦ 관리팀  ⑧ 결정사항
 *
 * 왼쪽 목차에서 이 달의 회의(월간 · 주차별)를 고르고, 순서 칸을 눌러 해당 섹션으로 내려간다.
 * 숫자는 각 섹션이 스스로 불러오고, 회의록에 저장되는 건 사람이 쓴 칸(멤버별 · 팀별 · 결정사항)과
 * 회의일 · 작성자 · 참석자뿐이다. 업체 만족도 · 연장 상태 · 팀 할 일은 회의가 아니라 대상마다
 * 따로 저장돼 다음 회의에도 이어진다.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { fetchJson, saveErrorMessage } from "@/lib/fetch-json";
import { useUser } from "@/lib/UserContext";
import {
  normalizeMeetingMembers, normalizeMeetingTeamNotes, normalizeAttendees, memberHasText,
} from "@/lib/meeting-sections";
import type { MeetingMembers, MeetingTeamNotes, MeetingTeamKey, MeetingMemberEntry } from "@/db/schema";
import { C, Field, Avatar, emptyEntry, mondayOf, ymd, md, DOW, type BoardContext } from "./shared";
import RevenueSection from "./RevenueSection";
import SalesSection from "./SalesSection";
import OpsSection from "./OpsSection";
import ScheduleSection from "./ScheduleSection";
import TeamCalendar from "./TeamCalendar";
import AdminSection from "./AdminSection";

export interface BoardNote {
  id: string; year: number; month: number; week: number | null; team: string;
  meetingDate: string | null;
  content: string;
  members?: MeetingMembers | null;
  teamNotes?: MeetingTeamNotes | null;
  attendees?: string[] | null;
  authorName: string | null;
}

interface UserRow { name: string; team: string | null; position: string | null; status: string }

/** 이 화면의 회의록은 회사 전체 한 장이다 — 예전 팀별 회의록과 섞이지 않게 팀 값을 고정한다 */
const TEAM = "전체";

const STEPS: { id: string; no: number; label: string; group?: string }[] = [
  { id: "s-revenue",   no: 1, label: "전체 매출" },
  { id: "s-sales",     no: 2, label: "영업팀",     group: "영업" },
  { id: "s-ops",       no: 3, label: "영업관리팀" },
  { id: "s-schedule",  no: 4, label: "프로젝트 일정" },
  { id: "s-marketing", no: 5, label: "마케팅팀",   group: "회사 내부" },
  { id: "s-dev",       no: 6, label: "개발팀" },
  { id: "s-admin",     no: 7, label: "관리팀" },
  { id: "s-decision",  no: 8, label: "결정사항" },
];

// ─── 주차 · 날짜 ──────────────────────────────────────────────

/** 달력에 표시되는 주(행) 수 — 일요일 시작, 달마다 4~6주. 저장된 week 값이 이 규칙을 따른다 */
function weekRowsOf(y: number, m: number) {
  const firstDay = new Date(y, m - 1, 1).getDay();
  const days     = new Date(y, m, 0).getDate();
  return Math.max(1, Math.ceil((firstDay + days) / 7));
}

/** 회의일을 적지 않았을 때의 날 — 주간은 그 줄의 월요일(다른 달이면 이번 달 안쪽 끝), 월간은 1일 */
function defaultMeetingDay(y: number, m: number, w: number | null) {
  if (w === null) return 1;
  const firstDay = new Date(y, m - 1, 1).getDay();
  const days     = new Date(y, m, 0).getDate();
  const startCol = w === 1 ? firstDay : 0;
  const endCol   = Math.min(6, days - ((w - 1) * 7 - firstDay + 1));
  const col      = Math.min(Math.max(1, startCol), endCol);
  return (w - 1) * 7 + col - firstDay + 1;
}

const defaultDate = (y: number, m: number, w: number | null) => ymd(new Date(y, m - 1, defaultMeetingDay(y, m, w)));

/** 오늘이 이 달에 있으면 오늘이 속한 주차, 아니면 월간회의 */
function initialWeek(y: number, m: number): number | null {
  const now = new Date();
  if (now.getFullYear() !== y || now.getMonth() + 1 !== m) return null;
  return Math.floor((new Date(y, m - 1, 1).getDay() + now.getDate() - 1) / 7) + 1;
}

function noteHasContent(n?: BoardNote | null) {
  if (!n) return false;
  return !!(n.content.trim()
    || Object.values(normalizeMeetingMembers(n.members)).some(memberHasText)
    || Object.keys(normalizeMeetingTeamNotes(n.teamNotes)).length);
}

/** 직전 회의 — 주간은 앞 주차로 내려가며 내용 있는 회의를 찾고, 1주차·월간은 전월에서 찾는다 */
function findPrevNote(notes: BoardNote[], prevNotes: BoardNote[], y: number, m: number, w: number | null) {
  const mine = (n: BoardNote) => n.team === TEAM && noteHasContent(n);
  if (w === null) return prevNotes.find(n => mine(n) && n.week === null);
  for (let i = w - 1; i >= 1; i--) {
    const hit = notes.find(n => mine(n) && n.week === i);
    if (hit) return hit;
  }
  const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
  for (let i = weekRowsOf(py, pm); i >= 1; i--) {
    const hit = prevNotes.find(n => mine(n) && n.week === i);
    if (hit) return hit;
  }
  return undefined;
}

/** 저장된 값과 화면 값을 같은 모양으로 맞춰 비교한다 */
function snapshot(d: { content: string; author: string; date: string; members: MeetingMembers; teamNotes: MeetingTeamNotes; attendees: string[] }) {
  return JSON.stringify({
    content: d.content, author: d.author, date: d.date,
    members: normalizeMeetingMembers(d.members), teamNotes: normalizeMeetingTeamNotes(d.teamNotes),
    attendees: [...normalizeAttendees(d.attendees)].sort(),
  });
}

// ─── 메인 ─────────────────────────────────────────────────────

export default function MeetingBoard({ year, month, onMonthChange, criteria, criteriaLabel }: {
  year: number; month: number; onMonthChange: (y: number, m: number) => void;
  criteria: string; criteriaLabel: string;
}) {
  const me = useUser();
  const [notes, setNotes] = useState<BoardNote[]>([]);
  const [prevNotes, setPrevNotes] = useState<BoardNote[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(() => initialWeek(year, month));
  const [users, setUsers] = useState<UserRow[]>([]);

  const [content, setContent] = useState("");
  const [author, setAuthor] = useState("");
  const [date, setDate] = useState("");
  const [members, setMembers] = useState<MeetingMembers>({});
  const [teamNotes, setTeamNotes] = useState<MeetingTeamNotes>({});
  const [attendees, setAttendees] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [badges, setBadges] = useState<Record<string, string>>({});
  const [activeStep, setActiveStep] = useState("s-revenue");

  const weekRows = weekRowsOf(year, month);
  const week = selected === null ? null : Math.min(selected, weekRows);

  const reload = useCallback(() => {
    fetchJson<{ notes: BoardNote[]; prevNotes: BoardNote[] }>(`/api/report-meetings?year=${year}&month=${month}`)
      .then(d => { setNotes(d.notes ?? []); setPrevNotes(d.prevNotes ?? []); setLoadError(null); })
      .catch(e => setLoadError(e instanceof Error ? e.message : "회의록을 불러오지 못했습니다."));
  }, [year, month]);
  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    fetchJson<{ users: UserRow[] }>("/api/users")
      .then(d => setUsers((d.users ?? []).filter(u => u.status === "활성")))
      .catch(() => setUsers([]));
  }, []);

  const current = useMemo(
    () => notes.find(n => n.team === TEAM && (week === null ? n.week === null : n.week === week)),
    [notes, week],
  );
  const prev = useMemo(() => findPrevNote(notes, prevNotes, year, month, week), [notes, prevNotes, year, month, week]);
  const prevMembers = useMemo(() => normalizeMeetingMembers(prev?.members), [prev]);
  const prevTeams = useMemo(() => normalizeMeetingTeamNotes(prev?.teamNotes), [prev]);

  const activeNames = useMemo(() => users.map(u => u.name), [users]);
  const savedDate = current?.meetingDate ?? defaultDate(year, month, week);
  // 새 회의록의 참석자는 활성 멤버 전원으로 시작한다 — 빠진 사람만 끄면 된다
  const savedAttendees = useMemo(() => current ? normalizeAttendees(current.attendees) : activeNames, [current, activeNames]);

  // ── 회의를 바꾸면 화면 값을 저장된 값으로 다시 채운다 ──
  const loadKey = `${year}-${month}|${week ?? "M"}|${current?.id ?? "new"}`;
  const loadedRef = useRef("");
  useEffect(() => {
    if (loadedRef.current === loadKey) return;
    loadedRef.current = loadKey;
    setContent(current?.content ?? "");
    setAuthor(current?.authorName ?? me.name);
    setDate(savedDate);
    setMembers(normalizeMeetingMembers(current?.members));
    setTeamNotes(normalizeMeetingTeamNotes(current?.teamNotes));
    setError(null);
    setSaved(false);
  }, [loadKey, current, savedDate, me.name]);

  // 참석자는 멤버 목록이 늦게 와도 채워지도록 따로 맞춘다
  const attendeeKey = `${loadKey}|${savedAttendees.join(",")}`;
  const attendeeRef = useRef("");
  useEffect(() => {
    if (attendeeRef.current === attendeeKey) return;
    attendeeRef.current = attendeeKey;
    setAttendees(savedAttendees);
  }, [attendeeKey, savedAttendees]);

  const dirty = useMemo(() =>
    snapshot({ content, author, date, members, teamNotes, attendees }) !==
    snapshot({
      content: current?.content ?? "", author: current?.authorName ?? me.name, date: savedDate,
      members: normalizeMeetingMembers(current?.members), teamNotes: normalizeMeetingTeamNotes(current?.teamNotes),
      attendees: savedAttendees,
    }),
  [content, author, date, members, teamNotes, attendees, current, savedDate, savedAttendees, me.name]);

  // 저장 안 하고 창을 닫으면 브라우저가 한 번 묻게 한다
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  function switchTo(next: () => void) {
    if (dirty && !confirm("저장하지 않은 내용이 있습니다. 이동하면 사라집니다. 계속할까요?")) return;
    next();
  }

  // ── 섹션이 알려 주는 한 줄 요약 → 왼쪽 목차 ──
  const badgeSetters = useMemo(() => Object.fromEntries(STEPS.map(s => [
    s.id, (text: string) => setBadges(b => (b[s.id] === text ? b : { ...b, [s.id]: text })),
  ])) as Record<string, (t: string) => void>, []);

  // 지금 읽고 있는 섹션을 목차에 표시한다
  useEffect(() => {
    const els = STEPS.map(s => document.getElementById(s.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(entries => {
      const hit = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (hit) setActiveStep(hit.target.id);
    }, { rootMargin: "-10% 0px -70% 0px" });
    els.forEach(e => io.observe(e));
    return () => io.disconnect();
  }, [loadKey]);

  // ── 회의 맥락 — 회의일이 그 달 밖이면 월 경계로 맞춘다 ──
  const ctx: BoardContext = useMemo(() => {
    const from = ymd(new Date(year, month - 1, 1)), to = ymd(new Date(year, month, 0));
    const raw = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : savedDate;
    const asOf = raw < from ? from : raw > to ? to : raw;
    return { year, month, week, asOf, weekStart: mondayOf(asOf), criteria, userName: me.name };
  }, [year, month, week, date, savedDate, criteria, me.name]);

  const setTeam = (key: MeetingTeamKey) => (e: MeetingMemberEntry) => setTeamNotes(t => ({ ...t, [key]: e }));
  const teamEntry = (key: MeetingTeamKey) => teamNotes[key] ?? emptyEntry();

  // ── 저장 / 삭제 / 복사 ──
  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/report-meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        year, month, week, team: TEAM, content, authorName: author || null, meetingDate: date || null,
        members, teamNotes, attendees,
      }),
    });
    if (!res.ok) {
      setError(await saveErrorMessage(res));
      setSaving(false);
      return;
    }
    const data = await res.json();
    if (data?.note) {
      // 새 회의록이면 id가 붙어 loadKey가 바뀐다 — 화면 값을 다시 덮지 않도록 ref를 함께 옮긴다
      const key = `${year}-${month}|${week ?? "M"}|${data.note.id}`;
      loadedRef.current = key;
      attendeeRef.current = `${key}|${normalizeAttendees(data.note.attendees).join(",")}`;
      setNotes(p => {
        const i = p.findIndex(n => n.id === data.note.id);
        if (i < 0) return [...p, data.note];
        const next = [...p]; next[i] = data.note; return next;
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!current) return;
    if (!confirm(`${label(month, week)} 기록을 삭제할까요?`)) return;
    const res = await fetch(`/api/report-meetings/${current.id}`, { method: "DELETE" });
    if (!res.ok) { setError("삭제에 실패했습니다."); return; }
    const id = current.id;
    loadedRef.current = "";
    setNotes(p => p.filter(n => n.id !== id));
  }

  async function handleCopy() {
    const text = buildCopyText({ month, week, date, author, attendees, members, teamNotes, content });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.");
    }
  }

  const moveMonth = (d: number) => switchTo(() => {
    const t = new Date(year, month - 1 + d, 1);
    const y = t.getFullYear(), m = t.getMonth() + 1;
    onMonthChange(y, m);
    setSelected(initialWeek(y, m));
  });

  const meetings: { week: number | null; title: string; sub: string }[] = [
    ...Array.from({ length: weekRows }, (_, i) => ({ week: i + 1, title: `${i + 1}주차 주간회의`, sub: md(defaultDate(year, month, i + 1)) })),
    { week: null, title: "월간회의", sub: `${month}월 전체` },
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-[232px_minmax(0,1fr)] items-start" style={{ wordBreak: "keep-all" }}>
      {/* ── 왼쪽 목차 ── */}
      <aside className="lg:sticky lg:top-4 rounded-2xl bg-white p-3 space-y-3" style={{ border: `1px solid ${C.line}` }}>
        <div className="flex items-center justify-between px-1">
          <button type="button" onClick={() => moveMonth(-1)} aria-label="이전 달"
            className="w-7 h-7 rounded-md hover:bg-[#F2F4F6]" style={{ color: C.muted }}>‹</button>
          <p className="text-[15px] font-semibold" style={{ color: C.ink }}>{year}년 {month}월</p>
          <button type="button" onClick={() => moveMonth(1)} aria-label="다음 달"
            className="w-7 h-7 rounded-md hover:bg-[#F2F4F6]" style={{ color: C.muted }}>›</button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-1 gap-1">
          {meetings.map(m => {
            const on = m.week === week;
            const n = notes.find(x => x.team === TEAM && x.week === m.week);
            return (
              <button key={m.week ?? "M"} type="button" onClick={() => !on && switchTo(() => setSelected(m.week))}
                className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[#F7F8FA]"
                style={on ? { background: C.accentSoft } : undefined} aria-current={on ? "true" : undefined}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: noteHasContent(n) ? C.good : C.line }} />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold" style={{ color: on ? C.accent : C.ink }}>{m.title}</span>
                  <span className="block text-[11px]" style={{ color: C.faint }}>{m.sub}</span>
                </span>
              </button>
            );
          })}
        </div>

        <nav className="hidden lg:block pt-2" style={{ borderTop: `1px solid ${C.lineSoft}` }} aria-label="회의 순서">
          <p className="text-[11px] font-medium px-2 pb-1" style={{ color: C.faint }}>회의 순서</p>
          {STEPS.map(s => (
            <div key={s.id}>
              {s.group && <p className="text-[11px] font-medium px-2 pt-2 pb-0.5" style={{ color: C.faint }}>{s.group}</p>}
              <a href={`#${s.id}`}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-[#F7F8FA]"
                style={activeStep === s.id ? { background: C.soft, color: C.ink } : { color: C.body }}>
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-semibold shrink-0"
                  style={activeStep === s.id ? { background: C.ink, color: "#fff" } : { background: C.soft, color: C.muted }}>{s.no}</span>
                <span className="font-medium">{s.label}</span>
                {badges[s.id] && <span className="ml-auto text-[11px] tabular-nums" style={{ color: C.faint }}>{badges[s.id]}</span>}
              </a>
            </div>
          ))}
        </nav>

        <div className="grid grid-cols-2 gap-1.5 pt-2" style={{ borderTop: `1px solid ${C.lineSoft}` }}>
          <button type="button" onClick={handleSave} disabled={saving || !dirty}
            className="col-span-2 h-9 rounded-lg text-[13px] font-semibold text-white transition-opacity disabled:opacity-40"
            style={{ background: C.accent }}>
            {saving ? "저장 중…" : saved ? "저장됨" : dirty ? "저장" : "저장된 상태"}
          </button>
          <button type="button" onClick={handleCopy}
            className="h-8 rounded-lg text-[12px] font-medium hover:bg-[#F2F4F6]" style={{ border: `1px solid ${C.line}`, color: C.body }}>
            {copied ? "복사됨" : "텍스트 복사"}
          </button>
          <button type="button" onClick={handleDelete} disabled={!current}
            className="h-8 rounded-lg text-[12px] font-medium hover:bg-[#FFF5F5] disabled:opacity-40" style={{ border: `1px solid ${C.line}`, color: C.bad }}>
            삭제
          </button>
        </div>
        {error && <p className="text-[12px] px-1" style={{ color: C.bad }}>{error}</p>}
      </aside>

      {/* ── 본문 ── */}
      <div className="space-y-5 min-w-0">
        {loadError && (
          <p className="rounded-xl px-4 py-3 text-[13px]" style={{ background: C.badSoft, color: C.bad }}>
            회의록을 불러오지 못했습니다 — {loadError}
          </p>
        )}

        <div className="rounded-2xl bg-white p-5" style={{ border: `1px solid ${C.line}` }}>
          <div className="flex items-end gap-4 flex-wrap">
            <div>
              <p className="text-[12px]" style={{ color: C.faint }}>{criteriaLabel} · 직전 회의 {prev ? label(prev.month, prev.week) : "없음"}</p>
              <h2 className="text-[20px] font-bold mt-0.5" style={{ color: C.ink }}>{label(month, week)}</h2>
            </div>
            <label className="text-[12px] ml-auto" style={{ color: C.muted }}>
              회의일
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="block mt-1 h-8 px-2 text-[13px] rounded-md border outline-none focus:border-[#3182F6]"
                style={{ borderColor: C.line, color: C.ink }} />
              {date && <span className="sr-only">{DOW[new Date(`${date}T00:00:00`).getDay()]}요일</span>}
            </label>
            <label className="text-[12px]" style={{ color: C.muted }}>
              작성자
              <input value={author} onChange={e => setAuthor(e.target.value)}
                className="block mt-1 h-8 w-28 px-2 text-[13px] rounded-md border outline-none focus:border-[#3182F6]"
                style={{ borderColor: C.line, color: C.ink }} />
            </label>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap mt-4 text-[12px]" style={{ color: C.muted }}>
            참석
            {users.map(u => {
              const on = attendees.includes(u.name);
              return (
                <button key={u.name} type="button" aria-pressed={on}
                  onClick={() => setAttendees(a => on ? a.filter(x => x !== u.name) : [...a, u.name])}
                  className="inline-flex items-center gap-1.5 rounded-full pl-0.5 pr-2.5 py-0.5 text-[13px] transition-opacity"
                  style={{ border: `1px solid ${C.line}`, color: C.body, opacity: on ? 1 : 0.4 }}
                  title={`${u.team ?? ""} ${u.position ?? ""}`.trim()}>
                  <Avatar name={u.name} size={20} />{u.name}
                </button>
              );
            })}
          </div>
        </div>

        <RevenueSection ctx={ctx} onBadge={badgeSetters["s-revenue"]} />
        <SalesSection ctx={ctx} members={members} onMembers={setMembers} prevMembers={prevMembers}
          onBadge={badgeSetters["s-sales"]} />
        <OpsSection ctx={ctx} notes={teamEntry("ops")} onNotes={setTeam("ops")} prevTodo={prevTeams.ops?.todo}
          onBadge={badgeSetters["s-ops"]} />
        <ScheduleSection ctx={ctx} onBadge={badgeSetters["s-schedule"]} />

        <div className="flex items-baseline gap-3 flex-wrap px-1 pt-4" style={{ borderTop: `2px solid ${C.ink}` }}>
          <p className="text-[19px] font-bold" style={{ color: C.ink }}>회사 내부</p>
          <p className="text-[13px]" style={{ color: C.muted }}>업체가 아니라 회사를 키우고 굴리는 일</p>
        </div>

        <TeamCalendar ctx={ctx} team="marketing" id="s-marketing" no={5} title="마케팅팀"
          hint="기간별 할 일 카드 · 종료일 지나도 안 끝난 일은 빨간색"
          notes={teamEntry("marketing")} onNotes={setTeam("marketing")}
          labels={{ issue: { label: "이슈 · 요청" }, todo: { label: "이번 달 마케팅 방향" } }}
          onBadge={badgeSetters["s-marketing"]} />
        <TeamCalendar ctx={ctx} team="dev" id="s-dev" no={6} title="개발팀" ownerTeam="개발팀"
          hint="기간별 할 일 카드 · 종료일 지나도 안 끝난 일은 빨간색"
          notes={teamEntry("dev")} onNotes={setTeam("dev")}
          labels={{ issue: { label: "이슈 · 요청" }, todo: { label: "요청 받은 기능 · 우선순위" } }}
          onBadge={badgeSetters["s-dev"]} />
        <AdminSection ctx={ctx} notes={teamEntry("admin")} onNotes={setTeam("admin")} prevTodo={prevTeams.admin?.todo}
          onBadge={badgeSetters["s-admin"]} />

        <section id="s-decision" aria-labelledby="s-decision-h" className="rounded-2xl bg-white p-5 md:p-6 scroll-mt-4"
          style={{ border: `1px solid ${C.line}` }}>
          <div className="flex items-center gap-2.5 mb-4">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[12px] font-semibold text-white"
              style={{ background: C.ink }}>8</span>
            <h2 id="s-decision-h" className="text-[18px] font-bold" style={{ color: C.ink }}>결정사항 · 기타</h2>
          </div>
          <Field label="결정사항 · 기타 논의" value={content} onChange={setContent} rows={8}
            placeholder={"예) 11월 목표 3,000만 원으로 확정\n보장형 순위 밖 2곳은 이번 주 안에 키워드 재점검"} />
        </section>
      </div>
    </div>
  );
}

function label(month: number, week: number | null) {
  return week === null ? `${month}월 월간회의` : `${month}월 ${week}주차 주간회의`;
}

const TEAM_TITLES: Record<MeetingTeamKey, { title: string; labels: Record<keyof MeetingMemberEntry, string> }> = {
  ops:       { title: "영업관리팀", labels: { done: "전주 한 일", todo: "금주 할 일", issue: "영업팀에 요청 · 이슈" } },
  marketing: { title: "마케팅팀",   labels: { done: "한 일", todo: "이번 달 마케팅 방향", issue: "이슈 · 요청" } },
  dev:       { title: "개발팀",     labels: { done: "한 일", todo: "요청 받은 기능 · 우선순위", issue: "이슈 · 요청" } },
  admin:     { title: "관리팀",     labels: { done: "전주 한 일", todo: "금주 할 일", issue: "공지 · 요청" } },
};

/** 메신저·메일에 붙여 넣는 회의록 전문 — 사람이 쓴 칸만 담는다(숫자는 화면에서 본다) */
function buildCopyText(d: {
  month: number; week: number | null; date: string; author: string; attendees: string[];
  members: MeetingMembers; teamNotes: MeetingTeamNotes; content: string;
}) {
  const out: string[] = [`[${label(d.month, d.week)}] ${d.date}${d.author ? ` · 작성 ${d.author}` : ""}`];
  if (d.attendees.length) out.push(`참석: ${d.attendees.join(", ")}`);
  const block = (title: string, e: MeetingMemberEntry, names: Record<keyof MeetingMemberEntry, string>) => {
    if (!memberHasText(e)) return;
    out.push("", `■ ${title}`);
    for (const k of ["done", "todo", "issue"] as const) {
      if (e[k].trim()) out.push(`- ${names[k]}`, ...e[k].trim().split("\n").map(l => `  ${l}`));
    }
  };
  const sales = normalizeMeetingMembers(d.members);
  for (const [name, e] of Object.entries(sales)) block(`영업팀 · ${name}`, e, { done: "전주 한 일", todo: "금주 할 일", issue: "이슈 · 지원 요청" });
  const teams = normalizeMeetingTeamNotes(d.teamNotes);
  for (const key of Object.keys(TEAM_TITLES) as MeetingTeamKey[]) {
    const e = teams[key];
    if (e) block(TEAM_TITLES[key].title, e, TEAM_TITLES[key].labels);
  }
  if (d.content.trim()) out.push("", "■ 결정사항 · 기타", d.content.trim());
  return out.join("\n");
}
