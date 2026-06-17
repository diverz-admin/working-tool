import { NextResponse } from "next/server";
import { db } from "@/db";
import { confirmRequests, paymentRequests, projectRevenues, projects } from "@/db/schema";
import { desc, getTableColumns, sql, inArray, asc } from "drizzle-orm";

const confirmTeamExpr = sql<string | null>`
  COALESCE(
    ${confirmRequests.assignedTeam},
    (SELECT p.assigned_team FROM projects p WHERE p.id::text = ${confirmRequests.projectId})
  )
`;
const paymentTeamExpr = sql<string | null>`
  COALESCE(
    ${paymentRequests.assignedTeam},
    (SELECT p.assigned_team FROM projects p WHERE p.id::text = ${paymentRequests.projectId})
  )
`;

export async function GET() {
  try {
    // 1. 입금확인요청 + 입금요청 병렬 (1 cold start, 2 DB 쿼리)
    const [confirmRows, paymentRows] = await Promise.all([
      db.select({ ...getTableColumns(confirmRequests), assignedTeam: confirmTeamExpr })
        .from(confirmRequests)
        .orderBy(desc(confirmRequests.createdAt)),
      db.select({ ...getTableColumns(paymentRequests), assignedTeam: paymentTeamExpr })
        .from(paymentRequests)
        .orderBy(desc(paymentRequests.createdAt)),
    ]);

    // 2. confirm enrichment — projectRows + revenueRows 병렬 fetch
    const projectIds = [...new Set(confirmRows.map(r => r.projectId).filter(Boolean))] as string[];

    if (projectIds.length === 0) {
      const enriched = (confirmRows as unknown as Record<string, unknown>[]).map(r => ({
        ...r, projectType: null, projectProduct: null, revenueLines: [], campaignNumber: null,
      }));
      return NextResponse.json({ confirms: enriched, payments: paymentRows });
    }

    const [projectRows, revenueRows] = await Promise.all([
      db.select({ id: projects.id, projectType: projects.projectType, product: projects.product, projectGroupId: projects.projectGroupId })
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
    ]);

    // 3. 캠페인 순번 (groupIds 확인 후 1회 추가 쿼리)
    const groupIds = [...new Set(projectRows.map(p => p.projectGroupId).filter(Boolean))] as string[];
    const campaignNumberMap = new Map<string, number>();
    if (groupIds.length > 0) {
      const siblings = await db
        .select({ id: projects.id, projectGroupId: projects.projectGroupId })
        .from(projects)
        .where(inArray(projects.projectGroupId, groupIds))
        .orderBy(asc(projects.createdAt));
      const counters = new Map<string, number>();
      for (const s of siblings) {
        if (!s.projectGroupId) continue;
        const n = (counters.get(s.projectGroupId) ?? 0) + 1;
        counters.set(s.projectGroupId, n);
        campaignNumberMap.set(s.id, n);
      }
    }

    const typeMap    = new Map(projectRows.map(p => [p.id, p.projectType]));
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
    }));

    return NextResponse.json({ confirms: enriched, payments: paymentRows });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
