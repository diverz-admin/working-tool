import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/session";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout", "/users/new", "/api/users", "/api/debug-me", "/api/cron"];

const MANAGER_PATHS = ["/approval", "/operations", "/api/approvals", "/api/annual", "/api/monthly", "/api/costs", "/api/sales-targets"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token   = req.cookies.get(SESSION_COOKIE)?.value;
  const payload = token ? await verifySession(token) : null;

  if (!payload) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  const isManagerRestricted = MANAGER_PATHS.some(p => pathname.startsWith(p));
  if (isManagerRestricted && payload.role === "Staff") {
    // Staff가 입금확인요청·입금요청을 직접 제출할 수 있도록 POST는 허용
    const isApprovalSubmit =
      (pathname === "/api/approvals/confirm" || pathname === "/api/approvals/payment") &&
      req.method === "POST";
    // Staff도 내부지출 결재 요청 가능 (GET 목록 조회 + POST 신규 요청)
    const isExpenseAccess =
      pathname.startsWith("/api/approvals/expense") &&
      (req.method === "GET" || req.method === "POST");
    if (!isApprovalSubmit && !isExpenseAccess) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
      }
      const url = req.nextUrl.clone();
      url.pathname = "/403";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
