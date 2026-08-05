"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/fetch-json";
import { TEAMS } from "@/lib/teams";

type Role   = "Admin" | "Manager" | "Staff";
type Status = "활성" | "비활성";

interface AppUser {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: Role;
  team: string | null;
  position: string | null;
  phone: string | null;
  workPhone: string | null;
  status: Status;
  joinedAt: string;
  annualLeaveDays: number;
}

const ROLES: Role[]       = ["Admin", "Manager", "Staff"];

const ROLE_STYLE: Record<Role, { bg: string; color: string }> = {
  Admin:   { bg: "rgba(139,92,246,0.1)",  color: "#7C3AED" },
  Manager: { bg: "rgba(49,130,246,0.1)",  color: "#1D4ED8" },
  Staff:   { bg: "rgba(100,116,139,0.1)", color: "#475569" },
};

function initials(name: string) {
  return name.trim().slice(0, 2);
}
function avatarColor(name: string) {
  const COLORS = ["#3182F6","#6366F1","#10B981","#F59E0B","#EF4444","#8B5CF6","#06B6D4"];
  let h = 0;
  for (const c of name) h = (c.charCodeAt(0) + h * 31) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

interface FormState {
  name: string; email: string; role: Role;
  team: string; position: string; phone: string; workPhone: string; status: Status; joinedAt: string;
  username: string; password: string; annualLeaveDays: string;
}

function emptyForm(): FormState {
  return {
    name: "", email: "", role: "Staff", team: "",
    position: "", phone: "", workPhone: "", status: "활성",
    joinedAt: new Date().toISOString().slice(0, 10),
    username: "", password: "", annualLeaveDays: "15",
  };
}

function UserModal({
  initial, onClose, onSaved,
}: {
  initial: AppUser | null;
  onClose: () => void;
  onSaved: (u: AppUser) => void;
}) {
  const isEdit = Boolean(initial);
  const [form, setForm] = useState<FormState>(
    initial
      ? { name: initial.name, email: initial.email, role: initial.role,
          team: initial.team ?? "", position: initial.position ?? "",
          phone: initial.phone ?? "", workPhone: initial.workPhone ?? "",
          status: initial.status, joinedAt: initial.joinedAt,
          username: initial.username ?? "", password: "",
          annualLeaveDays: String(initial.annualLeaveDays ?? 15) }
      : emptyForm()
  );
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const set = (k: keyof FormState, v: string) => setForm(p => ({ ...p, [k]: v }));
  const inp = "w-full px-3 py-2 text-sm rounded-xl outline-none border transition-colors focus:border-[#3182F6]";
  const inpS = { background: "#F8FAFC", borderColor: "#E9EBEF", color: "#191F28" };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) { setError("이름과 이메일은 필수입니다."); return; }
    setSaving(true); setError(null);
    const url    = isEdit ? `/api/users/${initial!.id}` : "/api/users";
    const method = isEdit ? "PATCH" : "POST";
    const body: Record<string, unknown> = {
      name: form.name, email: form.email, role: form.role,
      team: form.team || null, position: form.position || null,
      phone: form.phone || null, workPhone: form.workPhone || null, status: form.status, joinedAt: form.joinedAt,
      username: form.username.trim() || null,
      annualLeaveDays: form.annualLeaveDays === "" ? 15 : Number(form.annualLeaveDays),
    };
    if (form.password) body.password = form.password;
    const res = await fetch(url, {
      method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "저장에 실패했습니다.");
      setSaving(false); return;
    }
    const data = await res.json();
    onSaved(data.user);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(22,31,51,0.45)", backdropFilter: "blur(2px)" }}
      onClick={onClose}>
      <div className="w-full max-w-md mx-4 rounded-2xl overflow-hidden"
        style={{ background: "#fff", boxShadow: "0 20px 60px rgba(22,31,51,0.2)" }}
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #F1F5F9" }}>
          <h2 className="text-base font-bold" style={{ color: "#191F28" }}>
            {isEdit ? "사용자 수정" : "사용자 등록"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>이름 *</label>
              <input value={form.name} onChange={e => set("name", e.target.value)}
                placeholder="홍길동" className={inp} style={inpS} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>이메일 *</label>
              <input type="email" value={form.email} onChange={e => set("email", e.target.value)}
                placeholder="user@diverz.com" className={inp} style={inpS} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>권한</label>
              <select value={form.role} onChange={e => set("role", e.target.value as Role)} className={inp} style={inpS}>
                {ROLES.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>소속 팀</label>
              <select value={form.team} onChange={e => set("team", e.target.value)} className={inp} style={inpS}>
                <option value="">선택 안함</option>
                {TEAMS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>직책</label>
              <input value={form.position} onChange={e => set("position", e.target.value)}
                placeholder="팀장, 매니저…" className={inp} style={inpS} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>입사일</label>
              <input type="date" value={form.joinedAt} onChange={e => set("joinedAt", e.target.value)}
                className={inp} style={inpS} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>휴대폰 번호</label>
              <input type="tel" value={form.phone} onChange={e => set("phone", e.target.value)}
                placeholder="010-0000-0000" className={inp} style={inpS} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>업무폰 번호</label>
              <input type="tel" value={form.workPhone} onChange={e => set("workPhone", e.target.value)}
                placeholder="02-0000-0000" className={inp} style={inpS} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>연차 부여일수</label>
              <input type="number" min="0" step="0.5" value={form.annualLeaveDays}
                onChange={e => set("annualLeaveDays", e.target.value)}
                placeholder="15" className={inp} style={inpS} />
            </div>
            <p className="text-xs pb-2.5" style={{ color: "#94A3B8" }}>
              휴가 결재에서 차감 기준이 되는 연간 부여일수입니다.
            </p>
          </div>

          <div style={{ borderTop: "1px solid #F1F5F9", paddingTop: "1rem" }}>
            <p className="text-xs font-semibold mb-3" style={{ color: "#94A3B8" }}>로그인 정보</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>아이디</label>
                <input value={form.username} onChange={e => set("username", e.target.value)}
                  placeholder="로그인 아이디" className={inp} style={inpS} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>
                  {isEdit ? "새 비밀번호" : "비밀번호"}
                </label>
                <input type="password" value={form.password} onChange={e => set("password", e.target.value)}
                  placeholder={isEdit ? "변경 시 입력 (선택)" : "비밀번호 입력"} className={inp} style={inpS} />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>상태</label>
            <div className="flex gap-2">
              {(["활성", "비활성"] as Status[]).map(s => (
                <button key={s} type="button" onClick={() => set("status", s)}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    background: form.status === s
                      ? s === "활성" ? "rgba(16,185,129,0.1)" : "rgba(148,163,184,0.1)"
                      : "#F8FAFC",
                    color: form.status === s
                      ? s === "활성" ? "#059669" : "#64748B"
                      : "#B0B8C1",
                    border: `1px solid ${form.status === s
                      ? s === "활성" ? "rgba(16,185,129,0.3)" : "#CBD5E1"
                      : "#E9EBEF"}`,
                  }}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-xs" style={{ color: "#EF4444" }}>{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors hover:bg-slate-50"
              style={{ borderColor: "#E9EBEF", color: "#64748B" }}>
              취소
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" }}>
              {saving ? "저장 중..." : isEdit ? "수정 완료" : "등록"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const router = useRouter();
  const [users,       setUsers]       = useState<AppUser[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [modal,       setModal]       = useState<"add" | AppUser | null>(null);
  const [filterRole,  setFilterRole]  = useState<Role | "전체">("전체");
  const [filterTeam,  setFilterTeam]  = useState("전체");
  const [filterStatus, setFilterStatus] = useState<Status | "전체">("전체");
  const [search,      setSearch]      = useState("");
  const [confirmDel,  setConfirmDel]  = useState<AppUser | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchJson<{ users?: AppUser[] }>("/api/users")
      .then(d => setUsers(d.users ?? []))
      // 실패를 "사용자 없음"으로 보여주면 안 된다
      .catch((e: Error) => { setError(e.message); setUsers([]); })
      .finally(() => setLoading(false));
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { load(); }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const teams = ["전체", ...Array.from(new Set(users.map(u => u.team).filter(Boolean) as string[]))];

  const filtered = users.filter(u => {
    if (filterRole   !== "전체" && u.role   !== filterRole)   return false;
    if (filterTeam   !== "전체" && u.team   !== filterTeam)   return false;
    if (filterStatus !== "전체" && u.status !== filterStatus) return false;
    if (search && !u.name.includes(search) && !u.email.includes(search) && !(u.username?.includes(search))) return false;
    return true;
  });

  async function handleToggleStatus(u: AppUser) {
    const newStatus: Status = u.status === "활성" ? "비활성" : "활성";
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...u, status: newStatus }),
    });
    const data = await res.json();
    setUsers(p => p.map(x => x.id === u.id ? data.user : x));
  }

  async function handleDelete(u: AppUser) {
    await fetch(`/api/users/${u.id}`, { method: "DELETE" });
    setUsers(p => p.filter(x => x.id !== u.id));
    setConfirmDel(null);
  }

  function handleSaved(u: AppUser) {
    setUsers(p => {
      const idx = p.findIndex(x => x.id === u.id);
      if (idx >= 0) { const next = [...p]; next[idx] = u; return next; }
      return [...p, u];
    });
  }

  const activeCount   = users.filter(u => u.status === "활성").length;
  const inactiveCount = users.filter(u => u.status === "비활성").length;

  return (
    <div className="space-y-5">

      {modal && (
        <UserModal
          initial={modal === "add" ? null : modal}
          onClose={() => setModal(null)}
          onSaved={(u) => { handleSaved(u); setModal(null); }}
        />
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(22,31,51,0.45)" }}
          onClick={() => setConfirmDel(null)}>
          <div className="w-full max-w-sm mx-4 rounded-2xl p-6"
            style={{ background: "#fff", boxShadow: "0 20px 60px rgba(22,31,51,0.2)" }}
            onClick={e => e.stopPropagation()}>
            <p className="text-base font-bold mb-2" style={{ color: "#191F28" }}>사용자 삭제</p>
            <p className="text-sm mb-5" style={{ color: "#64748B" }}>
              <span className="font-semibold" style={{ color: "#191F28" }}>{confirmDel.name}</span> 님을 삭제할까요?<br/>이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDel(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border"
                style={{ borderColor: "#E9EBEF", color: "#64748B" }}>취소</button>
              <button onClick={() => handleDelete(confirmDel)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: "#EF4444" }}>삭제</button>
            </div>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "#191F28" }}>사용자 관리</h1>
          <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>
            총 {users.length}명 · 활성 {activeCount}명 · 비활성 {inactiveCount}명
          </p>
        </div>
        <button onClick={() => router.push("/users/new")}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity"
          style={{ background: "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          멤버 등록
        </button>
      </div>

      {/* 필터 */}
      <div className="flex items-center gap-3 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="이름 또는 이메일 검색"
          className="px-3 py-2 text-sm rounded-xl outline-none border transition-colors focus:border-[#3182F6]"
          style={{ background: "#F8FAFC", borderColor: "#E9EBEF", color: "#191F28", width: 200 }} />

        <div className="flex gap-1 p-0.5 rounded-xl" style={{ background: "#F1F5F9" }}>
          {(["전체", ...ROLES] as (Role | "전체")[]).map(r => (
            <button key={r} onClick={() => setFilterRole(r)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: filterRole === r ? "#fff" : "transparent",
                color: filterRole === r ? (r !== "전체" ? ROLE_STYLE[r as Role].color : "#191F28") : "#94A3B8",
                boxShadow: filterRole === r ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}>
              {r}
            </button>
          ))}
        </div>

        <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)}
          className="px-3 py-2 text-xs rounded-xl border outline-none transition-colors"
          style={{ background: "#F8FAFC", borderColor: "#E9EBEF", color: "#64748B" }}>
          {teams.map(t => <option key={t}>{t}</option>)}
        </select>

        <div className="flex gap-1 p-0.5 rounded-xl" style={{ background: "#F1F5F9" }}>
          {(["전체", "활성", "비활성"] as (Status | "전체")[]).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: filterStatus === s ? "#fff" : "transparent",
                color: filterStatus === s ? "#191F28" : "#94A3B8",
                boxShadow: filterStatus === s ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* 테이블 */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E9EBEF" }}>
              {["사용자", "휴대폰 번호", "권한", "소속 팀", "직책", "입사일", "연차", "상태", ""].map(h => (
                <th key={h} className="px-5 py-3 text-left text-xs font-semibold" style={{ color: "#64748B" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="py-16 text-center text-sm" style={{ color: "#94A3B8" }}>불러오는 중...</td></tr>
            ) : error ? (
              <tr><td colSpan={9} className="py-16 text-center">
                <p className="text-sm font-semibold" style={{ color: "#EF4444" }}>{error}</p>
                <p className="text-xs mt-1" style={{ color: "#94A3B8" }}>데이터가 없는 것으로 잘못 보이지 않도록 표시를 중단했습니다.</p>
                <button onClick={load} className="mt-3 px-4 py-1.5 text-sm font-semibold rounded-lg" style={{ background: "#3182F6", color: "#fff" }}>다시 시도</button>
              </td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="py-16 text-center text-sm" style={{ color: "#94A3B8" }}>
                {users.length === 0 ? "등록된 사용자가 없습니다." : "검색 결과가 없습니다."}
              </td></tr>
            ) : filtered.map(u => {
              const rs = ROLE_STYLE[u.role as Role] ?? ROLE_STYLE.Staff;
              const isActive = u.status === "활성";
              return (
                <tr key={u.id} className="border-t" style={{ borderColor: "#F1F5F9" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(49,130,246,0.02)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>

                  {/* 사용자 */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0"
                        style={{ background: isActive ? avatarColor(u.name) : "#CBD5E1" }}>
                        {initials(u.name)}
                      </div>
                      <div>
                        <div className="font-semibold" style={{ color: isActive ? "#191F28" : "#94A3B8" }}>{u.name}</div>
                        {u.username && (
                          <div className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>@{u.username}</div>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>{u.phone || "—"}</td>

                  <td className="px-5 py-3.5">
                    <span className="text-xs font-semibold px-2 py-1 rounded-full"
                      style={{ background: rs.bg, color: rs.color }}>
                      {u.role}
                    </span>
                  </td>

                  <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>{u.team || "—"}</td>
                  <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>{u.position || "—"}</td>
                  <td className="px-5 py-3.5 text-xs" style={{ color: "#94A3B8" }}>{u.joinedAt}</td>
                  <td className="px-5 py-3.5 text-xs font-medium" style={{ color: "#475569" }}>{u.annualLeaveDays ?? 15}일</td>

                  <td className="px-5 py-3.5">
                    <button onClick={() => handleToggleStatus(u)}
                      className="text-xs font-semibold px-2.5 py-1 rounded-full transition-colors"
                      style={{
                        background: isActive ? "rgba(16,185,129,0.1)" : "rgba(148,163,184,0.1)",
                        color:      isActive ? "#059669" : "#64748B",
                      }}>
                      {u.status}
                    </button>
                  </td>

                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setModal(u)}
                        className="p-1.5 rounded-lg transition-colors hover:bg-slate-100"
                        title="수정">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button onClick={() => setConfirmDel(u)}
                        className="p-1.5 rounded-lg transition-colors hover:bg-red-50"
                        title="삭제">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
