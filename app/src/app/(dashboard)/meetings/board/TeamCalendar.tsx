"use client";

/**
 * 회의록 마케팅팀·개발팀 — 기간 카드 캘린더.
 *
 * 할 일 하나 = 카드 하나. 시작일~종료일에 걸쳐 가로 막대로 놓인다 (노션 캘린더처럼).
 *   달력 칸을 끌어서 기간을 고르거나, 위 입력칸에 시작·종료일을 넣어 등록한다.
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
const isTemp = (id: string) => id.startsWith("tmp-");
const endOf = (t: Task) => t.endDate ?? t.taskDate;
const dowOf = (iso: string) => DOW[new Date(`${iso}T00:00:00`).getDay()];
const lastDayOf = (y: number, m: number) => {
  const d = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};
const overlaps = (t: Task, from: string, to: string) => t.taskDate <= to && endOf(t) >= from;
const rangeText = (t: Task) => (t.endDate ? `${md(t.taskDate)} – ${md(t.endDate)}` : md(t.taskDate));

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

  // ── 등록·고치기 칸 ──
  const firstDay = today >= gridStart && today <= gridEnd ? today : ctx.weekStart;
  const [fStart, setFStart] = useState(firstDay);
  const [fEnd, setFEnd] = useState(firstDay);
  const [fWho, setFWho] = useState("");
  const [fText, setFText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);   // null = 새로 등록
  const textRef = useRef<HTMLInputElement>(null);
  // 고르지 않았으면 팀 담당자 → 지금 쓰는 사람 순으로 기본값
  const who = fWho || owners[0]?.name || ctx.userName || assigneeOptions[0] || "";

  const [msg, setMsg] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);              // 삭제 한 번 더 누르면 지워지는 할 일

  const pickRange = (a: string, b: string) => {
    const [s, e] = a <= b ? [a, b] : [b, a];
    setEditingId(null);
    setFStart(s);
    setFEnd(e);
    textRef.current?.focus();
  };

  const setStart = (v: string) => {
    setFStart(v);
    if (ISO_RE.test(v) && (!ISO_RE.test(fEnd) || fEnd < v)) setFEnd(v);
  };

  const startEdit = (t: Task) => {
    setEditingId(t.id);
    setFStart(t.taskDate);
    setFEnd(endOf(t));
    setFWho(t.assignee ?? "");
    setFText(t.title);
    setMsg(null);
    textRef.current?.focus();
  };

  const resetForm = () => {
    setEditingId(null);
    setFText("");
    setFWho("");
  };

  const add = async (t: string, start: string, end: string) => {
    const tmp: Task = {
      id: `tmp-${Date.now()}`, team, taskDate: start, endDate: end === start ? null : end,
      title: t, assignee: who || null, done: false,
    };
    setTasks(p => [...p, tmp]);
    setFText("");
    try {
      const res = await fetch("/api/team-tasks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team, taskDate: start, endDate: tmp.endDate, title: t, assignee: who || null, createdBy: ctx.userName || null }),
      });
      if (!res.ok) throw new Error(await saveErrorMessage(res, "할 일을 추가하지 못했습니다."));
      const { task } = (await res.json()) as { task: Task };
      setTasks(p => p.map(x => (x.id === tmp.id ? { ...task, endDate: task.endDate ?? null } : x)));
    } catch (e) {
      setTasks(p => p.filter(x => x.id !== tmp.id));
      setFText(cur => cur || t);
      setMsg(e instanceof Error ? e.message : "할 일을 추가하지 못했습니다.");
    }
  };

  type Change = Partial<Pick<Task, "title" | "done" | "taskDate" | "endDate" | "assignee">>;
  /** 바꾼 칸만 보내고, 실패하면 이전 값으로 되돌린다 */
  const patch = useCallback(async (task: Task, change: Change, fail: string) => {
    if (isTemp(task.id)) return;
    setTasks(p => p.map(x => (x.id === task.id ? { ...x, ...change } : x)));
    setMsg(null);
    try {
      const res = await fetch(`/api/team-tasks/${task.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change),
      });
      if (!res.ok) throw new Error(await saveErrorMessage(res, fail));
    } catch (e) {
      const back = Object.fromEntries(Object.keys(change).map(k => [k, task[k as keyof Task]])) as Partial<Task>;
      setTasks(p => p.map(x => (x.id === task.id ? { ...x, ...back } : x)));
      setMsg(e instanceof Error ? e.message : fail);
    }
  }, []);

  const toggle = (task: Task) => patch(task, { done: !task.done }, "완료 표시를 저장하지 못했습니다.");

  const submit = () => {
    const t = fText.trim();
    if (!t) return;
    if (!ISO_RE.test(fStart)) { setMsg("시작일을 골라주세요."); return; }
    const end = ISO_RE.test(fEnd) ? fEnd : fStart;
    if (end < fStart) { setMsg("종료일은 시작일과 같거나 뒤여야 합니다."); return; }
    if (t.length > TITLE_MAX) { setMsg(`할 일은 ${TITLE_MAX}자 이내로 입력해주세요.`); return; }
    setMsg(null);
    if (!editingId) { add(t, fStart, end); return; }

    const task = tasks.find(x => x.id === editingId);
    resetForm();
    if (!task) return;
    const next: Change = { title: t, taskDate: fStart, endDate: end === fStart ? null : end, assignee: who || null };
    const change = Object.fromEntries(
      Object.entries(next).filter(([k, v]) => task[k as keyof Task] !== v),
    ) as Change;
    if (Object.keys(change).length) patch(task, change, "할 일을 고치지 못했습니다.");
  };

  const remove = async (task: Task) => {
    if (isTemp(task.id)) return;
    if (armed !== task.id) { setArmed(task.id); return; }
    setArmed(null);
    if (editingId === task.id) resetForm();
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

  // ── 달력 칸 끌어서 기간 고르기 (마우스) ──
  const [drag, setDrag] = useState<{ a: string; b: string } | null>(null);
  const dragRef = useRef(drag);
  useEffect(() => { dragRef.current = drag; });
  useEffect(() => {
    if (!drag) return;
    const up = () => {
      const d = dragRef.current;
      setDrag(null);
      if (d) pickRange(d.a, d.b);
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null]);
  const inDrag = (d: string) => !!drag && d >= (drag.a < drag.b ? drag.a : drag.b) && d <= (drag.a < drag.b ? drag.b : drag.a);

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

  // ── 카드 ──
  const renderCard = (t: Task, opt: { cutL?: boolean; cutR?: boolean; showRange?: boolean } = {}) => {
    const isLate = !t.done && endOf(t) < today;
    const pending = isTemp(t.id);
    const editing = editingId === t.id;
    const r = 8;
    return (
      <div className="group/task relative w-full min-w-0 h-full transition-colors"
        style={{
          background: isLate ? C.badSoft : "#fff",
          border: `1px solid ${editing ? C.accent : isLate ? "#FFC9C9" : C.line}`,
          boxShadow: editing ? `0 0 0 2px ${C.accentSoft}` : "0 1px 2px rgba(0,0,0,0.04)",
          borderRadius: `${opt.cutL ? 2 : r}px ${opt.cutR ? 2 : r}px ${opt.cutR ? 2 : r}px ${opt.cutL ? 2 : r}px`,
          opacity: t.done ? 0.55 : pending ? 0.7 : 1,
        }}>
        <button type="button" onClick={() => !pending && startEdit(t)} disabled={pending}
          title="눌러서 고치기"
          className="block w-full min-w-0 text-left px-2 pt-1.5 pb-1 pr-10 rounded-[inherit] hover:bg-black/[0.02] focus-visible:outline-2 focus-visible:outline-[#3182F6]">
          <span className="block text-[12px] font-semibold leading-[1.35]"
            style={{ color: C.ink, textDecoration: t.done ? "line-through" : undefined, wordBreak: "keep-all", overflowWrap: "anywhere" }}>
            {opt.cutL && <span style={{ color: C.faint }}>← </span>}{t.title}{opt.cutR && <span style={{ color: C.faint }}> →</span>}
          </span>
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] mt-1" style={{ color: C.muted }}>
            {t.assignee && (
              <span className="inline-flex items-center gap-1 rounded px-1.5 py-px"
                style={{ background: `${personColor(t.assignee)}1A`, color: C.body }}>
                <i className="inline-block rounded-full" style={{ width: 6, height: 6, background: personColor(t.assignee) }} />
                {t.assignee}
              </span>
            )}
            {(opt.showRange ?? !!t.endDate) && <span className="tabular-nums">{rangeText(t)}</span>}
            {isLate && <span style={{ color: C.bad }}>못 함</span>}
          </span>
        </button>
        <label className="flex items-center gap-1.5 px-2 pb-1.5 text-[11px] cursor-pointer w-fit" style={{ color: C.muted }}>
          <input type="checkbox" checked={t.done} disabled={pending} onChange={() => toggle(t)}
            className="w-3 h-3 accent-[#2B8A3E]" aria-label={`${t.title} 완료`} />
          완료
        </label>
        {!pending && (
          <span className={`absolute right-1 top-1 flex items-center transition-opacity ${armed === t.id
            ? "opacity-100" : "opacity-0 group-hover/task:opacity-100 group-focus-within/task:opacity-100 [@media(hover:none)]:opacity-100"}`}>
            <button type="button" onClick={() => remove(t)} aria-label={armed === t.id ? `${t.title} 삭제 확인` : `${t.title} 삭제`}
              title={armed === t.id ? "한 번 더 누르면 삭제" : "삭제"}
              className={`h-[18px] rounded leading-none ${armed === t.id ? "px-1.5 text-[11px] font-semibold text-white" : "w-[18px] text-[13px] hover:bg-[#F2F4F6]"}`}
              style={armed === t.id ? { background: C.bad } : { color: C.muted }}>
              {armed === t.id ? "삭제" : "×"}
            </button>
          </span>
        )}
      </div>
    );
  };

  const dayLabel = (d: string, first: boolean) => (first || d.endsWith("-01") ? md(d) : String(Number(d.slice(8))));

  // 좁은 화면 — 시작일 순 목록 (지난주부터 이 달 끝까지)
  const listTasks = [...tasks].sort((a, b) => a.taskDate.localeCompare(b.taskDate) || endOf(a).localeCompare(endOf(b)));

  const inputCls = "text-[13px] rounded-lg border px-2 py-1.5 outline-none focus:border-[#3182F6] min-w-0";

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

        {/* 등록·고치기 칸 */}
        <div className="flex items-center justify-between gap-3 flex-wrap mt-5 mb-2.5">
          <p className="text-[15px] font-semibold" style={{ color: C.ink }}>{ctx.month}월 할 일</p>
          {!loadError && (
            <form autoComplete="off" className="flex flex-wrap items-center gap-1.5 min-w-0 w-full sm:w-auto"
              onSubmit={e => { e.preventDefault(); submit(); }}>
              {editingId && <span className="text-[12px] font-semibold mr-0.5" style={{ color: C.accent }}>고치는 중</span>}
              <input type="date" value={fStart} aria-label="시작일" onChange={e => setStart(e.target.value)}
                className={inputCls} style={{ borderColor: C.line, color: C.ink }} />
              <span className="text-[12px]" style={{ color: C.faint }}>~</span>
              <input type="date" value={fEnd} min={fStart} aria-label="종료일" onChange={e => setFEnd(e.target.value)}
                className={inputCls} style={{ borderColor: C.line, color: C.ink }} />
              <select value={who} onChange={e => setFWho(e.target.value)} aria-label="담당"
                className={`${inputCls} bg-white`} style={{ borderColor: C.line, color: C.ink }}>
                {!who && <option value="">담당 없음</option>}
                {assigneeOptions.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <input ref={textRef} type="text" value={fText} maxLength={TITLE_MAX} aria-label="할 일"
                placeholder="할 일 카드 제목" onChange={e => setFText(e.target.value)}
                onKeyDown={e => { if (e.key === "Escape" && editingId) { e.preventDefault(); resetForm(); } }}
                className={`${inputCls} px-2.5 placeholder:text-[#8B95A1] flex-1 sm:flex-none sm:w-[200px]`}
                style={{ borderColor: editingId ? C.accent : C.line, color: C.ink }} />
              <button type="submit" disabled={!fText.trim()}
                className="text-[13px] font-semibold text-white rounded-lg px-3.5 py-1.5 disabled:opacity-40"
                style={{ background: C.accent }}>{editingId ? "저장" : "추가"}</button>
              {editingId && (
                <button type="button" onClick={resetForm}
                  className="text-[13px] font-medium rounded-lg px-2.5 py-1.5 hover:bg-[#F2F4F6]" style={{ color: C.muted }}>
                  취소
                </button>
              )}
            </form>
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
              className="hidden min-[761px]:block rounded-[14px] overflow-hidden"
              style={{ border: `1px solid ${C.line}`, userSelect: drag ? "none" : undefined }}>
              <div className="grid" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))", background: C.soft, borderBottom: `1px solid ${C.line}` }}>
                {WEEK_HEAD.map((w, i) => (
                  <div key={w} className="text-[12px] font-medium px-2.5 py-2"
                    style={{ color: i > 4 ? C.bad : C.faint, opacity: i > 4 ? 0.7 : 1 }}>
                    {w}
                  </div>
                ))}
              </div>
              {weekStarts.map((ws, wi) => {
                const { segs, lanes } = layoutWeek(tasks, ws);
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
                        <div key={d} aria-current={isToday ? "date" : undefined}
                          onPointerDown={e => {
                            if (e.button !== 0) return;
                            if (e.pointerType !== "mouse") { pickRange(d, d); return; }
                            e.preventDefault();
                            setDrag({ a: d, b: d });
                          }}
                          onPointerEnter={() => { if (drag) setDrag({ ...drag, b: d }); }}
                          title="눌러서 이 날짜로 추가 · 끌어서 기간 선택"
                          className="cursor-pointer"
                          style={{
                            gridColumn: i + 1, gridRow: "1 / -1",
                            borderRight: i < 6 ? `1px solid ${C.lineSoft}` : undefined,
                            background: inDrag(d) ? C.accentSoft : out ? C.soft : wk ? "rgba(49,130,246,0.04)" : "#fff",
                            boxShadow: isToday ? `inset 0 0 0 2px ${C.accent}` : undefined,
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
                    {segs.map(s => (
                      <div key={s.task.id} className="relative z-[1] min-w-0"
                        style={{
                          gridColumn: `${s.c0 + 1} / ${s.c1 + 2}`, gridRow: s.lane + 2,
                          margin: `0 ${s.cutR ? 0 : 5}px 4px ${s.cutL ? 0 : 5}px`,
                          pointerEvents: drag ? "none" : undefined,
                        }}>
                        {renderCard(s.task, { cutL: s.cutL, cutR: s.cutR })}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* 좁은 화면 — 카드 목록 (시작일 순) */}
            <div className="min-[761px]:hidden flex flex-col gap-1.5">
              {listTasks.length === 0 && (
                <div className="rounded-[14px]" style={{ border: `1px solid ${C.line}` }}><Empty>등록된 할 일이 없습니다</Empty></div>
              )}
              {listTasks.map(t => (
                <div key={t.id}>
                  <p className="text-[11px] mb-0.5 tabular-nums" style={{ color: C.faint }}>
                    {md(t.taskDate)} ({dowOf(t.taskDate)}){t.endDate ? ` – ${md(t.endDate)} (${dowOf(t.endDate)})` : ""}
                  </p>
                  {renderCard(t, { showRange: false })}
                </div>
              ))}
            </div>
            <p className="text-[12px] mt-2" style={{ color: C.faint }}>
              달력 칸을 누르거나 끌어서 기간을 고른 뒤 제목을 적으면 카드가 생깁니다 · 카드를 누르면 고치기 · 종료일이 지났는데 완료 안 된 카드는 빨간색
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
