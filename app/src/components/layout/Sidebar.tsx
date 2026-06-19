"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import { useUser } from "@/lib/UserContext";

const TEAMS = ["경영", "영업 1팀", "영업 2팀"];

let _pendingCache: { confirm: number; payment: number; ts: number } | null = null;
const PENDING_TTL = 60_000;

const MARKETING_SUB = [
  { href: "/marketing/reports", label: "리포트" },
  { href: "/marketing/board",   label: "프로젝트 보드" },
];

const APPROVAL_SUB = [
  { href: "/approval/confirm",                label: "프로젝트 입금확인요청" },
  { href: "/approval/request",                label: "프로젝트 입금요청" },
  { href: "/approval/internal/confirm",       label: "내부지출",   managerOnly: true },
  { href: "/approval/internal/leave-confirm", label: "휴가",       managerOnly: true },
];

const INTERNAL_SUB = [
  { href: "/approval/internal/expense", label: "내부지출" },
  { href: "/approval/internal/leave",   label: "휴가" },
];

const OPERATIONS_SUB = [
  { href: "/operations/annual",  label: "연간 손익관리" },
  { href: "/operations/monthly", label: "월간 손익관리" },
  { href: "/operations/team",    label: "팀별 손익현황" },
  { href: "/operations/notices", label: "공지사항 관리" },
  { href: "/users",              label: "사용자 관리" },
];

const IC = {
  dashboard: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  ),
  clients: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  products: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  ),
  projects: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  marketing: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
    </svg>
  ),
  operations: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  ),
  journal: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  meeting: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      <line x1="19" y1="8" x2="23" y2="8"/>
    </svg>
  ),
  chat: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  mypage: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  users: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  approval: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <polyline points="9 15 11 17 15 13"/>
    </svg>
  ),
  chevron: (open: boolean) => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
};

const navItems = [
  { href: "/dashboard",      label: "대시보드",   icon: IC.dashboard },
  { href: "/clients",        label: "광고주 관리", icon: IC.clients },
  { href: "/products",       label: "상품관리",    icon: IC.products },
  { href: "/meeting-notes",  label: "회의/미팅록",  icon: IC.meeting },
  { href: "/work-journal",   label: "업무일지",    icon: IC.journal },
  { href: "/chat",           label: "채팅",        icon: IC.chat },
];

function NavItem({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
      style={{
        color: isActive ? "#3182F6" : "#4E5968",
        background: isActive ? "rgba(49,130,246,0.08)" : "transparent",
      }}
    >
      <span style={{ color: isActive ? "#3182F6" : "#8B95A1" }}>{icon}</span>
      {label}
    </Link>
  );
}

let _workBadgeCache: { data: Record<string, number>; ts: number } | null = null;
const WORK_BADGE_TTL = 60_000;

function ProjectsNavSection() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTeam = searchParams.get("team");
  const isActive = pathname.startsWith("/projects");
  const [open, setOpen] = useState(isActive);
  const [teamBadges, setTeamBadges] = useState<Record<string, number>>({});

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (isActive) setOpen(true); }, [isActive]);

  useEffect(() => {
    function fetchBadges(force = false) {
      if (!force && _workBadgeCache && Date.now() - _workBadgeCache.ts < WORK_BADGE_TTL) {
        setTeamBadges(_workBadgeCache.data);
        return;
      }
      fetch("/api/projects-page/work-badge")
        .then((r) => r.json())
        .then((d) => {
          _workBadgeCache = { data: d, ts: Date.now() };
          setTeamBadges(d);
        })
        .catch(() => {});
    }
    fetchBadges();
    const forceRefetch = () => { _workBadgeCache = null; fetchBadges(true); };
    window.addEventListener("work-badge-refresh", forceRefetch);
    return () => window.removeEventListener("work-badge-refresh", forceRefetch);
  }, [pathname]);

  return (
    <div>
      <div
        className="flex items-center rounded-xl transition-all"
        style={{ background: isActive ? "rgba(49,130,246,0.08)" : "transparent" }}
      >
        <Link
          href="/projects"
          className="flex-1 flex items-center gap-3 px-3 py-2.5 text-sm font-medium"
          style={{ color: isActive ? "#3182F6" : "#4E5968" }}
        >
          <span style={{ color: isActive ? "#3182F6" : "#8B95A1" }}>{IC.projects}</span>
          프로젝트 관리
        </Link>
        <button
          onClick={() => setOpen((v) => !v)}
          className="pr-3 py-2.5 transition-opacity hover:opacity-80"
          style={{ color: isActive ? "#3182F6" : "#B0B8C1" }}
        >
          {IC.chevron(open)}
        </button>
      </div>

      {open && (
        <div className="mt-0.5 ml-4">
          {TEAMS.map((team) => {
            const isTeamActive = isActive && activeTeam === team;
            const badgeCount = teamBadges[team] ?? 0;
            return (
              <Link
                key={team}
                href={`/projects?team=${encodeURIComponent(team)}`}
                className="flex items-center gap-2 pl-5 pr-3 py-2 text-xs font-medium rounded-xl transition-all"
                style={{
                  color: isTeamActive ? "#3182F6" : "#8B95A1",
                  background: isTeamActive ? "rgba(49,130,246,0.06)" : "transparent",
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: isTeamActive ? "#3182F6" : "#D1D5DB" }} />
                {team}
                <PendingBadge count={badgeCount} />
              </Link>
            );
          })}
          {(() => {
            const isReportActive = pathname === "/projects/report";
            return (
              <Link
                href="/projects/report"
                className="flex items-center gap-2 pl-5 pr-3 py-2 text-xs font-medium rounded-xl transition-all"
                style={{
                  color: isReportActive ? "#3182F6" : "#8B95A1",
                  background: isReportActive ? "rgba(49,130,246,0.06)" : "transparent",
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: isReportActive ? "#3182F6" : "#D1D5DB" }} />
                월간 리포트
              </Link>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function PendingBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span
      className="ml-auto flex items-center justify-center text-white font-bold rounded-full"
      style={{
        background: "#EF4444",
        fontSize: 10,
        minWidth: 18,
        height: 18,
        paddingLeft: count > 9 ? 4 : 0,
        paddingRight: count > 9 ? 4 : 0,
      }}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function ApprovalNavSection() {
  const pathname = usePathname();
  const isActive = pathname.startsWith("/approval") &&
    (!pathname.startsWith("/approval/internal") ||
     pathname.startsWith("/approval/internal/confirm") ||
     pathname.startsWith("/approval/internal/leave-confirm"));
  const [open, setOpen] = useState(isActive);
  const [counts, setCounts] = useState<{ confirm: number; payment: number }>({ confirm: 0, payment: 0 });
  const { role } = useUser();
  const locked = role === "Staff";

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (isActive) setOpen(true); }, [isActive]);

  useEffect(() => {
    function fetchCounts(force = false) {
      if (!force && _pendingCache && Date.now() - _pendingCache.ts < PENDING_TTL) {
        setCounts({ confirm: _pendingCache.confirm, payment: _pendingCache.payment });
        return;
      }
      fetch("/api/approvals/pending-counts")
        .then((r) => r.json())
        .then((d) => {
          const next = { confirm: d.confirm ?? 0, payment: d.payment ?? 0 };
          _pendingCache = { ...next, ts: Date.now() };
          setCounts(next);
        })
        .catch(() => {});
    }
    fetchCounts();
    const forceRefetch = () => { _pendingCache = null; fetchCounts(true); };
    window.addEventListener("approval-request-added", forceRefetch);
    return () => window.removeEventListener("approval-request-added", forceRefetch);
  }, [pathname]);

  const badgeCounts: Record<string, number> = {
    "/approval/confirm": counts.confirm,
    "/approval/request": counts.payment,
  };

  return (
    <div>
      <div
        className="flex items-center rounded-xl transition-all"
        style={{ background: isActive ? "rgba(49,130,246,0.08)" : "transparent" }}
      >
        <Link
          href={locked ? "/403" : "/approval/confirm"}
          className="flex-1 flex items-center gap-3 px-3 py-2.5 text-sm font-medium"
          style={{ color: locked ? "#B0B8C1" : isActive ? "#3182F6" : "#4E5968", opacity: locked ? 0.6 : 1 }}
        >
          <span style={{ color: locked ? "#CBD5E1" : isActive ? "#3182F6" : "#8B95A1" }}>{IC.approval}</span>
          결재확인
          {!locked && <PendingBadge count={counts.confirm + counts.payment} />}
          {locked && <span className="ml-auto text-xs" style={{ color: "#CBD5E1" }}>🔒</span>}
        </Link>
        <button
          onClick={() => setOpen((v) => !v)}
          className="pr-3 py-2.5 transition-opacity hover:opacity-80"
          style={{ color: isActive ? "#3182F6" : "#B0B8C1" }}
        >
          {IC.chevron(open)}
        </button>
      </div>

      {open && (
        <div className="mt-0.5 ml-4">
          {APPROVAL_SUB.filter((item) => !item.managerOnly || !locked).map((item) => {
            const isSubActive = pathname === item.href || pathname.startsWith(item.href + "/");
            const badgeCount = badgeCounts[item.href] ?? 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2 pl-5 pr-3 py-2 text-xs font-medium rounded-xl transition-all"
                style={{
                  color: isSubActive ? "#3182F6" : "#8B95A1",
                  background: isSubActive ? "rgba(49,130,246,0.06)" : "transparent",
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: isSubActive ? "#3182F6" : "#D1D5DB" }} />
                {item.label}
                <PendingBadge count={badgeCount} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InternalNavSection() {
  const pathname = usePathname();
  const { role } = useUser();
  const isActive = pathname.startsWith("/approval/internal") &&
    !pathname.startsWith("/approval/internal/confirm") &&
    !pathname.startsWith("/approval/internal/leave-confirm");
  const [open, setOpen] = useState(isActive);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (isActive) setOpen(true); }, [isActive]);

  return (
    <div>
      <div
        className="flex items-center rounded-xl transition-all"
        style={{ background: isActive ? "rgba(139,92,246,0.08)" : "transparent" }}
      >
        <Link
          href="/approval/internal/expense"
          className="flex-1 flex items-center gap-3 px-3 py-2.5 text-sm font-medium"
          style={{ color: isActive ? "#8B5CF6" : "#4E5968" }}
        >
          <span style={{ color: isActive ? "#8B5CF6" : "#8B95A1" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
            </svg>
          </span>
          내부결재요청
        </Link>
        <button
          onClick={() => setOpen((v) => !v)}
          className="pr-3 py-2.5 transition-opacity hover:opacity-80"
          style={{ color: isActive ? "#8B5CF6" : "#B0B8C1" }}
        >
          {IC.chevron(open)}
        </button>
      </div>

      {open && (
        <div className="mt-0.5 ml-4">
          {INTERNAL_SUB.map((item) => {
            const isSubActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2 pl-5 pr-3 py-2 text-xs font-medium rounded-xl transition-all"
                style={{
                  color: isSubActive ? "#8B5CF6" : "#8B95A1",
                  background: isSubActive ? "rgba(139,92,246,0.06)" : "transparent",
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: isSubActive ? "#8B5CF6" : "#D1D5DB" }} />
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MarketingNavSection() {
  const pathname = usePathname();
  const isActive = pathname.startsWith("/marketing");
  const [open, setOpen] = useState(isActive);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (isActive) setOpen(true); }, [isActive]);

  return (
    <div>
      <div
        className="flex items-center rounded-xl transition-all"
        style={{ background: isActive ? "rgba(49,130,246,0.08)" : "transparent" }}
      >
        <Link
          href="/marketing/reports"
          className="flex-1 flex items-center gap-3 px-3 py-2.5 text-sm font-medium"
          style={{ color: isActive ? "#3182F6" : "#4E5968" }}
        >
          <span style={{ color: isActive ? "#3182F6" : "#8B95A1" }}>{IC.marketing}</span>
          마케팅
        </Link>
        <button
          onClick={() => setOpen((v) => !v)}
          className="pr-3 py-2.5 transition-opacity hover:opacity-80"
          style={{ color: isActive ? "#3182F6" : "#B0B8C1" }}
        >
          {IC.chevron(open)}
        </button>
      </div>

      {open && (
        <div className="mt-0.5 ml-4">
          {MARKETING_SUB.map((item) => {
            const isSubActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2 pl-5 pr-3 py-2 text-xs font-medium rounded-xl transition-all"
                style={{
                  color: isSubActive ? "#3182F6" : "#8B95A1",
                  background: isSubActive ? "rgba(49,130,246,0.06)" : "transparent",
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: isSubActive ? "#3182F6" : "#D1D5DB" }} />
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OperationsNavSection() {
  const pathname = usePathname();
  const isActive = pathname.startsWith("/operations") || pathname.startsWith("/users");
  const [open, setOpen] = useState(isActive);
  const { role } = useUser();
  const locked = role === "Staff";

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (isActive) setOpen(true); }, [isActive]);

  return (
    <div>
      <div
        className="flex items-center rounded-xl transition-all"
        style={{ background: isActive ? "rgba(49,130,246,0.08)" : "transparent" }}
      >
        <Link
          href={locked ? "/403" : "/operations"}
          className="flex-1 flex items-center gap-3 px-3 py-2.5 text-sm font-medium"
          style={{ color: locked ? "#B0B8C1" : isActive ? "#3182F6" : "#4E5968", opacity: locked ? 0.6 : 1 }}
        >
          <span style={{ color: locked ? "#CBD5E1" : isActive ? "#3182F6" : "#8B95A1" }}>{IC.operations}</span>
          경영관리
          {locked && <span className="ml-auto text-xs" style={{ color: "#CBD5E1" }}>🔒</span>}
        </Link>
        <button
          onClick={() => setOpen((v) => !v)}
          className="pr-3 py-2.5 transition-opacity hover:opacity-80"
          style={{ color: isActive ? "#3182F6" : "#B0B8C1" }}
        >
          {IC.chevron(open)}
        </button>
      </div>

      {open && (
        <div className="mt-0.5 ml-4">
          {OPERATIONS_SUB.map((item) => {
            const isSubActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2 pl-5 pr-3 py-2 text-xs font-medium rounded-xl transition-all"
                style={{
                  color: isSubActive ? "#3182F6" : "#8B95A1",
                  background: isSubActive ? "rgba(49,130,246,0.06)" : "transparent",
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: isSubActive ? "#3182F6" : "#D1D5DB" }} />
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  return (
    <aside
      className="w-64 shrink-0 flex flex-col fixed inset-y-0 left-0 overflow-y-auto z-30"
      style={{ background: "#FFFFFF", borderRight: "1px solid #E5E8EB" }}
    >
      {/* 로고 */}
      <div className="px-5 py-6" style={{ borderBottom: "1px solid #F2F4F6" }}>
        <img
          src="/logo-diverz.png"
          alt="DIVERZ"
          style={{ height: 36, width: "auto", objectFit: "contain" }}
        />
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <Suspense fallback={null}>
          <NavItem {...navItems[0]} />
          <MarketingNavSection />
          <NavItem {...navItems[1]} />
          <ProjectsNavSection />
          <NavItem {...navItems[2]} />
          <NavItem {...navItems[3]} />
          <NavItem {...navItems[4]} />
          <NavItem {...navItems[5]} />
          <InternalNavSection />
          <ApprovalNavSection />
          <OperationsNavSection />
        </Suspense>
      </nav>

      {/* 하단 */}
      <div className="px-5 py-4" style={{ borderTop: "1px solid #F2F4F6" }}>
        <p className="text-xs" style={{ color: "#B0B8C1" }}>v0.1.0</p>
      </div>
    </aside>
  );
}
