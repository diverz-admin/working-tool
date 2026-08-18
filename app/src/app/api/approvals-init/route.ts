import { NextResponse } from "next/server";
import { db } from "@/db";
import { confirmRequests, paymentRequests, projectRevenues, projects } from "@/db/schema";
import { desc, getTableColumns, sql, inArray, eq, and, isNotNull } from "drizzle-orm";
import { fillVendorBankAccounts } from "@/lib/vendor-account.server";

// 팀 표시값: 요청 행의 assignedTeam 우선, 없으면 프로젝트의 assignedTeam — 행당 서브쿼리 대신 LEFT JOIN
const confirmTeamExpr = sql<string | null>`COALESCE(${confirmRequests.assignedTeam}, ${projects.assignedTeam})`;
const paymentTeamExpr = sql<string | null>`COALESCE(${paymentRequests.assignedTeam}, ${projects.assignedTeam})`;

export async function GET() {
  try {
    // 1. 입금확인요청 + 입금요청 병렬 (1 cold start, 2 DB 쿼리) — 팀은 projects LEFT JOIN으로 1회 해석
    const [confirmRows, paymentRows] = await Promise.all([
      db.select({ ...getTableColumns(confirmRequests), assignedTeam: confirmTeamExpr })
        .from(confirmRequests)
        .leftJoin(projects, eq(projects.id, confirmRequests.projectId))
        .orderBy(desc(confirmRequests.createdAt)),
      db.select({ ...getTableColumns(paymentRequests), assignedTeam: paymentTeamExpr })
        .from(paymentRequests)
        .leftJoin(projects, eq(projects.id, paymentRequests.projectId))
        .orderBy(desc(paymentRequests.createdAt)),
    ]);

    // 계좌 스냅샷이 빈 요청은 상품관리의 현재 등록 계좌로 보정 (품명 직접 입력으로 매칭이 빗나간 건 포함)
    // — confirm enrichment 쿼리와 겹쳐 돌도록 여기서는 await 하지 않는다
    const paymentsPromise = fillVendorBankAccounts(
      paymentRows.map((r) => ({ ...r, requestedAt: r.requestedAt ? r.requestedAt.slice(0, 10) : r.requestedAt })),
    );

    // 2. confirm enrichment — projectRows + revenueRows 병렬 fetch
    const projectIds = [...new Set(confirmRows.map(r => r.projectId).filter(Boolean))] as string[];

    if (projectIds.length === 0) {
      const enriched = (confirmRows as unknown as Record<string, unknown>[]).map(r => ({
        ...r, projectType: null, projectProduct: null, revenueLines: [], campaignNumber: null, campaignName: null,
      }));
      return NextResponse.json({ confirms: enriched, payments: await paymentsPromise });
    }

    const [projectRows, revenueRows, siblings] = await Promise.all([
      db.select({ id: projects.id, projectType: projects.projectType, product: projects.product, projectGroupId: projects.projectGroupId, campaignName: projects.campaignName })
        .from(projects)
        .where(inArray(projects.id, projectIds)),
      db.select({
        projectId:      projectRevenues.projectId,
        productName:    projectRevenues.productName,
        quantity:       projectRevenues.quantity,
        total:          projectRevenues.total,
        depositAccount: projectRevenues.depositAccount,
      })
        .from(projectRevenues)
        .where(inArray(projectRevenues.projectId, projectIds)),
      // 캠페인 순번용 형제 프로젝트 — groupId를 서브쿼리로 해석해 추가 round-trip 제거
      // 정렬은 프로젝트관리 캠페인 목록과 동일하게 createdAt 내림차순 (같은 캠페인에 같은 번호가 붙도록)
      db.select({ id: projects.id, projectGroupId: projects.projectGroupId })
        .from(projects)
        .where(inArray(
          projects.projectGroupId,
          db.select({ gid: projects.projectGroupId }).from(projects)
            .where(and(inArray(projects.id, projectIds), isNotNull(projects.projectGroupId))),
        ))
        .orderBy(desc(projects.createdAt)),
    ]);

    // 3. 캠페인 순번 (그룹별 createdAt 내림차순 순번 — 프로젝트관리 화면과 동일)
    const campaignNumberMap = new Map<string, number>();
    const counters = new Map<string, number>();
    for (const s of siblings) {
      if (!s.projectGroupId) continue;
      const n = (counters.get(s.projectGroupId) ?? 0) + 1;
      counters.set(s.projectGroupId, n);
      campaignNumberMap.set(s.id, n);
    }

    const typeMap    = new Map(projectRows.map(p => [p.id, p.projectType]));
    const nameMap    = new Map(projectRows.map(p => [p.id, p.campaignName]));
    const productMap = new Map(projectRows.map(p => [p.id, p.product]));
    const linesMap   = new Map<string, { productName: string | null; quantity: number | null; total: number | null; depositAccount: string | null }[]>();
    for (const rv of revenueRows) {
      if (!rv.projectId) continue;
      if (!linesMap.has(rv.projectId)) linesMap.set(rv.projectId, []);
      linesMap.get(rv.projectId)!.push({ productName: rv.productName, quantity: rv.quantity, total: rv.total, depositAccount: rv.depositAccount });
    }

    const enriched = (confirmRows as unknown as Record<string, unknown>[]).map(r => ({
      ...r,
      projectType:    r.projectId ? (typeMap.get(r.projectId as string) ?? null) : null,
      projectProduct: r.projectId ? (productMap.get(r.projectId as string) ?? null) : null,
      revenueLines:   r.projectId ? (linesMap.get(r.projectId as string) ?? []) : [],
      campaignNumber: r.projectId ? (campaignNumberMap.get(r.projectId as string) ?? null) : null,
      campaignName:   r.projectId ? (nameMap.get(r.projectId as string) ?? null) : null,
    }));

    return NextResponse.json({ confirms: enriched, payments: await paymentsPromise });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
