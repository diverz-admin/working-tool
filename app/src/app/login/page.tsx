"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) { setError("아이디와 비밀번호를 입력해주세요."); return; }

    setLoading(true); setError(null);

    const res = await fetch("/api/auth/login", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ username: username.trim(), password }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "로그인에 실패했습니다.");
      setLoading(false);
      return;
    }

    // 헤더/사이드바에서 사용하기 위해 localStorage에도 저장
    if (data.user) {
      localStorage.setItem("diverz_user_role", data.user.role);
      localStorage.setItem("diverz_user_name", data.user.name);
      localStorage.setItem("diverz_user_team", data.user.team ?? "");
    }

    router.push("/dashboard");
  }

  const inp = [
    "w-full px-4 py-3 rounded-xl text-sm outline-none border transition-colors",
    "focus:border-[#3182F6]",
  ].join(" ");

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #F0F4FF 0%, #F8FAFC 100%)" }}
    >
      <div className="w-full max-w-sm">

        {/* 로고 */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl text-white text-xl font-black mb-4"
            style={{ background: "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" }}
          >
            D
          </div>
          <h1 className="text-xl font-black" style={{ color: "#191F28" }}>DIVERZ Work</h1>
          <p className="text-xs mt-1" style={{ color: "#94A3B8" }}>팀 협업 도구</p>
        </div>

        {/* 카드 */}
        <div
          className="rounded-2xl p-7"
          style={{ background: "#fff", boxShadow: "0 8px 40px rgba(22,31,51,0.10)", border: "1px solid #E9EBEF" }}
        >
          <h2 className="text-base font-bold mb-5" style={{ color: "#191F28" }}>로그인</h2>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#475569" }}>
                아이디
              </label>
              <input
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                placeholder="아이디 입력"
                className={inp}
                style={{ background: "#F8FAFC", borderColor: "#E9EBEF", color: "#191F28" }}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#475569" }}>
                비밀번호
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="비밀번호 입력"
                className={inp}
                style={{ background: "#F8FAFC", borderColor: "#E9EBEF", color: "#191F28" }}
              />
            </div>

            {error && (
              <div
                className="px-3.5 py-2.5 rounded-xl text-xs font-medium"
                style={{ background: "rgba(239,68,68,0.07)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.18)" }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 mt-1"
              style={{ background: "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" }}
            >
              {loading ? "로그인 중..." : "로그인"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-5" style={{ color: "#B0B8C1" }}>
          계정이 없다면 관리자에게 문의하세요.
        </p>
      </div>
    </div>
  );
}
