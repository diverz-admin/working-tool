import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE } from "@/lib/session";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { UserProvider } from "@/lib/UserContext";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token   = cookieStore.get(SESSION_COOKIE)?.value;
  const payload = token ? await verifySession(token) : null;

  let userName: string = "사용자";
  let userRole: "Admin" | "Manager" | "Staff" = "Staff";

  if (payload) {
    const [user] = await db
      .select({ name: users.name, role: users.role })
      .from(users)
      .where(eq(users.id, payload.id));
    if (user) {
      userName = user.name;
      userRole = user.role as "Admin" | "Manager" | "Staff";
    }
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
