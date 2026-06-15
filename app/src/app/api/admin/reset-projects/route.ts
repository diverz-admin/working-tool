import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { confirmRequests, paymentRequests, projectGroups } from "@/db/schema";

// 일회성 데이터 초기화 엔드포인트 — 사용 후 파일 삭제
export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== "diverz-reset-2026") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [cr, pr, pg] = await Promise.all([
      db.delete(confirmRequests).returning({ id: confirmRequests.id }),
      db.delete(paymentRequests).returning({ id: paymentRequests.id }),
      db.delete(projectGroups).returning({ id: projectGroups.id }),
    ]);

    return NextResponse.json({
      ok: true,
      deleted: {
        confirmRequests:  cr.length,
        paymentRequests:  pr.length,
        projectGroups:    pg.length,
        // projects, project_revenues, project_costs, work_daily_logs는 CASCADE로 자동 삭제됨
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
