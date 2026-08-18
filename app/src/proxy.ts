import { NextRequest, NextResponse } from "next/server";
import { verifySession, createSession, SESSION_COOKIE } from "@/lib/session";

// 세션 만료가 이만큼 남았을 때부터 요청마다 쿠키를 새로 발급한다(슬라이딩 세션).
// 로그인 후 7일이 지나면 화면을 계속 쓰고 있어도 세션이 끊겨, 저장 요청만 401로 실패하고
// 사용자는 입력하던 내용을 잃었다. 계속 사용 중이면 만료되지 않도록 갱신한다.
const SESSION_REFRESH_BEFORE_MS = 3 * 24 * 60 * 60 * 1000;

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
    // 내부결재요청 — 모든 역할 허용 (페이지 + API 전 메서드)
    const isExpenseAccess =
      pathname.startsWith("/api/approvals/expense") ||
      pathname.startsWith("/api/approvals/leave");
    // /approval/internal/confirm, /approval/internal/leave-confirm 은 Manager 전용 — Staff는 제외
    const isInternalApprovalPage =
      pathname.startsWith("/approval/internal") &&
      !pathname.startsWith("/approval/internal/confirm") &&
      !pathname.startsWith("/approval/internal/leave-confirm");
    if (!isApprovalSubmit && !isExpenseAccess && !isInternalApprovalPage) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
      }
      const url = req.nextUrl.clone();
      url.pathname = "/403";
      return NextResponse.redirect(url);
    }
  }

  const res = NextResponse.next();

  // 만료가 임박한 세션은 여기서 연장한다. 새 쿠키를 받으면 exp가 다시 7일 뒤로 밀리므로
  // 실제 재발급은 3일에 한 번 정도만 일어난다.
  if (payload.exp - Date.now() < SESSION_REFRESH_BEFORE_MS) {
    const token = await createSession({ id: payload.id, name: payload.name, role: payload.role });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      path:     "/",
      maxAge:   60 * 60 * 24 * 7,
    });
  }

  return res;
}

export const config = {
  // public/fonts 는 인증 대상이 아니다. 제외하지 않으면 로그인 화면에서 폰트 요청이
  // /login 리다이렉트로 응답돼 서체가 시스템 폰트로 떨어진다.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/).*)"],
};
