"use client";

/**
 * 회의록 마케팅팀·개발팀 — 기간 카드 캘린더 (노션 캘린더처럼 달력 위에서 바로 다룬다).
 *
 * 할 일 하나 = 카드 하나. 시작일~종료일에 걸쳐 가로 막대로 놓인다.
 *   - 빈 칸을 누르거나 끌면 그 기간에 새 카드 입력칸이 생긴다
 *   - 카드를 끌면 옮겨지고, 카드 양 끝을 끌면 시작·종료일이 늘어나거나 줄어든다
 *   - 카드를 누르면 그 자리에서 제목·담당·기간·완료를 고친다
 *   종료일이 지났는데 완료 안 된 카드는 빨간색.
 * 저장은 team_tasks 테이블(/api/team-tasks) — task_date = 시작일, end_date = 종료일(하루짜리면 비움).
 * 회의록 본문(이슈·메모)은 notes로 따로 저장된다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MeetingMemberEntry } from "@/db/schema";
import { fetchJson, saveErrorMessage } from "@/lib/fetch-json";
import {
  C, SectionCard, KpiRow, Empty, EntryFields, Avatar, personColor,
  addDays, mondayOf, md, DOW, daysBetween,
  type BoardContext, type KpiItem, type EntryLabels,
} from "./shared";

interface Task {
  id: string;
  team: string;
  taskDate: string;          // 시작일 YYYY-MM-DD
  endDate: string | null;    // 종료일 — null이면 하루짜리
  title: string;
  assignee: string | null;
  done: boolean;
}

interface Member { name: string; team: string | null; position: string | null; status: string }

const TITLE_MAX = 200;
const WEEK_HEAD = ["월", "화", "수", "목", "금", "토", "일"];
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const DRAFT = "draft";
const isTemp = (id: string) => id.startsWith("tmp-");
const endOf = (t: Pick<Task, "taskDate" | "endDate">) => t.endDate ?? t.taskDate;
const dowOf = (iso: string) => DOW[new Date(`${iso}T00:00:00`).getDay()];
const lastDayOf = (y: number, m: number) => {
  const d = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};
const overlaps = (t: Task, from: string, to: string) => t.taskDate <= to && endOf(t) >= from;
const rangeText = (t: Task) => (t.endDate ? `${md(t.taskDate)} – ${md(t.endDate)}` : md(t.taskDate));
const sorted = (a: string, b: string): [string, string] => (a <= b ? [a, b] : [b, a]);

/** 화면 좌표 아래 날짜 칸 — 카드가 위에 덮여 있어도 찾는다 */
function dayAt(x: number, y: number): string | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const d = (el as HTMLElement).dataset?.date;
    if (d) return d;
  }
  return null;
}

/** 한 주 안에 놓일 카드 조각 — 줄(lane)이 겹치지 않게 위에서부터 채운다 */
interface Seg { task: Task; c0: number; c1: number; lane: number; cutL: boolean; cutR: boolean }

function layoutWeek(tasks: Task[], ws: string): { segs: Seg[]; lanes: number } {
  const we = addDays(ws, 6);
  const list = tasks
    .filter(t => overlaps(t, ws, we))
    .sort((a, b) => a.taskDate.localeCompare(b.taskDate)
      || daysBetween(b.taskDate, endOf(b)) - daysBetween(a.taskDate, endOf(a)));
  const laneEnd: number[] = [];
  const segs: Seg[] = list.map(task => {
    const c0 = Math.max(0, daysBetween(ws, task.taskDate));
    const c1 = Math.min(6, daysBetween(ws, endOf(task)));
    let lane = laneEnd.findIndex(e => e < c0);
    if (lane < 0) { lane = laneEnd.length; laneEnd.push(c1); } else laneEnd[lane] = c1;
    return { task, c0, c1, lane, cutL: task.taskDate < ws, cutR: endOf(task) > we };
  });
  return { segs, lanes: laneEnd.length };
}

/** 카드 끌기 — move: 통째로 옮김, start/end: 한쪽 끝만 늘리고 줄임 */
interface Drag { id: string; mode: "move" | "start" | "end"; from: string; to: string }

function applyDrag(t: Task, d: Drag): Task {
  const delta = daysBetween(d.from, d.to);
  if (!delta) return t;
  let s = t.taskDate, e = endOf(t);
  if (d.mode === "move") { s = addDays(s, delta); e = addDays(e, delta); }
  else if (d.mode === "start") s = addDays(s, delta) > e ? e : addDays(s, delta);
  else e = addDays(e, delta) < s ? s : addDays(e, delta);
  return { ...t, taskDate: s, endDate: e === s ? null : e };
}

export default function TeamCalendar({
  ctx, team, id, no, title, hint, ownerTeam, extraKpi, notes, onNotes, labels, onBadge,
}: {
  ctx: BoardContext;
  team: "marketing" | "dev";
  id: string;
  no: number;
  title: string;
  hint?: string;
  /** users.team 값 — 이 팀 사람을 머리에 담당자로 보여준다 (예: "개발팀") */
  ownerTeam?: string;
  extraKpi?: KpiItem;
  notes: MeetingMemberEntry;
  onNotes: (e: MeetingMemberEntry) => void;
  labels?: EntryLabels;
  onBadge?: (text: string) => void;
}) {
  // ── 보여줄 기간 — 지난주 결과가 보이도록 회의 주 앞 주부터, 그 달 마지막 주까지 (최소 6주) ──
  const mm = String(ctx.month).padStart(2, "0");
  const monthFirst = `${ctx.year}-${mm}-01`;
  const monthLast = lastDayOf(ctx.year, ctx.month);
  const lastWeekStart = addDays(ctx.weekStart, -7);
  const lastWeekEnd = addDays(ctx.weekStart, -1);
  const gridStart = mondayOf(lastWeekStart < monthFirst ? lastWeekStart : monthFirst);
  const weeks = Math.max(6, Math.ceil((daysBetween(gridStart, monthLast) + 1) / 7));
  const gridEnd = addDays(gridStart, weeks * 7 - 1);
  const weekEnd = addDays(ctx.weekStart, 6);
  const today = ctx.asOf;

  const weekStarts = Array.from({ length: weeks }, (_, i) => addDays(gridStart, i * 7));

  // ── 할 일 불러오기 ──
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError(null);
    fetchJson<{ tasks?: Task[] }>(`/api/team-tasks?team=${team}&from=${gridStart}&to=${gridEnd}`)
      .then(d => { if (alive) setTasks((d.tasks ?? []).map(t => ({ ...t, endDate: t.endDate ?? null }))); })
      .catch(e => { if (alive) { setTasks([]); setLoadError(e instanceof Error ? e.message : String(e)); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [team, gridStart, gridEnd, reloadKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── 담당자 후보 — 활성 사용자. 실패해도 지금 쓰는 사람은 고를 수 있게 둔다 ──
  const [members, setMembers] = useState<Member[]>([]);
  useEffect(() => {
    let alive = true;
    fetchJson<{ users?: Member[] }>("/api/users")
      .then(d => { if (alive) setMembers((d.users ?? []).filter(u => u.status === "활성")); })
      .catch(() => { /* 담당 목록이 없어도 할 일은 적을 수 있다 */ });
    return () => { alive = false; };
  }, []);

  const owners = useMemo(() => (ownerTeam ? members.filter(m => m.team === ownerTeam) : []), [members, ownerTeam]);
  const assigneeOptions = useMemo(() => {
    const names = [...owners.map(m => m.name), ...members.filter(m => !owners.includes(m)).map(m => m.name)];
    if (ctx.userName && !names.includes(ctx.userName)) names.push(ctx.userName);
    return [...new Set(names)];
  }, [owners, members, ctx.userName]);
  // 새 카드 담당 기본값 — 팀 담당자 → 지금 쓰는 사람
  const defaultWho = owners[0]?.name || ctx.userName || assigneeOptions[0] || "";

  const [msg, setMsg] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);              // 삭제 한 번 더 누르면 지워지는 할 일

  // ── 새 카드 입력칸 (달력 위) ──
  const [draft, setDraft] = useState<{ start: string; end: string; text: string; who: string } | null>(null);

  // ── 카드 바로 고치기 (달력 위 작은 창) ──
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", who: "", start: "", end: "" });
  const editorRef = useRef<HTMLDivElement | null>(null);
  const draftRef = useRef<HTMLDivElement | null>(null);
  const touchRef = useRef(false);   // 마지막 누름이 터치였나 — 터치는 끌기 없이 '눌러서 열기'만

  const openEditor = (t: Task) => {
    if (isTemp(t.id)) return;
    setDraft(null);
    setOpenId(t.id);
    setForm({ title: t.title, who: t.assignee ?? "", start: t.taskDate, end: endOf(t) });
    setMsg(null);
  };
  const closeEditor = () => { setOpenId(null); setArmed(null); };

  const newDraft = (a: string, b: string) => {
    const [s, e] = sorted(a, b);
    setOpenId(null);
    setDraft({ start: s, end: e, text: "", who: defaultWho });
  };

  const add = async (d: NonNullable<typeof draft>) => {
    const t = d.text.trim();
    if (!t) { setDraft(null); return; }
    if (t.length > TITLE_MAX) { setMsg(`할 일은 ${TITLE_MAX}자 이내로 입력해주세요.`); return; }
    const tmp: Task = {
      id: `tmp-${Date.now()}`, team, taskDate: d.start, endDate: d.end === d.start ? null : d.end,
      title: t, assignee: d.who || null, done: false,
    };
    setTasks(p => [...p, tmp]);
    setDraft(null);
    setMsg(null);
    try {
      const res = await fetch("/api/team-tasks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team, taskDate: tmp.taskDate, endDate: tmp.endDate, title: t, assignee: tmp.assignee, createdBy: ctx.userName || null }),
      });
      if (!res.ok) throw new Error(await saveErrorMessage(res, "할 일을 추가하지 못했습니다."));
      const { task } = (await res.json()) as { task: Task };
      setTasks(p => p.map(x => (x.id === tmp.id ? { ...task, endDate: task.endDate ?? null } : x)));
    } catch (e) {
      setTasks(p => p.filter(x => x.id !== tmp.id));
      setDraft(cur => cur ?? d);
      setMsg(e instanceof Error ? e.message : "할 일을 추가하지 못했습니다.");
    }
  };

  type Change = Partial<Pick<Task, "title" | "done" | "taskDate" | "endDate" | "assignee">>;
  /** 바꾼 칸만 보내고, 실패하면 이전 값으로 되돌린다 */
  const patch = useCallback(async (task: Task, change: Change, fail: string) => {
    if (isTemp(task.id)) return;
    const diff = Object.fromEntries(
      Object.entries(change).filter(([k, v]) => task[k as keyof Task] !== v),
    ) as Change;
    if (!Object.keys(diff).length) return;
    setTasks(p => p.map(x => (x.id === task.id ? { ...x, ...diff } : x)));
    setMsg(null);
    try {
      const res = await fetch(`/api/team-tasks/${task.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(diff),
      });
      if (!res.ok) throw new Error(await saveErrorMessage(res, fail));
    } catch (e) {
      const back = Object.fromEntries(Object.keys(diff).map(k => [k, task[k as keyof Task]])) as Partial<Task>;
      setTasks(p => p.map(x => (x.id === task.id ? { ...x, ...back } : x)));
      setMsg(e instanceof Error ? e.message : fail);
    }
  }, []);

  const toggle = (task: Task) => patch(task, { done: !task.done }, "완료 표시를 저장하지 못했습니다.");

  const saveEditor = () => {
    const task = tasks.find(x => x.id === openId);
    if (!task) { closeEditor(); return; }
    const t = form.title.trim();
    if (!t) { setMsg("할 일 내용을 입력해주세요."); return; }
    if (t.length > TITLE_MAX) { setMsg(`할 일은 ${TITLE_MAX}자 이내로 입력해주세요.`); return; }
    if (!ISO_RE.test(form.start)) { setMsg("시작일을 골라주세요."); return; }
    const end = ISO_RE.test(form.end) && form.end >= form.start ? form.end : form.start;
    closeEditor();
    patch(task, { title: t, assignee: form.who || null, taskDate: form.start, endDate: end === form.start ? null : end },
      "할 일을 고치지 못했습니다.");
  };

  const remove = async (task: Task) => {
    if (isTemp(task.id)) return;
    if (armed !== task.id) { setArmed(task.id); return; }
    setArmed(null);
    setOpenId(null);
    setTasks(p => p.filter(x => x.id !== task.id));
    setMsg(null);
    try {
      const res = await fetch(`/api/team-tasks/${task.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await saveErrorMessage(res, "할 일을 지우지 못했습니다."));
    } catch (e) {
      setTasks(p => (p.some(x => x.id === task.id) ? p : [...p, task]));
      setMsg(e instanceof Error ? e.message : "할 일을 지우지 못했습니다.");
    }
  };

  // 삭제 대기는 잠시 뒤 풀린다 — 실수로 한 번 누른 것이 남아 있지 않게
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  // 고치기 창 밖을 누르거나 Esc — 닫는다 (저장은 '저장' 또는 Enter)
  useEffect(() => {
    if (!openId && !draft) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpenId(null); setDraft(null); } };
    const down = (e: PointerEvent) => {
      const target = e.target as Node;
      if (openId && editorRef.current && !editorRef.current.contains(target)) setOpenId(null);
      if (draft && draftRef.current && !draftRef.current.contains(target)) {
        if (draft.text.trim()) add(draft); else setDraft(null);
      }
    };
    window.addEventListener("keydown", key);
    window.addEventListener("pointerdown", down, true);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("pointerdown", down, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, draft]);

  // ── 마우스 끌기: 빈 칸 → 새 기간 고르기 / 카드 → 옮기기·늘리기 ──
  const [sel, setSel] = useState<{ a: string; b: string } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const live = useRef({ sel, drag, tasks });
  useEffect(() => { live.current = { sel, drag, tasks }; });
  const active = !!sel || !!drag;

  useEffect(() => {
    if (!active) return;
    const move = (e: PointerEvent) => {
      const d = dayAt(e.clientX, e.clientY);
      if (!d) return;
      const { sel: s, drag: g } = live.current;
      if (s && s.b !== d) setSel({ ...s, b: d });
      if (g && g.to !== d) setDrag({ ...g, to: d });
    };
    const up = () => {
      const { sel: s, drag: g, tasks: ts } = live.current;
      setSel(null);
      setDrag(null);
      if (s) newDraft(s.a, s.b);
      if (g) {
        const task = ts.find(x => x.id === g.id);
        if (!task) return;
        if (g.from === g.to) { if (g.mode === "move") openEditor(task); return; }
        const next = applyDrag(task, g);
        patch(task, { taskDate: next.taskDate, endDate: next.endDate }, "날짜를 옮기지 못했습니다.");
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const inSel = (d: string) => {
    if (!sel) return false;
    const [s, e] = sorted(sel.a, sel.b);
    return d >= s && d <= e;
  };

  // 끄는 동안은 옮겨진 자리로 미리 보여준다
  const shown = useMemo(() => {
    const list = drag ? tasks.map(t => (t.id === drag.id ? applyDrag(t, drag) : t)) : tasks;
    if (!draft) return list;
    const ghost: Task = { id: DRAFT, team, taskDate: draft.start, endDate: draft.end === draft.start ? null : draft.end, title: "", assignee: null, done: false };
    return [...list, ghost];
  }, [tasks, drag, draft, team]);

  // ── 숫자 ──
  const thisW = tasks.filter(t => overlaps(t, ctx.weekStart, weekEnd));
  const lastDue = tasks.filter(t => endOf(t) >= lastWeekStart && endOf(t) <= lastWeekEnd);   // 지난주가 마감이던 일
  const lastMissed = lastDue.filter(t => !t.done).length;
  const late = tasks.filter(t => !t.done && endOf(t) < today).length;
  const monthTasks = tasks.filter(t => overlaps(t, monthFirst, monthLast));

  const badge = loadError ? "" : loading ? "" : `이번 주 ${thisW.length}건`;
  const badgeRef = useRef(onBadge);
  useEffect(() => { badgeRef.current = onBadge; });
  useEffect(() => { if (badge) badgeRef.current?.(badge); }, [badge]);

  const kpis: KpiItem[] = [
    { label: "이번 주 할 일", value: `${thisW.length}건`, sub: `완료 ${thisW.filter(t => t.done).length} · ${md(ctx.weekStart)} – ${md(weekEnd)}` },
    {
      label: "지난주 마감 완료", value: `${lastDue.length - lastMissed}/${lastDue.length}`,
      sub: `못 한 일 ${lastMissed}건${late > lastMissed ? ` · 밀린 일 전체 ${late}건` : ""}`,
      color: lastMissed > 0 ? C.bad : undefined,
    },
    { label: "이번 달 할 일", value: `${monthTasks.length}건`, sub: `${ctx.month}월 · 완료 ${monthTasks.filter(t => t.done).length}` },
    ...(extraKpi ? [extraKpi] : []),
  ];

  // ── 부품 ──
  const fieldCls = "text-[12px] rounded-md border px-2 py-1 outline-none focus:border-[#3182F6] min-w-0 bg-white";
  const stop = (e: React.PointerEvent) => e.stopPropagation();

  const whoSelect = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={e => onChange(e.target.value)} aria-label="담당"
      className={fieldCls} style={{ borderColor: C.line, color: C.ink }}>
      <option value="">담당 없음</option>
      {assigneeOptions.map(n => <option key={n} value={n}>{n}</option>)}
      {value && !assigneeOptions.includes(value) && <option value={value}>{value}</option>}
    </select>
  );

  /** 카드를 눌렀을 때 그 아래 뜨는 고치기 창 */
  const renderEditor = (t: Task, alignRight: boolean) => (
    <div ref={editorRef} onPointerDown={stop}
      className="absolute top-full mt-1 z-30 w-[280px] max-w-[calc(100vw-48px)] rounded-xl p-3 flex flex-col gap-2 text-left cursor-auto"
      style={{ [alignRight ? "right" : "left"]: 0, background: "#fff", border: `1px solid ${C.line}`, boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}>
      <input autoFocus value={form.title} maxLength={TITLE_MAX} aria-label="할 일 제목"
        onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); saveEditor(); } }}
        className="text-[13px] font-semibold rounded-md border px-2 py-1.5 outline-none focus:border-[#3182F6]"
        style={{ borderColor: C.line, color: C.ink }} />
      <div className="flex items-center gap-1.5">
        <input type="date" value={form.start} aria-label="시작일"
          onChange={e => setForm(f => ({ ...f, start: e.target.value, end: f.end < e.target.value ? e.target.value : f.end }))}
          className={`${fieldCls} flex-1`} style={{ borderColor: C.line, color: C.ink }} />
        <span className="text-[12px]" style={{ color: C.faint }}>~</span>
        <input type="date" value={form.end} min={form.start} aria-label="종료일"
          onChange={e => setForm(f => ({ ...f, end: e.target.value }))}
          className={`${fieldCls} flex-1`} style={{ borderColor: C.line, color: C.ink }} />
      </div>
      <div className="flex items-center gap-2">
        {whoSelect(form.who, v => setForm(f => ({ ...f, who: v })))}
        <label className="flex items-center gap-1.5 text-[12px] cursor-pointer" style={{ color: C.body }}>
          <input type="checkbox" checked={t.done} onChange={() => toggle(t)} className="w-3.5 h-3.5 accent-[#2B8A3E]" />
          완료
        </label>
      </div>
      <div className="flex items-center justify-between gap-2 pt-1">
        <button type="button" onClick={() => remove(t)}
          className="text-[12px] font-medium rounded-md px-2 py-1"
          style={armed === t.id ? { background: C.bad, color: "#fff" } : { color: C.bad }}>
          {armed === t.id ? "한 번 더 누르면 삭제" : "삭제"}
        </button>
        <div className="flex gap-1">
          <button type="button" onClick={closeEditor}
            className="text-[12px] font-medium rounded-md px-2.5 py-1 hover:bg-[#F2F4F6]" style={{ color: C.muted }}>닫기</button>
          <button type="button" onClick={saveEditor} disabled={!form.title.trim()}
            className="text-[12px] font-semibold text-white rounded-md px-3 py-1 disabled:opacity-40"
            style={{ background: C.accent }}>저장</button>
        </div>
      </div>
    </div>
  );

  /** 새 카드 입력칸 — 고른 기간 자리에 바로 뜬다 */
  const renderDraft = (first: boolean) => {
    if (!draft) return null;
    if (!first) return <div className="h-full rounded-md" style={{ background: C.accentSoft, border: `1px dashed ${C.accent}`, minHeight: 34 }} />;
    return (
      <div ref={draftRef} className="rounded-lg p-1.5 flex flex-col gap-1" onPointerDown={stop}
        style={{ background: "#fff", border: `1.5px solid ${C.accent}`, boxShadow: `0 0 0 3px ${C.accentSoft}` }}>
        <input autoFocus value={draft.text} maxLength={TITLE_MAX} placeholder="할 일 제목 입력 후 Enter"
          aria-label="새 할 일 제목"
          onChange={e => setDraft(d => (d ? { ...d, text: e.target.value } : d))}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(draft); } }}
          className="text-[12px] font-semibold px-1 py-0.5 outline-none placeholder:font-normal placeholder:text-[#8B95A1] min-w-0"
          style={{ color: C.ink }} />
        <div className="flex items-center gap-1.5 text-[11px]" style={{ color: C.muted }}>
          {whoSelect(draft.who, v => setDraft(d => (d ? { ...d, who: v } : d)))}
          <span className="tabular-nums">{draft.start === draft.end ? md(draft.start) : `${md(draft.start)} – ${md(draft.end)}`}</span>
        </div>
      </div>
    );
  };

  /** 카드 — 끌면 옮기기, 양 끝 손잡이를 끌면 기간 늘리기·줄이기, 누르면 고치기 */
  const renderCard = (t: Task, opt: { cutL?: boolean; cutR?: boolean; inGrid?: boolean } = {}) => {
    const isLate = !t.done && endOf(t) < today;
    const pending = isTemp(t.id);
    const isOpen = openId === t.id;
    const dragging = drag?.id === t.id;
    const r = 8;
    const grab = (mode: Drag["mode"]) => (e: React.PointerEvent) => {
      touchRef.current = e.pointerType !== "mouse";
      if (e.button !== 0 || pending) return;
      e.stopPropagation();
      if (touchRef.current || !opt.inGrid) return;   // 터치·목록은 onClick으로 연다
      e.preventDefault();
      const d = dayAt(e.clientX, e.clientY);
      if (d) setDrag({ id: t.id, mode, from: d, to: d });
    };
    return (
      <div role="button" tabIndex={pending ? -1 : 0} aria-label={`${t.title} (${rangeText(t)}) 고치기`}
        onPointerDown={grab("move")}
        onClick={() => { if (touchRef.current || !opt.inGrid) openEditor(t); }}
        onKeyDown={e => { if (e.key === "Enter" && e.target === e.currentTarget) openEditor(t); }}
        className={`group/task relative w-full min-w-0 h-full select-none focus-visible:outline-2 focus-visible:outline-[#3182F6] ${opt.inGrid ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
        style={{
          background: isLate ? C.badSoft : "#fff",
          border: `1px solid ${isOpen || dragging ? C.accent : isLate ? "#FFC9C9" : C.line}`,
          boxShadow: dragging ? "0 6px 16px rgba(0,0,0,0.12)" : isOpen ? `0 0 0 2px ${C.accentSoft}` : "0 1px 2px rgba(0,0,0,0.04)",
          borderRadius: `${opt.cutL ? 2 : r}px ${opt.cutR ? 2 : r}px ${opt.cutR ? 2 : r}px ${opt.cutL ? 2 : r}px`,
          opacity: t.done && !dragging ? 0.55 : pending ? 0.7 : 1,
        }}>
        <div className="px-2 pt-1.5 pb-1.5">
          <span className="block text-[12px] font-semibold leading-[1.35]"
            style={{ color: C.ink, textDecoration: t.done ? "line-through" : undefined, wordBreak: "keep-all", overflowWrap: "anywhere" }}>
            {opt.cutL && <span style={{ color: C.faint }}>← </span>}{t.title}{opt.cutR && <span style={{ color: C.faint }}> →</span>}
          </span>
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] mt-1" style={{ color: C.muted }}>
            <label onPointerDown={stop} className="inline-flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={t.done} disabled={pending} onChange={() => toggle(t)}
                className="w-3 h-3 accent-[#2B8A3E]" aria-label={`${t.title} 완료`} />
              완료
            </label>
            {t.assignee && (
              <span className="inline-flex items-center gap-1 rounded px-1.5 py-px"
                style={{ background: `${personColor(t.assignee)}1A`, color: C.body }}>
                <i className="inline-block rounded-full" style={{ width: 6, height: 6, background: personColor(t.assignee) }} />
                {t.assignee}
              </span>
            )}
            {(t.endDate || dragging || !opt.inGrid) && <span className="tabular-nums">{rangeText(t)}</span>}
            {isLate && <span style={{ color: C.bad }}>못 함</span>}
          </span>
        </div>
        {/* 기간 늘리기 손잡이 — 진짜 시작·끝이 있는 조각에만 */}
        {opt.inGrid && !pending && !opt.cutL && (
          <span onPointerDown={grab("start")} title="끌어서 시작일 바꾸기" aria-hidden
            className="absolute left-0 top-0 bottom-0 w-[7px] cursor-ew-resize rounded-l-[inherit] opacity-0 group-hover/task:opacity-100 hover:bg-[#3182F6]/25" />
        )}
        {opt.inGrid && !pending && !opt.cutR && (
          <span onPointerDown={grab("end")} title="끌어서 종료일 바꾸기" aria-hidden
            className="absolute right-0 top-0 bottom-0 w-[7px] cursor-ew-resize rounded-r-[inherit] opacity-0 group-hover/task:opacity-100 hover:bg-[#3182F6]/25" />
        )}
      </div>
    );
  };

  const dayLabel = (d: string, first: boolean) => (first || d.endsWith("-01") ? md(d) : String(Number(d.slice(8))));

  // 좁은 화면 — 시작일 순 목록
  const listTasks = [...tasks].sort((a, b) => a.taskDate.localeCompare(b.taskDate) || endOf(a).localeCompare(endOf(b)));
  const addDay = today >= gridStart && today <= gridEnd ? today : ctx.weekStart;

  return (
    <SectionCard id={id} no={no} title={title} hint={hint}>
      <div style={{ wordBreak: "keep-all" }}>
        {/* 머리 — 담당 + 숫자 */}
        {owners.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
            {owners.map(o => (
              <div key={o.name} className="flex items-center gap-2 min-w-0">
                <Avatar name={o.name} size={30} />
                <p className="text-[14px] font-semibold" style={{ color: C.ink }}>
                  {o.name}
                  <span className="ml-1.5 text-[12px] font-normal" style={{ color: C.muted }}>
                    {[o.team, o.position].filter(Boolean).join(" · ")}
                  </span>
                </p>
              </div>
            ))}
          </div>
        )}
        {!loadError && <KpiRow items={loading ? kpis.map(k => (k === extraKpi ? k : { ...k, value: "…", sub: undefined, color: undefined })) : kpis} />}

        <div className="flex items-center justify-between gap-3 flex-wrap mt-5 mb-2.5">
          <p className="text-[15px] font-semibold" style={{ color: C.ink }}>{ctx.month}월 할 일</p>
          {!loadError && (
            <button type="button" onClick={() => newDraft(addDay, addDay)}
              className="text-[13px] font-semibold rounded-lg px-3 py-1.5 hover:bg-[#EAF2FE]"
              style={{ color: C.accent, border: `1px solid ${C.line}` }}>
              + 할 일 추가
            </button>
          )}
        </div>

        {msg && (
          <p role="alert" className="flex items-start gap-2 text-[13px] rounded-lg px-3 py-2 mb-2.5"
            style={{ color: C.bad, background: C.badSoft }}>
            <span className="min-w-0 flex-1">{msg}</span>
            <button type="button" onClick={() => setMsg(null)} aria-label="안내 닫기" className="shrink-0 leading-none px-1">×</button>
          </p>
        )}

        {loadError ? (
          <div className="rounded-xl px-4 py-5 text-center" style={{ border: `1px solid ${C.line}` }}>
            <p className="text-[13px]" style={{ color: C.bad }}>할 일을 불러오지 못했습니다 — {loadError}</p>
            <button type="button" onClick={() => setReloadKey(k => k + 1)}
              className="mt-2 text-[12px] font-medium rounded-md px-2.5 py-1 hover:bg-[#F2F4F6]" style={{ color: C.accent }}>
              다시 불러오기
            </button>
          </div>
        ) : loading && tasks.length === 0 ? (
          <div className="rounded-xl" style={{ border: `1px solid ${C.line}` }}><Empty>할 일을 불러오는 중…</Empty></div>
        ) : (
          <>
            {/* 넓은 화면 — 월요일 시작 달력, 주마다 카드 줄 */}
            <div aria-label={`${title} ${ctx.month}월 할 일 캘린더`}
              className="hidden min-[761px]:block rounded-[14px]"
              style={{ border: `1px solid ${C.line}`, userSelect: active ? "none" : undefined, cursor: drag ? (drag.mode === "move" ? "grabbing" : "ew-resize") : undefined }}>
              <div className="grid rounded-t-[14px]" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))", background: C.soft, borderBottom: `1px solid ${C.line}` }}>
                {WEEK_HEAD.map((w, i) => (
                  <div key={w} className="text-[12px] font-medium px-2.5 py-2"
                    style={{ color: i > 4 ? C.bad : C.faint, opacity: i > 4 ? 0.7 : 1 }}>
                    {w}
                  </div>
                ))}
              </div>
              {weekStarts.map((ws, wi) => {
                const { segs, lanes } = layoutWeek(shown, ws);
                const lastRow = wi === weekStarts.length - 1;
                return (
                  <div key={ws} className="grid"
                    style={{
                      gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                      gridTemplateRows: `30px repeat(${lanes}, auto) minmax(24px, 1fr)`,
                      minHeight: 116,
                      borderTop: wi ? `1px solid ${C.lineSoft}` : undefined,
                    }}>
                    {Array.from({ length: 7 }, (_, i) => {
                      const d = addDays(ws, i);
                      const out = d < monthFirst || d > monthLast;
                      const wk = d >= ctx.weekStart && d <= weekEnd;
                      const isToday = d === today;
                      return (
                        <div key={d} data-date={d} aria-current={isToday ? "date" : undefined}
                          onPointerDown={e => {
                            touchRef.current = e.pointerType !== "mouse";
                            if (e.button !== 0 || touchRef.current) return;
                            e.preventDefault();
                            setSel({ a: d, b: d });
                          }}
                          onClick={() => { if (touchRef.current) newDraft(d, d); }}
                          title="눌러서 이 날짜에 추가 · 끌어서 기간 고르기"
                          className="cursor-cell"
                          style={{
                            gridColumn: i + 1, gridRow: "1 / -1",
                            borderRight: i < 6 ? `1px solid ${C.lineSoft}` : undefined,
                            background: inSel(d) ? C.accentSoft : out ? C.soft : wk ? "rgba(49,130,246,0.04)" : "#fff",
                            boxShadow: isToday ? `inset 0 0 0 2px ${C.accent}` : undefined,
                            borderBottomLeftRadius: lastRow && i === 0 ? 14 : undefined,
                            borderBottomRightRadius: lastRow && i === 6 ? 14 : undefined,
                          }}>
                          <div className="px-2 pt-1.5">
                            <span className="text-[13px] tabular-nums rounded-full"
                              style={isToday
                                ? { color: "#fff", background: C.accent, padding: "0 7px", fontWeight: 600 }
                                : { color: out ? C.faint : C.body, fontWeight: 500 }}>
                              {dayLabel(d, wi === 0 && i === 0)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    {segs.map(s => {
                      const isDraft = s.task.id === DRAFT;
                      const isOpen = openId === s.task.id;
                      return (
                        <div key={s.task.id} className={`relative min-w-0 ${isOpen || isDraft ? "z-20" : "z-[1]"}`}
                          style={{
                            gridColumn: `${s.c0 + 1} / ${s.c1 + 2}`, gridRow: s.lane + 2,
                            margin: `0 ${s.cutR ? 0 : 5}px 4px ${s.cutL ? 0 : 5}px`,
                            minWidth: isDraft && !s.cutL ? 150 : undefined,
                            pointerEvents: active && drag?.id !== s.task.id ? "none" : undefined,
                          }}>
                          {isDraft
                            ? renderDraft(!s.cutL)
                            : renderCard(s.task, { cutL: s.cutL, cutR: s.cutR, inGrid: true })}
                          {isOpen && !s.cutL && renderEditor(s.task, s.c0 >= 4)}
                          {isOpen && s.cutL && s.task.taskDate < gridStart && ws === gridStart && renderEditor(s.task, s.c0 >= 4)}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* 좁은 화면 — 카드 목록 (시작일 순), 누르면 그 자리에서 고치기 */}
            <div className="min-[761px]:hidden flex flex-col gap-1.5">
              {draft && <div className="relative">{renderDraft(true)}</div>}
              {listTasks.length === 0 && !draft && (
                <div className="rounded-[14px]" style={{ border: `1px solid ${C.line}` }}><Empty>등록된 할 일이 없습니다</Empty></div>
              )}
              {listTasks.map(t => (
                <div key={t.id} className={`relative ${openId === t.id ? "z-20" : ""}`}>
                  <p className="text-[11px] mb-0.5 tabular-nums" style={{ color: C.faint }}>
                    {md(t.taskDate)} ({dowOf(t.taskDate)}){t.endDate ? ` – ${md(t.endDate)} (${dowOf(t.endDate)})` : ""}
                  </p>
                  {renderCard(t)}
                  {openId === t.id && renderEditor(t, false)}
                </div>
              ))}
            </div>
            <p className="text-[12px] mt-2" style={{ color: C.faint }}>
              빈 칸을 누르거나 끌어서 새 카드 · 카드를 끌면 옮기기, 양 끝을 끌면 기간 늘리기 · 카드를 누르면 고치기 · 종료일이 지났는데 완료 안 된 카드는 빨간색
            </p>
          </>
        )}

        {/* 회의 메모 */}
        <div className="mt-5">
          <EntryFields value={notes} onChange={onNotes} labels={labels} keys={["issue", "todo"]} />
        </div>
      </div>
    </SectionCard>
  );
}
