"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCurrentRole, type UserRole } from "@/lib/useCurrentRole";
import { useState, useEffect } from "react";

const pageTitles: Record<string, string> = {
  "/dashboard": "대시보드",
  "/projects": "프로젝트 관리",
  "/clients": "광고주 관리",
  "/products": "상품 관리",
  "/operations": "경영관리",
  "/reports": "매출 리포트",
  "/chat": "채팅",
  "/users": "사용자 관리",
};

function getTitle(pathname: string): string {
  const match = Object.keys(pageTitles)
    .sort((a, b) => b.length - a.length)
    .find((key) => pathname === key || pathname.startsWith(key + "/"));
  return match ? pageTitles[match] : "DIVERZ";
}

const ROLE_LABELS: Record<UserRole, string> = { Admin: "관리자", Manager: "매니저", Staff: "직원" };
const ROLE_COLORS: Record<UserRole, string> = { Admin: "#EF4444", Manager: "#F97316", Staff: "#64748B" };

export default function Header() {
  const pathname = usePathname();
  const router   = useRouter();
  const title = getTitle(pathname);
  const [role, setRole] = useCurrentRole();
  const [userName, setUserName] = useState("사용자");

  useEffect(() => {
    const name = localStorage.getItem("diverz_user_name");
    if (name) setUserName(name);
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    localStorage.removeItem("diverz_user_role");
    localStorage.removeItem("diverz_user_name");
    router.push("/login");
  }

  return (
    <header
      className="h-16 flex items-center justify-between px-8 sticky top-0 z-20"
      style={{
        background: "#FFFFFF",
        borderBottom: "1px solid #E5E8EB",
        boxShadow: "0 1px 0 rgba(0,0,0,0.04)",
      }}
    >
      <h1 className="text-xl font-bold" style={{ color: "#191F28" }}>
        {title}
      </h1>
      <div className="flex items-center gap-3">
        <button
          className="relative p-2 rounded-xl transition-colors"
          style={{ color: "#8B95A1" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "#F2F4F6";
            (e.currentTarget as HTMLButtonElement).style.color = "#191F28";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            (e.currentTarget as HTMLButtonElement).style.color = "#8B95A1";
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <span
            className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
            style={{ background: "#3182F6" }}
          />
        </button>
        <div className="flex items-center gap-2">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="text-xs font-semibold px-2 py-1 rounded-lg border outline-none cursor-pointer"
            style={{
              background: `${ROLE_COLORS[role]}12`,
              borderColor: `${ROLE_COLORS[role]}40`,
              color: ROLE_COLORS[role],
            }}
            title="현재 역할 (개발용)"
          >
            {(["Admin", "Manager", "Staff"] as UserRole[]).map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
            style={{ background: "#3182F6" }}
          >
            {userName.slice(0, 1)}
          </div>
          <span className="text-sm font-medium" style={{ color: "#191F28" }}>
            {userName}
          </span>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm border rounded-xl px-3 py-1.5 transition-colors font-medium"
          style={{ color: "#6B7684", borderColor: "#E5E8EB" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "#F2F4F6";
            (e.currentTarget as HTMLButtonElement).style.color = "#191F28";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            (e.currentTarget as HTMLButtonElement).style.color = "#6B7684";
          }}
        >
          로그아웃
        </button>
      </div>
    </header>
  );
}
