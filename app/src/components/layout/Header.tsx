"use client";

import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/lib/UserContext";
import type { UserRole } from "@/lib/UserContext";
import { useState, useEffect, useRef, useCallback } from "react";

const pageTitles: Record<string, string> = {
  "/dashboard": "대시보드",
  "/projects": "프로젝트 관리",
  "/clients": "광고주 관리",
  "/products": "상품 관리",
  "/operations": "경영관리",
  "/reports": "매출 리포트",
  "/chat": "채팅",
  "/users": "사용자 관리",
  "/mypage": "마이페이지",
};

function getTitle(pathname: string): string {
  const match = Object.keys(pageTitles)
    .sort((a, b) => b.length - a.length)
    .find((key) => pathname === key || pathname.startsWith(key + "/"));
  return match ? pageTitles[match] : "DIVERZ";
}

const ROLE_LABELS: Record<UserRole, string> = { Admin: "관리자", Manager: "매니저", Staff: "직원" };
const ROLE_COLORS: Record<UserRole, string> = { Admin: "#EF4444", Manager: "#F97316", Staff: "#64748B" };

interface Mention {
  id: string;
  channelId: string;
  mentionedName: string;
  fromName: string;
  preview: string;
  isRead: boolean;
  createdAt: string;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "방금";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}시간 전`;
  return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

function authorColor(name: string) {
  const COLORS = ["#3182F6", "#6366F1", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4"];
  let h = 0;
  for (const c of name) h = (c.charCodeAt(0) + h * 31) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

export default function Header() {
  const pathname = usePathname();
  const router   = useRouter();
  const { name: userName, role: userRole } = useUser();
  const title = getTitle(pathname);

  const [mentions, setMentions]       = useState<Mention[]>([]);
  const [showDrop, setShowDrop]       = useState(false);
  const [toastList, setToastList]     = useState<Mention[]>([]);
  const dropRef   = useRef<HTMLDivElement>(null);
  const prevCount = useRef(0);

  const unreadCount = mentions.filter((m) => !m.isRead).length;

  const loadMentions = useCallback(async (name: string) => {
    try {
      const res = await fetch(`/api/chat/notifications?name=${encodeURIComponent(name)}`);
      if (!res.ok) return;
      const data = await res.json();
      const fetched: Mention[] = data.mentions ?? [];
      setMentions(fetched);

      // 새 멘션 토스트
      const newCount = fetched.filter((m) => !m.isRead).length;
      if (newCount > prevCount.current && prevCount.current >= 0) {
        const newItems = fetched.filter((m) => !m.isRead).slice(0, newCount - prevCount.current);
        newItems.forEach((item) => {
          setToastList((p) => [...p, item]);
          setTimeout(() => setToastList((p) => p.filter((t) => t.id !== item.id)), 5000);
        });
      }
      prevCount.current = newCount;
    } catch { /* ignore */ }
  }, []);

  // 초기 로드 + 30초 폴링
  useEffect(() => {
    if (!userName) return;
    loadMentions(userName);
    const t = setInterval(() => loadMentions(userName), 30000);
    return () => clearInterval(t);
  }, [userName, loadMentions]);

  // 채팅 페이지에서 멘션 발생 시 즉시 갱신
  useEffect(() => {
    function onNewMention() {
      if (userName) loadMentions(userName);
    }
    window.addEventListener("chat-mention-received", onNewMention);
    return () => window.removeEventListener("chat-mention-received", onNewMention);
  }, [userName, loadMentions]);

  // 드롭다운 외부 클릭 닫기
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setShowDrop(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function handleOpenDrop() {
    setShowDrop((v) => !v);
    if (!showDrop && unreadCount > 0 && userName) {
      await fetch("/api/chat/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: userName }),
      });
      setMentions((p) => p.map((m) => ({ ...m, isRead: true })));
      prevCount.current = 0;
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <>
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

          {/* 알림 벨 */}
          <div className="relative" ref={dropRef}>
            <button
              onClick={handleOpenDrop}
              className="relative p-2 rounded-xl transition-colors"
              style={{ color: unreadCount > 0 ? "#3182F6" : "#8B95A1" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#F2F4F6"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full text-white font-bold px-1"
                  style={{ background: "#EF4444", fontSize: 10 }}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {/* 알림 드롭다운 */}
            {showDrop && (
              <div className="absolute right-0 top-11 w-80 rounded-2xl border shadow-xl z-50 overflow-hidden"
                style={{ background: "#FFFFFF", borderColor: "#E9EBEF" }}>
                <div className="px-4 py-3 border-b flex items-center justify-between"
                  style={{ borderColor: "#F1F5F9", background: "#F8FAFC" }}>
                  <span className="text-sm font-bold" style={{ color: "#191F28" }}>채팅 멘션 알림</span>
                  <button onClick={() => { router.push("/chat"); setShowDrop(false); }}
                    className="text-xs font-medium transition-colors hover:opacity-70"
                    style={{ color: "#3182F6" }}>채팅으로 이동</button>
                </div>
                <div className="overflow-y-auto" style={{ maxHeight: 360 }}>
                  {mentions.length === 0 ? (
                    <div className="py-10 text-center">
                      <svg className="mx-auto mb-2" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#B0B8C1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                      </svg>
                      <p className="text-sm" style={{ color: "#94A3B8" }}>멘션 알림이 없습니다</p>
                    </div>
                  ) : (
                    mentions.map((n) => (
                      <button key={n.id}
                        onClick={() => { router.push("/chat"); setShowDrop(false); }}
                        className="w-full px-4 py-3 text-left border-b transition-colors hover:bg-slate-50 last:border-0"
                        style={{ borderColor: "#F1F5F9", background: n.isRead ? "transparent" : "rgba(49,130,246,0.04)" }}>
                        <div className="flex items-start gap-2.5">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5"
                            style={{ background: authorColor(n.fromName) }}>
                            {n.fromName.slice(0, 2)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold" style={{ color: "#191F28" }}>
                              {n.fromName}
                              <span className="ml-1 font-normal" style={{ color: "#94A3B8" }}>님이 멘션했습니다</span>
                            </p>
                            <p className="text-xs mt-0.5 truncate" style={{ color: "#64748B" }}>{n.preview}</p>
                            <p className="text-xs mt-0.5" style={{ color: "#B0B8C1" }}>{formatTime(n.createdAt)}</p>
                          </div>
                          {!n.isRead && (
                            <div className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ background: "#3182F6" }} />
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-1 rounded-lg"
              style={{ background: `${ROLE_COLORS[userRole]}12`, border: `1px solid ${ROLE_COLORS[userRole]}40`, color: ROLE_COLORS[userRole] }}>
              {ROLE_LABELS[userRole]}
            </span>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
              style={{ background: "#3182F6" }}>
              {userName.slice(0, 1)}
            </div>
            <span className="text-sm font-medium" style={{ color: "#191F28" }}>{userName}</span>
          </div>

          <button onClick={handleLogout}
            className="text-sm border rounded-xl px-3 py-1.5 transition-colors font-medium"
            style={{ color: "#6B7684", borderColor: "#E5E8EB" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#F2F4F6"; (e.currentTarget as HTMLButtonElement).style.color = "#191F28"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "#6B7684"; }}>
            로그아웃
          </button>
        </div>
      </header>

      {/* 멘션 토스트 (오른쪽 상단) */}
      {toastList.length > 0 && (
        <div className="fixed top-20 right-6 z-50 flex flex-col gap-2">
          {toastList.map((t) => (
            <div key={t.id}
              className="flex items-start gap-3 px-4 py-3.5 rounded-2xl shadow-xl cursor-pointer"
              style={{ background: "#FFFFFF", border: "1px solid #E9EBEF", maxWidth: 320, minWidth: 280 }}
              onClick={() => { router.push("/chat"); setToastList((p) => p.filter((x) => x.id !== t.id)); }}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ background: authorColor(t.fromName) }}>
                {t.fromName.slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold" style={{ color: "#191F28" }}>
                  {t.fromName}
                  <span className="ml-1 font-normal" style={{ color: "#94A3B8" }}>님이 멘션했습니다</span>
                </p>
                <p className="text-xs mt-0.5 truncate" style={{ color: "#64748B" }}>{t.preview}</p>
              </div>
              <button onClick={(e) => { e.stopPropagation(); setToastList((p) => p.filter((x) => x.id !== t.id)); }}
                className="p-1 rounded-lg hover:bg-slate-100 transition-colors shrink-0">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
