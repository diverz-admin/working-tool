import { cookies } from "next/headers";
import { decodeSession, SESSION_COOKIE } from "@/lib/session";
import { UserProvider } from "@/lib/UserContext";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let userName: string = "사용자";
  let userRole: "Admin" | "Manager" | "Staff" = "Staff";

  try {
    const cookieStore = await cookies();
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
      <div className="flex min-h-screen" style={{ background: "#F2F4F6" }}>
        <Sidebar />
        <div className="flex-1 flex flex-col ml-64">
          <Header />
          <main className="flex-1 p-8">{children}</main>
        </div>
      </div>
    </UserProvider>
  );
}
