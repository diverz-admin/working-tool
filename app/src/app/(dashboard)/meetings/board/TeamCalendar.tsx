"use client";

/**
 * 회의록 마케팅팀·개발팀 — 날짜별 할 일 캘린더.
 *
 * 채널·분류는 두지 않는다. "그 날짜에 정말 해야 할 일"만 적고, 회의에서는
 *   지난주에 못 한 일(빨간색) → 이번 주 할 일 → 이번 달 남은 일 순서로 읽는다.
 * 저장은 team_tasks 테이블(/api/team-tasks). 회의록 본문(이슈·메모)은 notes로 따로 저장된다.
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
  taskDate: string;          // YYYY-MM-DD
  title: string;
  assignee: string | null;
  done: boolean;
}

interface Member { name: string; team: string | null; position: string | null; status: string }

const TITLE_MAX = 200;
const WEEK_HEAD = ["월", "화", "수", "목", "금", "토", "일"];
const isTemp = (id: string) => id.startsWith("tmp-");
const dowOf = (iso: string) => DOW[new Date(`${iso}T00:00:00`).getDay()];
const lastDayOf = (y: number, m: number) => {
  const d = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

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
  const gridStart = mondayOf(lastWeekStart < monthFirst ? lastWeekStart : monthFirst);
  const weeks = Math.max(6, Math.ceil((daysBetween(gridStart, monthLast) + 1) / 7));
  const gridEnd = addDays(gridStart, weeks * 7 - 1);
  const weekEnd = addDays(ctx.weekStart, 6);
  const today = ctx.asOf;

  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i));

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
      .then(d => { if (alive) setTasks(d.tasks ?? []); })
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

  // ── 추가 칸 ──
  const [addDate, setAddDate] = useState(today >= gridStart && today <= gridEnd ? today : ctx.weekStart);
  const [addWho, setAddWho] = useState("");
  const [addText, setAddText] = useState("");
  const textRef = useRef<HTMLInputElement>(null);
  // 고르지 않았으면 팀 담당자 → 지금 쓰는 사람 순으로 기본값
  const who = addWho || owners[0]?.name || ctx.userName || assigneeOptions[0] || "";

  const [msg, setMsg] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);              // 삭제 한 번 더 누르면 지워지는 할 일
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);

  const pickDate = (d: string) => {
    setAddDate(d);
    textRef.current?.focus();
  };

  const add = async () => {
    const t = addText.trim();
    if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(addDate)) return;
    if (t.length > TITLE_MAX) { setMsg(`할 일은 ${TITLE_MAX}자 이내로 입력해주세요.`); return; }
    const tmp: Task = { id: `tmp-${Date.now()}`, team, taskDate: addDate, title: t, assignee: who || null, done: false };
    setTasks(p => [...p, tmp]);
    setAddText("");
    setMsg(null);
    try {
      const res = await fetch("/api/team-tasks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team, taskDate: addDate, title: t, assignee: who || null, createdBy: ctx.userName || null }),
      });
      if (!res.ok) throw new Error(await saveErrorMessage(res, "할 일을 추가하지 못했습니다."));
      const { task } = (await res.json()) as { task: Task };
      setTasks(p => p.map(x => (x.id === tmp.id ? task : x)));
    } catch (e) {
      setTasks(p => p.filter(x => x.id !== tmp.id));
      setAddText(cur => cur || t);
      setMsg(e instanceof Error ? e.message : "할 일을 추가하지 못했습니다.");
    }
  };

  /** 한 칸만 바꾸고, 실패하면 이전 값으로 되돌린다 */
  const patch = useCallback(async (task: Task, change: Partial<Pick<Task, "title" | "done">>, fail: string) => {
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

  const saveEdit = () => {
    if (!editing) return;
    const task = tasks.find(x => x.id === editing.id);
    const t = editing.text.trim();
    setEditing(null);
    if (!task || !t || t === task.title) return;
    if (t.length > TITLE_MAX) { setMsg(`할 일은 ${TITLE_MAX}자 이내로 입력해주세요.`); return; }
    patch(task, { title: t }, "할 일을 고치지 못했습니다.");
  };

  const remove = async (task: Task) => {
    if (isTemp(task.id)) return;
    if (armed !== task.id) { setArmed(task.id); return; }
    setArmed(null);
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

  // ── 숫자 ──
  const byDate = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) m.set(t.taskDate, [...(m.get(t.taskDate) ?? []), t]);
    return m;
  }, [tasks]);

  const inRange = (d: string, from: string, to: string) => d >= from && d <= to;
  const thisW = tasks.filter(t => inRange(t.taskDate, ctx.weekStart, weekEnd));
  const lastW = tasks.filter(t => inRange(t.taskDate, lastWeekStart, addDays(ctx.weekStart, -1)));
  const lastMissed = lastW.filter(t => !t.done).length;
  const late = tasks.filter(t => !t.done && t.taskDate < today).length;
  const monthTasks = tasks.filter(t => inRange(t.taskDate, monthFirst, monthLast));

  const badge = loadError ? "" : loading ? "" : `이번 주 ${thisW.length}건`;
  const badgeRef = useRef(onBadge);
  useEffect(() => { badgeRef.current = onBadge; });
  useEffect(() => { if (badge) badgeRef.current?.(badge); }, [badge]);

  const kpis: KpiItem[] = [
    { label: "이번 주 할 일", value: `${thisW.length}건`, sub: `완료 ${thisW.filter(t => t.done).length} · ${md(ctx.weekStart)} – ${md(weekEnd)}` },
    {
      label: "지난주 완료", value: `${lastW.length - lastMissed}/${lastW.length}`,
      sub: `못 한 일 ${lastMissed}건${late > lastMissed ? ` · 밀린 일 전체 ${late}건` : ""}`,
      color: lastMissed > 0 ? C.bad : undefined,
    },
    { label: "이번 달 할 일", value: `${monthTasks.length}건`, sub: `${ctx.month}월 · 완료 ${monthTasks.filter(t => t.done).length}` },
    ...(extraKpi ? [extraKpi] : []),
  ];

  // ── 할 일 한 줄 ──
  const renderTask = (t: Task) => {
    const isLate = !t.done && t.taskDate < today;
    const pending = isTemp(t.id);
    if (editing?.id === t.id) {
      return (
        <input key={t.id} autoFocus value={editing.text} maxLength={TITLE_MAX} aria-label="할 일 고치기"
          onChange={e => setEditing({ id: t.id, text: e.target.value })}
          onBlur={saveEdit}
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); saveEdit(); }
            if (e.key === "Escape") { e.preventDefault(); setEditing(null); }
          }}
          className="w-full min-w-0 text-[12px] rounded-md px-1.5 py-1 outline-none border focus:border-[#3182F6]"
          style={{ borderColor: C.accent, color: C.ink }} />
      );
    }
    return (
      <div key={t.id} className="group/task relative w-full min-w-0 rounded-md transition-colors"
        style={{ background: isLate ? C.badSoft : C.soft, opacity: t.done ? 0.5 : pending ? 0.7 : 1 }}>
        <button type="button" onClick={() => toggle(t)} disabled={pending} aria-pressed={t.done}
          title={t.done ? "완료 취소" : "완료로 표시"}
          className="flex w-full min-w-0 items-start gap-1.5 text-left px-1.5 py-[5px] pr-9 rounded-md hover:bg-black/[0.03] focus-visible:outline-2 focus-visible:outline-[#3182F6]">
          <span aria-hidden className="shrink-0 rounded-full mt-[3px]"
            style={{
              width: 12, height: 12,
              border: `1.5px solid ${t.done ? C.good : isLate ? C.bad : C.faint}`,
              background: t.done ? C.good : "transparent",
              boxShadow: t.done ? `inset 0 0 0 2px ${C.soft}` : undefined,
            }} />
          <span className="min-w-0">
            <span className="block text-[12px] leading-[1.4]"
              style={{ color: C.ink, textDecoration: t.done ? "line-through" : undefined, wordBreak: "keep-all", overflowWrap: "anywhere" }}>
              {t.title}
            </span>
            {(t.assignee || isLate) && (
              <span className="flex items-center gap-1 text-[11px] mt-px" style={{ color: C.muted }}>
                {t.assignee && <>
                  <i className="inline-block rounded-full" style={{ width: 6, height: 6, background: personColor(t.assignee) }} />
                  {t.assignee}
                </>}
                {isLate && <span style={{ color: C.bad }}>{t.assignee ? "· " : ""}못 함</span>}
              </span>
            )}
          </span>
        </button>
        {!pending && (
          <span className={`absolute right-0.5 top-0.5 flex items-center gap-px transition-opacity ${armed === t.id
            ? "opacity-100" : "opacity-0 group-hover/task:opacity-100 group-focus-within/task:opacity-100 [@media(hover:none)]:opacity-100"}`}>
            {armed !== t.id && (
              <button type="button" onClick={() => setEditing({ id: t.id, text: t.title })} aria-label={`${t.title} 고치기`}
                title="고치기"
                className="w-[18px] h-[18px] rounded text-[11px] leading-none hover:bg-white" style={{ color: C.muted }}>✎</button>
            )}
            <button type="button" onClick={() => remove(t)} aria-label={armed === t.id ? `${t.title} 삭제 확인` : `${t.title} 삭제`}
              title={armed === t.id ? "한 번 더 누르면 삭제" : "삭제"}
              className={`h-[18px] rounded leading-none ${armed === t.id ? "px-1.5 text-[11px] font-semibold text-white" : "w-[18px] text-[13px] hover:bg-white"}`}
              style={armed === t.id ? { background: C.bad } : { color: C.muted }}>
              {armed === t.id ? "삭제" : "×"}
            </button>
          </span>
        )}
      </div>
    );
  };

  const dayLabel = (d: string, first: boolean) => (first || d.endsWith("-01") ? md(d) : String(Number(d.slice(8))));
  const plusButton = (d: string, always = false) => (
    <button type="button" onClick={() => pickDate(d)} aria-label={`${md(d)} 할 일 추가`} title="이 날짜로 추가"
      className={`w-[22px] h-[22px] rounded-md text-[14px] leading-none transition-opacity hover:bg-[#F0F2F4] focus-visible:opacity-100 ${always
        ? "" : "opacity-0 group-hover/day:opacity-100 [@media(hover:none)]:opacity-100"}`}
      style={{ color: C.faint }}>+</button>
  );

  const listDays = days.filter(d => (byDate.get(d)?.length ?? 0) > 0 || d === today);

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

        {/* 추가 칸 */}
        <div className="flex items-center justify-between gap-3 flex-wrap mt-5 mb-2.5">
          <p className="text-[15px] font-semibold" style={{ color: C.ink }}>{ctx.month}월 할 일</p>
          {!loadError && (
            <form autoComplete="off" className="flex flex-wrap gap-1.5 min-w-0 w-full sm:w-auto"
              onSubmit={e => { e.preventDefault(); add(); }}>
              <input type="date" value={addDate} min={gridStart} max={gridEnd} aria-label="날짜"
                onChange={e => setAddDate(e.target.value)}
                className="text-[13px] rounded-lg border px-2 py-1.5 outline-none focus:border-[#3182F6] min-w-0"
                style={{ borderColor: C.line, color: C.ink }} />
              <select value={who} onChange={e => setAddWho(e.target.value)} aria-label="담당"
                className="text-[13px] rounded-lg border px-2 py-1.5 outline-none focus:border-[#3182F6] bg-white min-w-0"
                style={{ borderColor: C.line, color: C.ink }}>
                {!who && <option value="">담당 없음</option>}
                {assigneeOptions.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <input ref={textRef} type="text" value={addText} maxLength={TITLE_MAX} aria-label="할 일"
                placeholder="해야 할 일" onChange={e => setAddText(e.target.value)}
                className="text-[13px] rounded-lg border px-2.5 py-1.5 outline-none focus:border-[#3182F6] placeholder:text-[#8B95A1] min-w-0 flex-1 sm:flex-none sm:w-[220px]"
                style={{ borderColor: C.line, color: C.ink }} />
              <button type="submit" disabled={!addText.trim()}
                className="text-[13px] font-semibold text-white rounded-lg px-3.5 py-1.5 disabled:opacity-40"
                style={{ background: C.accent }}>추가</button>
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
            {/* 넓은 화면 — 월요일 시작 달력 */}
            <div role="grid" aria-label={`${title} ${ctx.month}월 할 일 캘린더`}
              className="hidden min-[761px]:grid rounded-[14px] overflow-hidden"
              style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))", border: `1px solid ${C.line}` }}>
              {WEEK_HEAD.map((w, i) => (
                <div key={w} role="columnheader" className="text-[12px] font-medium px-2.5 py-2"
                  style={{ color: i > 4 ? C.bad : C.faint, opacity: i > 4 ? 0.7 : 1, background: C.soft, borderBottom: `1px solid ${C.line}` }}>
                  {w}
                </div>
              ))}
              {days.map((d, i) => {
                const out = d < monthFirst || d > monthLast;
                const wk = d >= ctx.weekStart && d <= weekEnd;
                const isToday = d === today;
                return (
                  <div key={d} role="gridcell" aria-current={isToday ? "date" : undefined}
                    className="group/day flex flex-col gap-1 min-w-0 px-1.5 pt-1.5 pb-2"
                    style={{
                      minHeight: 112,
                      borderRight: (i + 1) % 7 ? `1px solid ${C.lineSoft}` : undefined,
                      borderBottom: i < days.length - 7 ? `1px solid ${C.lineSoft}` : undefined,
                      background: out ? C.soft : wk ? "rgba(49,130,246,0.04)" : "#fff",
                      boxShadow: isToday ? `inset 0 0 0 2px ${C.accent}` : undefined,
                    }}>
                    <div className="flex items-center justify-between px-0.5">
                      <span className="text-[13px] tabular-nums rounded-full"
                        style={isToday
                          ? { color: "#fff", background: C.accent, padding: "0 7px", fontWeight: 600 }
                          : { color: out ? C.faint : C.body, fontWeight: 500 }}>
                        {dayLabel(d, i === 0)}
                      </span>
                      {plusButton(d)}
                    </div>
                    {(byDate.get(d) ?? []).map(renderTask)}
                  </div>
                );
              })}
            </div>

            {/* 좁은 화면 — 할 일이 있는 날(+ 오늘)만 세로로 */}
            <div className="min-[761px]:hidden rounded-[14px] overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
              {listDays.length === 0 && <Empty>등록된 할 일이 없습니다</Empty>}
              {listDays.map((d, i) => {
                const wk = d >= ctx.weekStart && d <= weekEnd;
                const isToday = d === today;
                return (
                  <div key={d} className="flex flex-col gap-1 px-2.5 py-2"
                    style={{
                      borderTop: i ? `1px solid ${C.lineSoft}` : undefined,
                      background: wk ? "rgba(49,130,246,0.04)" : "#fff",
                      boxShadow: isToday ? `inset 0 0 0 2px ${C.accent}` : undefined,
                    }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] tabular-nums"
                        style={{ color: isToday ? C.accent : C.body, fontWeight: isToday ? 600 : 500 }}>
                        {md(d)} ({dowOf(d)}){isToday && " · 오늘"}
                      </span>
                      {plusButton(d, true)}
                    </div>
                    {(byDate.get(d) ?? []).map(renderTask)}
                  </div>
                );
              })}
            </div>
            <p className="text-[12px] mt-2" style={{ color: C.faint }}>
              할 일을 누르면 완료로 바뀝니다 · 날짜 칸의 + 를 누르면 그 날짜로 추가 · 지난 날짜에 남은 일은 빨간색으로 표시됩니다
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
