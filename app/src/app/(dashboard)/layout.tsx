import { cookies } from "next/headers";
import { decodeSession, SESSION_COOKIE } from "@/lib/session";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
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
    const payload = token ? decodeSession(token) : null;

    if (payload?.id) {
      const [user] = await db
        .select({ name: users.name, role: users.role })
        .from(users)
        .where(eq(users.id, payload.id));
      if (user) {
        userName = user.name;
        userRole = user.role as "Admin" | "Manager" | "Staff";
      }
    }
  } catch {
    // 세션 읽기 실패 시 기본값 유지
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
