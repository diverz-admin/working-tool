"use client";

import { useState } from "react";
import Link from "next/link";
import CalendarPage from "../calendar/page";
import {
  useMarketing,
  ASSIGNEES, AVATAR_COLORS, STATUS_STYLE, PRIORITY_STYLE, TAG_COLORS,
  type Task, type Status, type Priority,
} from "../context";

const STATUSES: Status[] = ["할 일", "진행중", "검토중", "완료"];
type PageTab = "calendar" | "board";

// ─── 업무 추가 모달 ──────────────────────────────────────────
function AddTaskModal({ defaultAssignee, onClose, onAdd }: {
  defaultAssignee?: string;
  onClose: () => void;
  onAdd: (t: Omit<Task, "id">) => void;
}) {
  const [form, setForm] = useState<Omit<Task, "id">>({
    title: "", description: "", status: "할 일", priority: "보통",
    assignee: defaultAssignee ?? ASSIGNEES[0], tag: "", dueDate: "",
  });
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const inp = "w-full px-3 py-2 rounded-xl text-sm outline-none";
  const inpS = { border: "1px solid #E9EBEF", background: "#FAFAFA", color: "#191F28" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(25,31,40,0.45)" }}>
      <div className="rounded-2xl w-full max-w-md mx-4 overflow-hidden" style={{ background: "#fff", boxShadow: "0 20px 60px rgba(22,31,51,0.18)" }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #F1F5F9" }}>
          <h2 className="text-base font-bold" style={{ color: "#191F28" }}>업무 추가</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>업무 제목 *</label>
            <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="업무 제목" className={inp} style={inpS} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>설명</label>
            <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} className={inp + " resize-none"} style={inpS} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>담당자</label>
              <select value={form.assignee} onChange={(e) => set("assignee", e.target.value)} className={inp} style={inpS}>
                {ASSIGNEES.map((a) => <option key={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>우선순위</label>
              <select value={form.priority} onChange={(e) => set("priority", e.target.value as Priority)} className={inp} style={inpS}>
                {(["높음","보통","낮음"] as Priority[]).map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>태그</label>
              <input value={form.tag ?? ""} onChange={(e) => set("tag", e.target.value)} placeholder="콘텐츠, 광고…" className={inp} style={inpS} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>
                마감일
                <span className="ml-1 font-normal" style={{ color: "#94A3B8" }}>캘린더 자동 표시</span>
              </label>
              <input type="date" value={form.dueDate ?? ""} onChange={(e) => set("dueDate", e.target.value)} className={inp} style={inpS} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4" style={{ borderTop: "1px solid #F1F5F9" }}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: "#F8FAFC", color: "#64748B", border: "1px solid #E9EBEF" }}>취소</button>
          <button onClick={() => { if (form.title.trim()) { onAdd(form); onClose(); } }} disabled={!form.title.trim()}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" }}>추가</button>
        </div>
      </div>
    </div>
  );
}

// ─── 업무 카드 ──────────────────────────────────────────────
function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const ss = STATUS_STYLE[task.status];
  const ps = PRIORITY_STYLE[task.priority];
  const ts = task.tag ? TAG_COLORS[task.tag] : null;
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "완료";

  return (
    <div onClick={onClick}
      className="rounded-xl p-3.5 flex flex-col gap-2 cursor-pointer transition-all"
      style={{ background: "#fff", border: "1px solid #E9EBEF", boxShadow: "0 1px 3px rgba(22,31,51,0.05)" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 12px rgba(22,31,51,0.1)"; (e.currentTarget as HTMLElement).style.borderColor = "#CBD5E1"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 3px rgba(22,31,51,0.05)"; (e.currentTarget as HTMLElement).style.borderColor = "#E9EBEF"; }}>
      <div className="flex items-center justify-between gap-2">
        {ts && task.tag
          ? <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: ts.bg, color: ts.color }}>{task.tag}</span>
          : <span />}
        <span className="flex items-center gap-1 text-xs font-semibold shrink-0" style={{ color: ps.color }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: ps.color }} />
          {task.priority}
        </span>
      </div>
      <p className="text-sm font-semibold leading-snug"
        style={{ color: task.status === "완료" ? "#94A3B8" : "#191F28", textDecoration: task.status === "완료" ? "line-through" : "none" }}>
        {task.title}
      </p>
      {task.description && <p className="text-xs line-clamp-2 leading-relaxed" style={{ color: "#94A3B8" }}>{task.description}</p>}
      <div className="flex items-center justify-between mt-0.5">
        <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
          style={{ background: ss.bg, color: ss.color, border: `1px solid ${ss.border}` }}>
          {task.status}
        </span>
        {task.dueDate ? (
          <span className="flex items-center gap-1 text-xs font-medium" style={{ color: isOverdue ? "#EF4444" : "#94A3B8" }}>
            {/* 캘린더 아이콘 — 캘린더와 연결됨을 표시 */}
            <Link href="/marketing/calendar" onClick={(e) => e.stopPropagation()}
              title="캘린더에서 보기"
              className="p-0.5 rounded transition-colors hover:bg-slate-100">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={isOverdue ? "#EF4444" : "#3182F6"} strokeWidth="2.5" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </Link>
            {isOverdue && "⚠ "}
            {task.dueDate.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$2/$3")}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ─── 업무 상세 모달 ──────────────────────────────────────────
function TaskDetailModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const { updateTask, deleteTask } = useMarketing();
  const ss = STATUS_STYLE[task.status];
  const ps = PRIORITY_STYLE[task.priority];
  const ac = AVATAR_COLORS[task.assignee] ?? "#64748B";
  const ts = task.tag ? TAG_COLORS[task.tag] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(25,31,40,0.45)" }} onClick={onClose}>
      <div className="rounded-2xl w-full max-w-md mx-4 overflow-hidden" style={{ background: "#fff", boxShadow: "0 20px 60px rgba(22,31,51,0.18)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #F1F5F9" }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: ss.bg, color: ss.color, border: `1px solid ${ss.border}` }}>{task.status}</span>
            <span className="text-xs font-semibold" style={{ color: ps.color }}>● {task.priority}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <h3 className="text-base font-bold" style={{ color: "#191F28" }}>{task.title}</h3>
          {task.description && <p className="text-sm leading-relaxed" style={{ color: "#475569" }}>{task.description}</p>}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ background: ac }}>{task.assignee[0]}</div>
              <span className="text-sm font-medium" style={{ color: "#475569" }}>{task.assignee}</span>
            </div>
            {ts && task.tag && <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: ts.bg, color: ts.color }}>{task.tag}</span>}
            {task.dueDate && (
              <Link href="/marketing/calendar"
                className="flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-lg transition-colors hover:bg-slate-50"
                style={{ color: "#3182F6", border: "1px solid rgba(49,130,246,0.2)" }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                캘린더에서 보기 · {task.dueDate}
              </Link>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: "#64748B" }}>상태 변경</p>
            <div className="flex gap-2 flex-wrap">
              {STATUSES.map((s) => (
                <button key={s} onClick={() => updateTask(task.id, { status: s })}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
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
        </div>
        <div className="flex justify-between px-6 py-4" style={{ borderTop: "1px solid #F1F5F9" }}>
          <button onClick={() => { deleteTask(task.id); onClose(); }} className="px-3 py-1.5 rounded-xl text-xs font-semibold" style={{ background: "rgba(239,68,68,0.08)", color: "#EF4444" }}>삭제</button>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: "#F8FAFC", color: "#64748B", border: "1px solid #E9EBEF" }}>닫기</button>
        </div>
      </div>
    </div>
  );
}

// ─── 담당자 컬럼 ─────────────────────────────────────────────
function AssigneeColumn({ assignee, tasks, filterStatus, onAddClick, onCardClick }: {
  assignee: string; tasks: Task[]; filterStatus: Status | "전체";
  onAddClick: (a: string) => void; onCardClick: (t: Task) => void;
}) {
  const shown  = filterStatus === "전체" ? tasks : tasks.filter((t) => t.status === filterStatus);
  const color  = AVATAR_COLORS[assignee] ?? "#64748B";
  const done   = tasks.filter((t) => t.status === "완료").length;
  const pct    = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
  const calLen = tasks.filter((t) => t.dueDate).length;

  return (
    <div className="flex flex-col rounded-2xl overflow-hidden shrink-0" style={{ width: 280, background: "#F8FAFC", border: "1px solid #E9EBEF" }}>
      <div className="px-4 py-3.5" style={{ borderBottom: "1px solid #E9EBEF", background: "#fff" }}>
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black text-white shrink-0" style={{ background: color }}>
              {assignee[0]}
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: "#191F28" }}>{assignee}</p>
              <div className="flex items-center gap-1.5">
                <p className="text-xs" style={{ color: "#94A3B8" }}>{tasks.length}개 업무</p>
                {calLen > 0 && (
                  <span className="flex items-center gap-0.5 text-xs" style={{ color: "#3182F6" }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    {calLen}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={() => onAddClick(assignee)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs" style={{ color: "#94A3B8" }}>진행률</span>
            <span className="text-xs font-bold" style={{ color }}>{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#E9EBEF" }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2.5 p-3 overflow-y-auto" style={{ maxHeight: "calc(100vh - 280px)", minHeight: 80 }}>
        {shown.length === 0
          ? <div className="py-6 text-center text-xs" style={{ color: "#CBD5E1" }}>업무가 없습니다.</div>
          : shown.map((t) => <TaskCard key={t.id} task={t} onClick={() => onCardClick(t)} />)
        }
      </div>
      <button onClick={() => onAddClick(assignee)}
        className="mx-3 mb-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
        style={{ border: `1px dashed ${color}60`, color, background: `${color}06` }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = `${color}12`; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = `${color}06`; }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        업무 추가
      </button>
    </div>
  );
}

// ─── 메인 ───────────────────────────────────────────────────
function BoardView() {
  const { tasks, addTask } = useMarketing();
  const [filterStatus,   setFilterStatus]   = useState<Status | "전체">("전체");
  const [filterAssignee, setFilterAssignee] = useState("전체");
  const [addModal,    setAddModal]    = useState<string | null>(null);
  const [detailTask,  setDetailTask]  = useState<Task | null>(null);

  const shownAssignees = filterAssignee === "전체" ? ASSIGNEES : [filterAssignee];
  const totalTasks = tasks.length;
  const doneTasks  = tasks.filter((t) => t.status === "완료").length;

  return (
    <div className="space-y-4">
      {addModal !== null && (
        <AddTaskModal defaultAssignee={addModal} onClose={() => setAddModal(null)} onAdd={(t) => addTask(t)} />
      )}
      {detailTask && (
        <TaskDetailModal task={detailTask} onClose={() => setDetailTask(null)} />
      )}

      {/* 보드 헤더 */}
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: "#94A3B8" }}>
          담당자별 업무 현황 · {totalTasks}건 중 완료 {doneTasks}건
        </p>
        <button onClick={() => setAddModal(ASSIGNEES[0])}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity"
          style={{ background: "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          업무 추가
        </button>
      </div>

      {/* 필터 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 p-0.5 rounded-xl" style={{ background: "#F1F5F9" }}>
          {(["전체", ...STATUSES] as (Status | "전체")[]).map((s) => {
            const isActive = filterStatus === s;
            const style = s !== "전체" ? STATUS_STYLE[s] : null;
            return (
              <button key={s} onClick={() => setFilterStatus(s)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{ background: isActive ? "#fff" : "transparent", color: isActive ? (style?.color ?? "#191F28") : "#94A3B8", boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}>
                {s}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {["전체", ...ASSIGNEES].map((a) => {
            const isActive = filterAssignee === a;
            const color = a !== "전체" ? (AVATAR_COLORS[a] ?? "#64748B") : "#191F28";
            return (
              <button key={a} onClick={() => setFilterAssignee(a)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                style={{ background: isActive ? `${color}15` : "#F8FAFC", color: isActive ? color : "#94A3B8", border: `1px solid ${isActive ? `${color}40` : "#E9EBEF"}` }}>
                {a !== "전체" && <span className="w-2 h-2 rounded-full" style={{ background: isActive ? color : "#CBD5E1" }} />}
                {a}
              </button>
            );
          })}
        </div>
      </div>

      {/* 칸반 보드 */}
      <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 400 }}>
        {shownAssignees.map((assignee) => (
          <AssigneeColumn key={assignee} assignee={assignee}
            tasks={tasks.filter((t) => t.assignee === assignee)}
            filterStatus={filterStatus}
            onAddClick={setAddModal}
            onCardClick={setDetailTask} />
        ))}
      </div>
    </div>
  );
}

export default function BoardPage() {
  const [pageTab, setPageTab] = useState<PageTab>("calendar");

  const PAGE_TABS: { key: PageTab; label: string; icon: React.ReactNode }[] = [
    {
      key: "calendar", label: "캘린더",
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    },
    {
      key: "board", label: "담당자별 업무",
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
    },
  ];

  return (
    <div className="space-y-5">
      {/* 페이지 헤더 + 탭 */}
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "#191F28" }}>프로젝트 보드</h1>
          <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>캘린더와 담당자별 업무에서 업무를 관리합니다.</p>
        </div>
        {/* 탭 스위처 */}
        <div className="flex items-center gap-1 p-1 rounded-xl self-start" style={{ background: "#F1F5F9" }}>
          {PAGE_TABS.map((t) => {
            const isActive = pageTab === t.key;
            return (
              <button key={t.key} onClick={() => setPageTab(t.key)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: isActive ? "#FFFFFF" : "transparent",
                  color:      isActive ? "#191F28" : "#94A3B8",
                  boxShadow:  isActive ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                }}>
                <span style={{ color: isActive ? "#3182F6" : "#CBD5E1" }}>{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 탭 콘텐츠 */}
      {pageTab === "calendar" && <CalendarPage asTab />}
      {pageTab === "board"    && <BoardView />}
    </div>
  );
}
