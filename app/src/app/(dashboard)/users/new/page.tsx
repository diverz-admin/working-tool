"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Role   = "Admin" | "Manager" | "Staff";
type Status = "활성" | "비활성";

const ROLES: Role[]   = ["Admin", "Manager", "Staff"];
const TEAMS           = ["영업 1팀", "영업 2팀", "운영팀", "기타"];
const POSITIONS       = ["대표", "팀장", "매니저", "사원", "인턴"];

const ROLE_DESC: Record<Role, string> = {
  Admin:   "전체 시스템 접근 및 설정 관리",
  Manager: "팀 관리 및 주요 기능 접근",
  Staff:   "기본 업무 기능 접근",
};

interface FormState {
  name: string;
  email: string;
  role: Role;
  team: string;
  position: string;
  status: Status;
  joinedAt: string;
  phone: string;
  username: string;
  password: string;
  passwordConfirm: string;
}

function emptyForm(): FormState {
  return {
    name: "", email: "", role: "Staff", team: "",
    position: "", phone: "", status: "활성",
    joinedAt: new Date().toISOString().slice(0, 10),
    username: "", password: "", passwordConfirm: "",
  };
}

const inp  = "w-full px-3.5 py-2.5 text-sm rounded-xl outline-none border transition-colors focus:border-[#3182F6]";
const inpS = { background: "#F8FAFC", borderColor: "#E9EBEF", color: "#191F28" };

export default function NewUserPage() {
  const router = useRouter();
  const [form,   setForm]   = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const set = (k: keyof FormState, v: string) => setForm(p => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim())  { setError("이름을 입력해주세요."); return; }
    if (!form.email.trim()) { setError("이메일을 입력해주세요."); return; }
    if (form.password && form.password !== form.passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다."); return;
    }
    if (form.password && form.password.length < 6) {
      setError("비밀번호는 6자 이상이어야 합니다."); return;
    }

    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:     form.name,
          email:    form.email,
          role:     form.role,
          team:     form.team     || null,
          position: form.position || null,
          phone:    form.phone    || null,
          status:   form.status,
          joinedAt: form.joinedAt,
          username: form.username || null,
          password: form.password || null,
        }),
      });

      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? `서버 오류 (${res.status})`);
        setSaving(false);
        return;
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      setSaving(false);
      return;
    }

    router.push("/users");
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* 브레드크럼 */}
      <div className="flex items-center gap-2 text-xs" style={{ color: "#94A3B8" }}>
        <Link href="/users" className="hover:underline" style={{ color: "#3182F6" }}>멤버 목록</Link>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        <span>멤버 등록</span>
      </div>

      {/* 헤더 */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: "#191F28" }}>멤버 등록</h1>
        <p className="text-xs mt-1" style={{ color: "#94A3B8" }}>새로운 팀원 정보를 입력하고 등록하세요.</p>
      </div>

      <form onSubmit={submit} className="space-y-5">

        {/* 기본 정보 */}
        <div className="rounded-2xl p-6 space-y-4" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#94A3B8" }}>기본 정보</p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#475569" }}>
                이름 <span style={{ color: "#EF4444" }}>*</span>
              </label>
              <input
                value={form.name}
                onChange={e => set("name", e.target.value)}
                placeholder="홍길동"
                className={inp} style={inpS}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#475569" }}>
                이메일 <span style={{ color: "#EF4444" }}>*</span>
              </label>
              <input
                type="email"
                value={form.email}
                onChange={e => set("email", e.target.value)}
                placeholder="name@diverz.com"
                className={inp} style={inpS}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#475569" }}>소속 팀</label>
              <select value={form.team} onChange={e => set("team", e.target.value)} className={inp} style={inpS}>
                <option value="">선택 안함</option>
                {TEAMS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#475569" }}>직책</label>
              <div className="relative">
                <input
                  list="position-list"
                  value={form.position}
                  onChange={e => set("position", e.target.value)}
                  placeholder="팀장, 매니저…"
                  className={inp} style={inpS}
                />
                <datalist id="position-list">
                  {POSITIONS.map(p => <option key={p} value={p} />)}
                </datalist>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#475569" }}>휴대폰 번호</label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => set("phone", e.target.value)}
                placeholder="010-0000-0000"
                className={inp} style={inpS}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#475569" }}>입사일</label>
              <input
                type="date"
                value={form.joinedAt}
                onChange={e => set("joinedAt", e.target.value)}
                className={inp} style={inpS}
              />
            </div>
          </div>
        </div>

        {/* 로그인 정보 */}
        <div className="rounded-2xl p-6 space-y-4" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#94A3B8" }}>로그인 정보</p>
            <p className="text-xs mt-0.5" style={{ color: "#B0B8C1" }}>비워두면 로그인 불가 계정으로 등록됩니다.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#475569" }}>아이디</label>
            <input
              value={form.username}
              onChange={e => set("username", e.target.value)}
              placeholder="로그인 아이디"
              autoComplete="off"
              className={inp} style={inpS}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#475569" }}>비밀번호</label>
              <input
                type="password"
                value={form.password}
                onChange={e => set("password", e.target.value)}
                placeholder="6자 이상"
                autoComplete="new-password"
                className={inp} style={inpS}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#475569" }}>비밀번호 확인</label>
              <input
                type="password"
                value={form.passwordConfirm}
                onChange={e => set("passwordConfirm", e.target.value)}
                placeholder="비밀번호 재입력"
                autoComplete="new-password"
                className={inp}
                style={{
                  ...inpS,
                  borderColor: form.passwordConfirm && form.password !== form.passwordConfirm
                    ? "#EF4444" : "#E9EBEF",
                }}
              />
            </div>
          </div>
        </div>

        {/* 권한 */}
        <div className="rounded-2xl p-6 space-y-3" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#94A3B8" }}>권한</p>
          <div className="grid grid-cols-3 gap-3">
            {ROLES.map(r => {
              const selected = form.role === r;
              const colors: Record<Role, { ring: string; bg: string; text: string }> = {
                Admin:   { ring: "#7C3AED", bg: "rgba(139,92,246,0.07)", text: "#7C3AED" },
                Manager: { ring: "#3182F6", bg: "rgba(49,130,246,0.07)", text: "#3182F6" },
                Staff:   { ring: "#64748B", bg: "rgba(100,116,139,0.07)", text: "#64748B" },
              };
              const c = colors[r];
              return (
                <button
                  key={r} type="button"
                  onClick={() => set("role", r)}
                  className="p-4 rounded-xl text-left transition-all"
                  style={{
                    border: `1.5px solid ${selected ? c.ring : "#E9EBEF"}`,
                    background: selected ? c.bg : "#F8FAFC",
                  }}>
                  <p className="text-sm font-bold mb-1" style={{ color: selected ? c.text : "#475569" }}>{r}</p>
                  <p className="text-xs leading-snug" style={{ color: "#94A3B8" }}>{ROLE_DESC[r]}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* 상태 */}
        <div className="rounded-2xl p-6 space-y-3" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#94A3B8" }}>상태</p>
          <div className="flex gap-3">
            {(["활성", "비활성"] as Status[]).map(s => {
              const selected = form.status === s;
              const isActive = s === "활성";
              return (
                <button
                  key={s} type="button"
                  onClick={() => set("status", s)}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    border: `1.5px solid ${selected
                      ? isActive ? "rgba(16,185,129,0.4)" : "#CBD5E1"
                      : "#E9EBEF"}`,
                    background: selected
                      ? isActive ? "rgba(16,185,129,0.08)" : "rgba(148,163,184,0.08)"
                      : "#F8FAFC",
                    color: selected
                      ? isActive ? "#059669" : "#64748B"
                      : "#B0B8C1",
                  }}>
                  {s}
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl text-xs font-medium"
            style={{ background: "rgba(239,68,68,0.07)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.2)" }}>
            {error}
          </div>
        )}

        {/* 버튼 */}
        <div className="flex gap-3 pb-4">
          <Link href="/users"
            className="flex-1 py-3 rounded-xl text-sm font-semibold text-center border transition-colors hover:bg-slate-50"
            style={{ borderColor: "#E9EBEF", color: "#64748B" }}>
            취소
          </Link>
          <button
            type="submit" disabled={saving}
            className="flex-1 py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" }}>
            {saving ? "등록 중..." : "멤버 등록"}
          </button>
        </div>
      </form>
    </div>
  );
}
