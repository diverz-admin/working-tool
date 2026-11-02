import { cookies } from "next/headers";
import { decodeSession, SESSION_COOKIE } from "@/lib/session";
import { UserProvider } from "@/lib/UserContext";
import Sidebar from "@/components/layout/Sidebar";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import Header from "@/components/layout/Header";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let userName: string = "사용자";
  let userRole: "Admin" | "Manager" | "Staff" = "Staff";
  let sidebarCollapsed = false;

  try {
    const cookieStore = await cookies();
    // 접어 둔 사이드바는 새로고침해도 접힌 채로 그린다 — 브라우저에서 다시 접으면 화면이 한 번 튄다
    sidebarCollapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "collapsed";
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (token) {
      const payload = decodeSession(token);
      if (payload?.name && payload?.role) {
        userName = payload.name;
        userRole = payload.role as "Admin" | "Manager" | "Staff";
      }
    }
  } catch {
    // 기본값 유지
  }

  return (
    <UserProvider name={userName} role={userRole}>
      <div data-sidebar={sidebarCollapsed ? "collapsed" : "open"} className="group/app flex min-h-screen" style={{ background: "#F2F4F6" }}>
        <Sidebar initialCollapsed={sidebarCollapsed} />
        <div className="flex-1 min-w-0 flex flex-col ml-64 transition-[margin] duration-200 group-data-[sidebar=collapsed]/app:ml-0">
          <Header />
          <main className="flex-1 min-w-0 p-8">{children}</main>
        </div>
      </div>
    </UserProvider>
  );
}
