"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  useMarketing,
  ASSIGNEES, AVATAR_COLORS, EVENT_COLOR_MAP,
  STATUS_STYLE, PRIORITY_STYLE, TAG_COLORS,
  type Task, type CalEvent, type EventColor, type Status,
} from "../context";

// ─── 유틸 ────────────────────────────────────────────────────
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const STATUSES: Status[] = ["할 일", "진행중", "검토중", "완료"];

function pad2(n: number) { return String(n).padStart(2, "0"); }
function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDay(y: number, m: number)    { return new Date(y, m, 1).getDay(); }
function dateStr(y: number, m: number, d: number) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }

// 태스크가 특정 날짜를 포함하는지 (startDate ~ dueDate)
function taskCoversDate(t: Task, key: string) {
  if (!t.dueDate) return false;
  const start = t.startDate ?? t.dueDate;
  return start <= key && key <= t.dueDate;
}
// 날짜가 해당 주(row)의 어느 컬럼인지
function colOf(dateKey: string, rowStart: string): number {
  const diff = (new Date(dateKey).getTime() - new Date(rowStart).getTime()) / 86400000;
  return Math.max(0, Math.min(6, diff));
}

// ─── 기간 조정 패널 ──────────────────────────────────────────
function DateRangePanel({ task, onClose }: { task: Task; onClose: () => void }) {
  const { updateTask, deleteTask } = useMarketing();
  const [start, setStart] = useState(task.startDate ?? task.dueDate ?? "");
  const [end,   setEnd]   = useState(task.dueDate ?? "");

  const ac = AVATAR_COLORS[task.assignee] ?? "#6366F1";
  const ss = STATUS_STYLE[task.status];
  const ps = PRIORITY_STYLE[task.priority];
  const ts = task.tag ? TAG_COLORS[task.tag] : null;

  function apply() {
    if (!start || !end) return;
    const s = start <= end ? start : end;
    const e = start <= end ? end   : start;
    updateTask(task.id, { startDate: s, dueDate: e });
  }

  const days = start && end ? Math.round(
    (new Date(end > start ? end : start).getTime() - new Date(start < end ? start : end).getTime()) / 86400000
  ) + 1 : 1;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: "1px solid #E9EBEF", boxShadow: "0 4px 20px rgba(22,31,51,0.1)" }}>
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid #F1F5F9", background: `${ac}08` }}>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md flex items-center justify-center text-white text-xs font-bold"
            style={{ background: ac }}>{task.assignee[0]}</div>
          <span className="text-xs font-bold truncate max-w-[140px]" style={{ color: ac }}>{task.title}</span>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* 상태/우선순위 */}
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
            style={{ background: ss.bg, color: ss.color, border: `1px solid ${ss.border}` }}>
            {task.status}
          </span>
          <span className="text-xs font-semibold" style={{ color: ps.color }}>● {task.priority}</span>
          {ts && task.tag && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: ts.bg, color: ts.color }}>{task.tag}</span>
          )}
        </div>

        {/* 기간 조정 */}
        <div>
          <p className="text-xs font-bold mb-2 flex items-center gap-1.5" style={{ color: "#191F28" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3182F6" strokeWidth="2.5" strokeLinecap="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/>
              <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
            </svg>
            기간 조정
            {days > 1 && (
              <span className="font-normal text-xs" style={{ color: "#94A3B8" }}>({days}일간)</span>
            )}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs mb-1" style={{ color: "#94A3B8" }}>시작일</label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg text-xs outline-none"
                style={{ border: "1px solid #E9EBEF", background: "#F8FAFC", color: "#191F28" }} />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: "#94A3B8" }}>마감일</label>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg text-xs outline-none"
                style={{ border: "1px solid #E9EBEF", background: "#F8FAFC", color: "#191F28" }} />
            </div>
          </div>

          {/* 기간 시각화 바 */}
          {days > 0 && (
            <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: "#F1F5F9" }}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(days * 10, 100)}%`, background: ac, transition: "width 0.3s" }} />
            </div>
          )}

          <button onClick={apply}
            className="mt-2.5 w-full py-2 rounded-xl text-xs font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: `linear-gradient(135deg, ${ac} 0%, ${ac}CC 100%)` }}>
            기간 적용
          </button>
        </div>

        {/* 상태 변경 */}
        <div>
          <p className="text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>상태</p>
          <div className="flex gap-1.5 flex-wrap">
            {STATUSES.map((s) => (
              <button key={s} onClick={() => updateTask(task.id, { status: s })}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: task.status === s ? STATUS_STYLE[s].bg : "#F8FAFC",
                  color: task.status === s ? STATUS_STYLE[s].color : "#94A3B8",
                  border: `1px solid ${task.status === s ? STATUS_STYLE[s].border : "#E9EBEF"}`,
                }}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <Link href="/marketing/board" className="text-xs font-semibold flex items-center gap-1" style={{ color: "#3182F6" }}>
            보드에서 보기
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </Link>
          <button onClick={() => { deleteTask(task.id); onClose(); }} className="text-xs font-semibold" style={{ color: "#EF4444" }}>삭제</button>
        </div>
      </div>
    </div>
  );
}

// ─── 일정 추가 모달 ──────────────────────────────────────────
function AddEventModal({ onClose, onAdd }: {
  onClose: () => void;
  onAdd: (e: Omit<CalEvent, "id">, task: Omit<Task, "id"> | null) => void;
}) {
  const [date,      setDate]      = useState("");
  const [title,     setTitle]     = useState("");
  const [color,     setColor]     = useState<EventColor>("blue");
  const [team,      setTeam]      = useState("");
  const [linkBoard, setLinkBoard] = useState(false);
  const [taskAssign, setTaskAssign] = useState(ASSIGNEES[0]);
  const [taskPri,    setTaskPri]    = useState<"높음"|"보통"|"낮음">("보통");
  const [taskTag,    setTaskTag]    = useState("");
  const [taskEnd,    setTaskEnd]    = useState("");

  const inp  = "w-full px-3 py-2 rounded-xl text-sm outline-none";
  const inpS = { border: "1px solid #E9EBEF", background: "#FAFAFA", color: "#191F28" };

  function submit() {
    if (!date || !title.trim()) return;
    const task: Omit<Task, "id"> | null = linkBoard ? {
      title, description: "", status: "할 일", priority: taskPri,
      assignee: taskAssign, tag: taskTag,
      startDate: date, dueDate: taskEnd || date,
    } : null;
    onAdd({ date, title, color, team: team || undefined }, task);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(25,31,40,0.45)" }}>
      <div className="rounded-2xl w-full max-w-md mx-4 overflow-hidden" style={{ background: "#fff", boxShadow: "0 20px 60px rgba(22,31,51,0.18)" }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #F1F5F9" }}>
          <h2 className="text-base font-bold" style={{ color: "#191F28" }}>일정 추가</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>날짜 *</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inp} style={inpS} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>담당팀</label>
              <select value={team} onChange={(e) => setTeam(e.target.value)} className={inp} style={inpS}>
                <option value="">전체</option>
                <option>영업 1팀</option><option>영업 2팀</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>일정 제목 *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="일정 제목" className={inp} style={inpS} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>색상</label>
            <div className="flex gap-2">
              {(Object.keys(EVENT_COLOR_MAP) as EventColor[]).map((c) => (
                <button key={c} onClick={() => setColor(c)} className="w-6 h-6 rounded-full transition-all"
                  style={{ background: EVENT_COLOR_MAP[c].dot, outline: color === c ? `2px solid ${EVENT_COLOR_MAP[c].dot}` : "none", outlineOffset: 2 }} />
              ))}
            </div>
          </div>
          <div className="rounded-xl p-3.5" style={{ background: "rgba(49,130,246,0.04)", border: "1px solid rgba(49,130,246,0.15)" }}>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <div onClick={() => setLinkBoard((v) => !v)}
                className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                style={{ background: linkBoard ? "#3182F6" : "#E2E8F0" }}>
                <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                  style={{ left: linkBoard ? "calc(100% - 18px)" : "2px" }} />
              </div>
              <div>
                <p className="text-xs font-bold" style={{ color: linkBoard ? "#3182F6" : "#64748B" }}>프로젝트 보드에 업무 추가</p>
                <p className="text-xs" style={{ color: "#94A3B8" }}>기간 설정 가능</p>
              </div>
            </label>
            {linkBoard && (
              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>마감일</label>
                    <input type="date" value={taskEnd} onChange={(e) => setTaskEnd(e.target.value)} className={inp + " text-xs"} style={inpS} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>담당자</label>
                    <select value={taskAssign} onChange={(e) => setTaskAssign(e.target.value)} className={inp + " text-xs"} style={inpS}>
                      {ASSIGNEES.map((a) => <option key={a}>{a}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>우선순위</label>
                    <select value={taskPri} onChange={(e) => setTaskPri(e.target.value as "높음"|"보통"|"낮음")} className={inp + " text-xs"} style={inpS}>
                      <option>높음</option><option>보통</option><option>낮음</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>태그</label>
                    <input value={taskTag} onChange={(e) => setTaskTag(e.target.value)} placeholder="기획" className={inp + " text-xs"} style={inpS} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4" style={{ borderTop: "1px solid #F1F5F9" }}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: "#F8FAFC", color: "#64748B", border: "1px solid #E9EBEF" }}>취소</button>
          <button onClick={submit} disabled={!date || !title.trim()}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" }}>추가</button>
        </div>
      </div>
    </div>
  );
}

// ─── 메인 캘린더 ─────────────────────────────────────────────
export default function CalendarPage({ asTab = false }: { asTab?: boolean }) {
  const { calEvents, tasks, addCalEvent, deleteCalEvent, updateTask } = useMarketing();
  const now   = new Date();
  const [year,     setYear]     = useState(now.getFullYear());
  const [month,    setMonth]    = useState(now.getMonth());
  const [addModal, setAddModal] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [panelTask, setPanelTask] = useState<Task | null>(null);

  // panelTask를 context의 최신 task와 동기화
  const livePanelTask = panelTask ? tasks.find((t) => t.id === panelTask.id) ?? null : null;

  function prevMonth() { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 11) { setYear(y => y + 1); setMonth(0); }  else setMonth(m => m + 1); }

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay    = getFirstDay(year, month);
  const totalCells  = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  // 이번 달 또는 이달에 걸쳐있는 캘린더 이벤트
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const monthCalEvents = useMemo(() => calEvents.filter((e) => {
    const [ey, em] = e.date.split("-").map(Number);
    return ey === year && em - 1 === month;
  }), [calEvents, year, month]);

  // 이번 달과 겹치는 board tasks
  const monthStart = `${year}-${pad2(month + 1)}-01`;
  const monthEnd   = `${year}-${pad2(month + 1)}-${pad2(daysInMonth)}`;

  const monthBoardTasks = useMemo(() => tasks.filter((t) => {
    if (!t.dueDate) return false;
    const s = t.startDate ?? t.dueDate;
    return s <= monthEnd && t.dueDate >= monthStart;
  }), [tasks, monthStart, monthEnd]);

  // ── 주(row)별 렌더링 준비 ──────────────────────────────────
  const weeks: string[][] = [];
  for (let r = 0; r < totalCells / 7; r++) {
    const week: string[] = [];
    for (let c = 0; c < 7; c++) {
      const day = r * 7 + c - firstDay + 1;
      week.push(day >= 1 && day <= daysInMonth ? dateStr(year, month, day) : "");
    }
    weeks.push(week);
  }

  // ── 선택된 날짜의 이벤트 ──────────────────────────────────
  const selectedCalEvents  = selected ? calEvents.filter((e) => e.date === selected) : [];
  const selectedBoardTasks = selected ? tasks.filter((t) => taskCoversDate(t, selected)) : [];

  return (
    <div className="space-y-5">
      {addModal && (
        <AddEventModal onClose={() => setAddModal(false)} onAdd={(e, task) => { addCalEvent(e, task); setAddModal(false); }} />
      )}

      {/* 헤더 */}
      {!asTab && (
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "#191F28" }}>업무캘린더</h1>
          <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>업무를 클릭하면 기간을 조정할 수 있습니다.</p>
        </div>
      </div>
      )}
      <div className="flex items-center justify-end gap-2">
          <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl text-xs" style={{ background: "#F8FAFC", border: "1px solid #E9EBEF" }}>
            <span className="flex items-center gap-1.5" style={{ color: "#64748B" }}>
              <span className="w-3 h-3 rounded-sm" style={{ background: "#3182F6" }} />일정
            </span>
            <span className="flex items-center gap-1.5" style={{ color: "#64748B" }}>
              <span className="w-3 h-3 rounded-sm" style={{ background: "#8B5CF6" }} />보드 업무
            </span>
          </div>
          <button onClick={() => setAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity"
            style={{ background: "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            일정 추가
          </button>
        </div>

      <div className="grid grid-cols-3 gap-5">
        {/* ── 캘린더 ── */}
        <div className="col-span-2 rounded-2xl overflow-hidden" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
          {/* 월 네비게이션 */}
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #F1F5F9" }}>
            <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div className="text-center">
              <h2 className="text-base font-bold" style={{ color: "#191F28" }}>{year}년 {month + 1}월</h2>
              <p className="text-xs" style={{ color: "#94A3B8" }}>
                일정 {monthCalEvents.length}건 · 보드 {monthBoardTasks.filter((t, i, a) => a.findIndex(x => x.id === t.id) === i).length}건
              </p>
            </div>
            <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>

          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 border-b" style={{ borderColor: "#F1F5F9" }}>
            {DAYS.map((d, i) => (
              <div key={d} className="text-center text-xs font-semibold py-2"
                style={{ color: i === 0 ? "#EF4444" : i === 6 ? "#3182F6" : "#94A3B8" }}>
                {d}
              </div>
            ))}
          </div>

          {/* 주 별 렌더링 */}
          <div className="divide-y" style={{ borderColor: "#F1F5F9" }}>
            {weeks.map((week, rowIdx) => {
              const rowFirstDate = week.find((d) => d !== "") ?? "";

              // 이 주에 표시할 board tasks (시작일 기준으로 정렬, 각 lane 할당)
              const rowTasks = monthBoardTasks
                .filter((t) => week.some((d) => d && taskCoversDate(t, d)))
                .filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i);

              // lane 할당: 같은 날 겹치는 태스크들은 다른 lane에
              const lanes: Task[][] = [];
              for (const t of rowTasks) {
                const tStart = t.startDate ?? t.dueDate!;
                const tEnd   = t.dueDate!;
                let placed = false;
                for (const lane of lanes) {
                  const lastInLane = lane[lane.length - 1];
                  const lEnd = lastInLane.dueDate!;
                  if (tStart > lEnd) { lane.push(t); placed = true; break; }
                }
                if (!placed) lanes.push([t]);
              }

              return (
                <div key={rowIdx} className="relative" style={{ minHeight: 80 + lanes.length * 22 }}>
                  {/* 날짜 숫자 */}
                  <div className="grid grid-cols-7 h-6">
                    {week.map((dateKey, c) => {
                      const day   = dateKey ? parseInt(dateKey.split("-")[2]) : 0;
                      const isToday = dateKey === dateStr(now.getFullYear(), now.getMonth(), now.getDate());
                      const isSel   = dateKey === selected;
                      return (
                        <div key={c}
                          onClick={() => { if (dateKey) { setSelected(isSel ? null : dateKey); setPanelTask(null); } }}
                          className="flex items-center justify-end px-1.5 pt-1 cursor-pointer transition-colors"
                          style={{ background: isSel ? "rgba(49,130,246,0.06)" : "transparent" }}>
                          {dateKey && (
                            <span className="text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full"
                              style={{
                                background: isToday ? "#3182F6" : "transparent",
                                color: isToday ? "#fff" : c === 0 ? "#EF4444" : c === 6 ? "#3182F6" : "#475569",
                                fontSize: 11,
                              }}>
                              {day}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* 캘린더 이벤트 (일별 칩) */}
                  <div className="grid grid-cols-7 px-0.5">
                    {week.map((dateKey, c) => {
                      const dayEvents = dateKey ? monthCalEvents.filter((e) => e.date === dateKey) : [];
                      return (
                        <div key={c} className="px-0.5 pb-0.5 flex flex-col gap-0.5">
                          {dayEvents.map((ev) => {
                            const cm = EVENT_COLOR_MAP[ev.color];
                            return (
                              <div key={ev.id} className="rounded px-1.5 py-0.5 cursor-pointer"
                                style={{ background: cm.bg }}
                                onClick={() => setSelected(dateKey)}>
                                <p className="font-medium leading-tight truncate" style={{ color: cm.text, fontSize: 11 }}>{ev.title}</p>
                                {ev.team && <span className="inline-block px-1 rounded text-white font-semibold leading-tight" style={{ background: cm.dot, fontSize: 9 }}>{ev.team}</span>}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>

                  {/* Board tasks — spanning bars */}
                  <div className="px-0.5" style={{ paddingBottom: 6 }}>
                    {lanes.map((lane, laneIdx) =>
                      lane.map((t) => {
                        const ac       = AVATAR_COLORS[t.assignee] ?? "#6366F1";
                        const tStart   = t.startDate ?? t.dueDate!;
                        const tEnd     = t.dueDate!;
                        const isSingle = tStart === tEnd;

                        // 이 주에서의 실제 표시 범위
                        const dispStart = tStart >= rowFirstDate ? tStart : rowFirstDate;
                        const weekEnd   = week[6] || week.filter((d) => d).slice(-1)[0];
                        const dispEnd   = tEnd <= weekEnd ? tEnd : weekEnd;

                        const startCol = week.indexOf(dispStart);
                        const endCol   = week.indexOf(dispEnd);
                        if (startCol < 0 || endCol < 0) return null;

                        const isActualStart = dispStart === tStart;
                        const isActualEnd   = dispEnd   === tEnd;
                        const span          = endCol - startCol + 1;
                        const isSelected    = livePanelTask?.id === t.id;

                        const leftRadius  = isActualStart ? 4 : 0;
                        const rightRadius = isActualEnd   ? 4 : 0;

                        return (
                          <div key={`${t.id}-${laneIdx}`}
                            onClick={(e) => { e.stopPropagation(); setPanelTask(t); setSelected(dispStart); }}
                            className="absolute cursor-pointer flex items-center overflow-hidden transition-all"
                            style={{
                              top: 28 + laneIdx * 22,
                              left:  `calc(${(startCol / 7) * 100}% + 2px)`,
                              width: `calc(${(span / 7) * 100}% - 4px)`,
                              height: 20,
                              background: isSelected ? ac : `${ac}22`,
                              borderRadius: `${leftRadius}px ${rightRadius}px ${rightRadius}px ${leftRadius}px`,
                              border: `1.5px solid ${ac}`,
                              boxShadow: isSelected ? `0 2px 8px ${ac}60` : "none",
                              transition: "background 0.15s, box-shadow 0.15s",
                            }}
                            onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = `${ac}40`; }}
                            onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = `${ac}22`; }}
                          >
                            {/* 제목 (시작일에만 표시) */}
                            {isActualStart ? (
                              <span className="pl-1.5 truncate font-semibold flex-1"
                                style={{ color: isSelected ? "#fff" : ac, fontSize: 10 }}>
                                {t.title}
                              </span>
                            ) : (
                              <span className="flex-1" />
                            )}
                            {/* 담당자 배지 (시작일에만) */}
                            {isActualStart && (
                              <span className="shrink-0 mx-1 px-1.5 rounded-full text-white font-bold"
                                style={{ background: ac, fontSize: 9 }}>
                                {t.assignee}
                              </span>
                            )}
                            {/* 계속 화살표 (끝이 아닌 경우) */}
                            {!isActualEnd && (
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none"
                                stroke={isSelected ? "#fff" : ac} strokeWidth="3" strokeLinecap="round"
                                className="shrink-0 mr-0.5">
                                <polyline points="9 18 15 12 9 6"/>
                              </svg>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 사이드 패널 ── */}
        <div className="flex flex-col gap-3">
          {/* 날짜 상세 */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
            <div className="px-4 py-3" style={{ borderBottom: "1px solid #F1F5F9" }}>
              <h3 className="text-sm font-bold" style={{ color: "#191F28" }}>
                {selected
                  ? `${parseInt(selected.split("-")[1])}월 ${parseInt(selected.split("-")[2])}일`
                  : "날짜를 선택하세요"}
              </h3>
            </div>
            <div className="p-3 space-y-2 max-h-52 overflow-y-auto">
              {!selected && <p className="text-xs py-4 text-center" style={{ color: "#CBD5E1" }}>캘린더에서 날짜를 클릭하세요</p>}
              {selectedCalEvents.map((ev) => {
                const cm = EVENT_COLOR_MAP[ev.color];
                return (
                  <div key={ev.id} className="flex items-start gap-2 p-2 rounded-xl group" style={{ background: cm.bg }}>
                    <span className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ background: cm.dot }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold" style={{ color: cm.text }}>{ev.title}</p>
                      {ev.team && <p className="text-xs" style={{ color: "#94A3B8" }}>{ev.team}</p>}
                    </div>
                    <button onClick={() => deleteCalEvent(ev.id)} className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-all">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                );
              })}
              {selectedBoardTasks.map((t) => {
                const ac = AVATAR_COLORS[t.assignee] ?? "#6366F1";
                const isActive = livePanelTask?.id === t.id;
                return (
                  <div key={t.id} onClick={() => setPanelTask(isActive ? null : t)}
                    className="flex items-start gap-2 p-2 rounded-xl cursor-pointer transition-colors"
                    style={{ background: isActive ? `${ac}15` : `${ac}0A`, border: isActive ? `1px solid ${ac}40` : "1px solid transparent" }}>
                    <div className="w-5 h-5 rounded-md flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ background: ac }}>{t.assignee[0]}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate" style={{ color: ac }}>{t.title}</p>
                      <p className="text-xs" style={{ color: "#94A3B8" }}>
                        {t.startDate && t.startDate !== t.dueDate ? `${t.startDate} ~ ` : ""}{t.dueDate}
                      </p>
                    </div>
                  </div>
                );
              })}
              {selected && selectedCalEvents.length === 0 && selectedBoardTasks.length === 0 && (
                <p className="text-xs py-4 text-center" style={{ color: "#CBD5E1" }}>이 날의 일정이 없습니다.</p>
              )}
            </div>
          </div>

          {/* 기간 조정 패널 */}
          {livePanelTask && (
            <DateRangePanel task={livePanelTask} onClose={() => setPanelTask(null)} />
          )}

        </div>
      </div>
    </div>
  );
}
