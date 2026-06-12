"use client";

import { useState, useEffect, useRef } from "react";
import { useUser } from "@/lib/UserContext";

type Priority = "low" | "medium" | "high";

interface Todo {
  id: string;
  content: string;
  isDone: boolean;
  priority: Priority;
  dueDate: string | null;
  createdAt: string;
}

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; bg: string }> = {
  high:   { label: "높음", color: "#EF4444", bg: "rgba(239,68,68,0.08)"   },
  medium: { label: "중간", color: "#F97316", bg: "rgba(249,115,22,0.08)"  },
  low:    { label: "낮음", color: "#64748B", bg: "rgba(100,116,139,0.08)" },
};

const inp = "w-full px-3.5 py-2.5 text-sm rounded-xl outline-none border transition-colors focus:border-[#3182F6]";
const inpS = { background: "#F8FAFC", borderColor: "#E9EBEF", color: "#191F28" };

export default function MyPage() {
  const { name: userName } = useUser();

  // 비밀번호 변경
  const [pwForm, setPwForm]   = useState({ current: "", next: "", confirm: "" });
  const [pwMsg,  setPwMsg]    = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  // To Do List
  const [todos,    setTodos]    = useState<Todo[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [input,    setInput]    = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueDate,  setDueDate]  = useState("");
  const [adding,   setAdding]   = useState(false);
  const [filter,   setFilter]   = useState<"all" | "active" | "done">("all");
  const [editId,   setEditId]   = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/todos")
      .then((r) => r.json())
      .then((d) => setTodos(d.todos ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function handlePwSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (!pwForm.current || !pwForm.next) { setPwMsg({ type: "err", text: "모든 항목을 입력해주세요." }); return; }
    if (pwForm.next.length < 6) { setPwMsg({ type: "err", text: "새 비밀번호는 6자 이상이어야 합니다." }); return; }
    if (pwForm.next !== pwForm.confirm) { setPwMsg({ type: "err", text: "새 비밀번호가 일치하지 않습니다." }); return; }

    setPwSaving(true);
    try {
      const res = await fetch("/api/mypage/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }),
      });
      const d = await res.json();
      if (res.ok) {
        setPwMsg({ type: "ok", text: "비밀번호가 변경되었습니다." });
        setPwForm({ current: "", next: "", confirm: "" });
      } else {
        setPwMsg({ type: "err", text: d.error ?? "오류가 발생했습니다." });
      }
    } catch {
      setPwMsg({ type: "err", text: "네트워크 오류가 발생했습니다." });
    } finally {
      setPwSaving(false);
    }
  }

  async function addTodo() {
    if (!input.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: input.trim(), priority, dueDate: dueDate || null }),
      });
      const d = await res.json();
      if (res.ok) {
        setTodos((p) => [...p, d.todo]);
        setInput("");
        setDueDate("");
        setPriority("medium");
        inputRef.current?.focus();
      }
    } finally {
      setAdding(false);
    }
  }

  async function toggleDone(todo: Todo) {
    const res = await fetch(`/api/todos/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDone: !todo.isDone }),
    });
    if (res.ok) {
      setTodos((p) => p.map((t) => t.id === todo.id ? { ...t, isDone: !t.isDone } : t));
    }
  }

  async function deleteTodo(id: string) {
    await fetch(`/api/todos/${id}`, { method: "DELETE" });
    setTodos((p) => p.filter((t) => t.id !== id));
  }

  async function saveEdit(id: string) {
    if (!editText.trim()) return;
    const res = await fetch(`/api/todos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: editText.trim() }),
    });
    if (res.ok) {
      setTodos((p) => p.map((t) => t.id === id ? { ...t, content: editText.trim() } : t));
      setEditId(null);
    }
  }

  async function changePriority(todo: Todo, p: Priority) {
    const res = await fetch(`/api/todos/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priority: p }),
    });
    if (res.ok) {
      setTodos((prev) => prev.map((t) => t.id === todo.id ? { ...t, priority: p } : t));
    }
  }

  const filtered = todos.filter((t) =>
    filter === "all" ? true : filter === "active" ? !t.isDone : t.isDone
  );
  const doneCount   = todos.filter((t) => t.isDone).length;
  const activeCount = todos.filter((t) => !t.isDone).length;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">

      {/* 프로필 헤더 */}
      <div className="flex items-center gap-4 px-6 py-5 rounded-2xl"
        style={{ background: "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" }}>
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold"
          style={{ background: "rgba(255,255,255,0.2)" }}>
          {userName?.slice(0, 1) ?? "?"}
        </div>
        <div>
          <p className="text-lg font-bold text-white">{userName}</p>
          <p className="text-sm text-white/70 mt-0.5">마이페이지</p>
        </div>
      </div>

      {/* 비밀번호 변경 */}
      <div className="rounded-2xl p-6 space-y-4" style={{ background: "#FFFFFF", border: "1px solid #E9EBEF" }}>
        <div className="flex items-center gap-2 mb-1">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3182F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <p className="text-sm font-bold" style={{ color: "#191F28" }}>비밀번호 변경</p>
        </div>

        <form onSubmit={handlePwSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#475569" }}>현재 비밀번호</label>
            <input
              type="password"
              value={pwForm.current}
              onChange={(e) => setPwForm((p) => ({ ...p, current: e.target.value }))}
              placeholder="현재 비밀번호 입력"
              autoComplete="current-password"
              className={inp} style={inpS}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#475569" }}>새 비밀번호</label>
              <input
                type="password"
                value={pwForm.next}
                onChange={(e) => setPwForm((p) => ({ ...p, next: e.target.value }))}
                placeholder="6자 이상"
                autoComplete="new-password"
                className={inp} style={inpS}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#475569" }}>새 비밀번호 확인</label>
              <input
                type="password"
                value={pwForm.confirm}
                onChange={(e) => setPwForm((p) => ({ ...p, confirm: e.target.value }))}
                placeholder="새 비밀번호 재입력"
                autoComplete="new-password"
                className={inp}
                style={{
                  ...inpS,
                  borderColor: pwForm.confirm && pwForm.next !== pwForm.confirm ? "#EF4444" : "#E9EBEF",
                }}
              />
            </div>
          </div>

          {pwMsg && (
            <div className="px-4 py-2.5 rounded-xl text-xs font-medium"
              style={{
                background: pwMsg.type === "ok" ? "rgba(16,185,129,0.07)" : "rgba(239,68,68,0.07)",
                color:      pwMsg.type === "ok" ? "#059669" : "#EF4444",
                border: `1px solid ${pwMsg.type === "ok" ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}`,
              }}>
              {pwMsg.text}
            </div>
          )}

          <button
            type="submit"
            disabled={pwSaving}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" }}>
            {pwSaving ? "변경 중..." : "비밀번호 변경"}
          </button>
        </form>
      </div>

      {/* To Do List */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E9EBEF" }}>

        {/* 헤더 */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid #F1F5F9" }}>
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3182F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
            <p className="text-sm font-bold" style={{ color: "#191F28" }}>To Do List</p>
          </div>
          <div className="flex items-center gap-1 text-xs" style={{ color: "#94A3B8" }}>
            <span className="font-semibold" style={{ color: "#3182F6" }}>{activeCount}</span>개 남음 / 전체 {todos.length}개
          </div>
        </div>

        {/* 입력 */}
        <div className="px-6 py-4 space-y-2.5" style={{ borderBottom: "1px solid #F1F5F9", background: "#F8FAFC" }}>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addTodo(); } }}
              placeholder="새 할 일을 입력하세요 (Enter로 추가)"
              className="flex-1 px-3.5 py-2 text-sm rounded-xl outline-none border transition-colors focus:border-[#3182F6]"
              style={{ background: "#FFFFFF", borderColor: "#E9EBEF", color: "#191F28" }}
            />
            <button
              onClick={addTodo}
              disabled={adding || !input.trim()}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 shrink-0"
              style={{ background: "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" }}>
              추가
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {(["low", "medium", "high"] as Priority[]).map((p) => {
                const cfg = PRIORITY_CONFIG[p];
                const selected = priority === p;
                return (
                  <button key={p} onClick={() => setPriority(p)}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      background: selected ? cfg.bg : "transparent",
                      color:      selected ? cfg.color : "#94A3B8",
                      border: `1px solid ${selected ? cfg.color + "40" : "#E9EBEF"}`,
                    }}>
                    {cfg.label}
                  </button>
                );
              })}
            </div>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="ml-auto px-2.5 py-1 text-xs rounded-lg border outline-none focus:border-[#3182F6] transition-colors"
              style={{ background: "#FFFFFF", borderColor: "#E9EBEF", color: "#64748B" }}
            />
          </div>
        </div>

        {/* 필터 탭 */}
        <div className="flex px-6 pt-3 gap-1" style={{ borderBottom: "1px solid #F1F5F9" }}>
          {([
            { key: "all",    label: `전체 ${todos.length}` },
            { key: "active", label: `진행 중 ${activeCount}` },
            { key: "done",   label: `완료 ${doneCount}` },
          ] as { key: typeof filter; label: string }[]).map(({ key, label }) => (
            <button key={key} onClick={() => setFilter(key)}
              className="px-3 py-2 text-xs font-semibold transition-colors rounded-t-lg"
              style={{
                color:        filter === key ? "#3182F6" : "#94A3B8",
                borderBottom: filter === key ? "2px solid #3182F6" : "2px solid transparent",
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* 목록 */}
        <div className="divide-y" style={{ divideColor: "#F1F5F9" }}>
          {loading ? (
            <div className="py-12 text-center text-sm" style={{ color: "#94A3B8" }}>불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <svg className="mx-auto mb-2" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
              <p className="text-sm" style={{ color: "#94A3B8" }}>
                {filter === "done" ? "완료된 할 일이 없습니다" : "할 일을 추가해보세요"}
              </p>
            </div>
          ) : (
            filtered.map((todo) => {
              const cfg = PRIORITY_CONFIG[todo.priority as Priority] ?? PRIORITY_CONFIG.medium;
              const isEditing = editId === todo.id;
              return (
                <div key={todo.id}
                  className="flex items-start gap-3 px-6 py-3.5 group transition-colors hover:bg-slate-50"
                  style={{ borderColor: "#F1F5F9" }}>

                  {/* 체크박스 */}
                  <button
                    onClick={() => toggleDone(todo)}
                    className="mt-0.5 shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all"
                    style={{
                      borderColor:  todo.isDone ? "#3182F6" : "#D1D5DB",
                      background:   todo.isDone ? "#3182F6" : "transparent",
                    }}>
                    {todo.isDone && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </button>

                  {/* 내용 */}
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <input
                        autoFocus
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(todo.id);
                          if (e.key === "Escape") setEditId(null);
                        }}
                        onBlur={() => saveEdit(todo.id)}
                        className="w-full text-sm px-2 py-0.5 rounded-lg border outline-none"
                        style={{ borderColor: "#3182F6", color: "#191F28", background: "#F8FAFC" }}
                      />
                    ) : (
                      <p className="text-sm leading-snug"
                        style={{
                          color:          todo.isDone ? "#94A3B8" : "#191F28",
                          textDecoration: todo.isDone ? "line-through" : "none",
                        }}>
                        {todo.content}
                      </p>
                    )}

                    <div className="flex items-center gap-2 mt-1">
                      {/* 우선순위 배지 */}
                      <span className="text-xs px-1.5 py-0.5 rounded-md font-medium"
                        style={{ color: cfg.color, background: cfg.bg }}>
                        {cfg.label}
                      </span>
                      {/* 우선순위 변경 */}
                      <div className="hidden group-hover:flex gap-1">
                        {(["low", "medium", "high"] as Priority[]).filter((p) => p !== todo.priority).map((p) => (
                          <button key={p} onClick={() => changePriority(todo, p)}
                            className="text-xs px-1.5 py-0.5 rounded-md transition-colors"
                            style={{ color: "#B0B8C1", background: "#F1F5F9" }}>
                            {PRIORITY_CONFIG[p].label}
                          </button>
                        ))}
                      </div>
                      {/* 마감일 */}
                      {todo.dueDate && (
                        <span className="text-xs" style={{ color: "#94A3B8" }}>
                          {new Date(todo.dueDate).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })} 마감
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 액션 버튼 */}
                  <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => { setEditId(todo.id); setEditText(todo.content); }}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: "#94A3B8" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#F1F5F9"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                    <button
                      onClick={() => deleteTodo(todo.id)}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: "#EF4444" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.08)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 완료 항목 일괄 삭제 */}
        {doneCount > 0 && (
          <div className="px-6 py-3 flex justify-end" style={{ borderTop: "1px solid #F1F5F9" }}>
            <button
              onClick={async () => {
                const doneIds = todos.filter((t) => t.isDone).map((t) => t.id);
                await Promise.all(doneIds.map((id) => fetch(`/api/todos/${id}`, { method: "DELETE" })));
                setTodos((p) => p.filter((t) => !t.isDone));
              }}
              className="text-xs font-medium transition-colors"
              style={{ color: "#94A3B8" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#EF4444"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#94A3B8"; }}>
              완료 항목 모두 삭제 ({doneCount})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
