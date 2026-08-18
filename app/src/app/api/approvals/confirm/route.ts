import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { confirmRequests, projectRevenues, projects } from "@/db/schema";
import { eq, desc, getTableColumns, sql, isNull, inArray, and, asc } from "drizzle-orm";

// assignedTeam: 저장된 값이 있으면 사용, 없으면 projects 테이블에서 서브쿼리로 조회
const assignedTeamExpr = sql<string | null>`
  COALESCE(
    ${confirmRequests.assignedTeam},
    (SELECT p.assigned_team FROM projects p WHERE p.id = ${confirmRequests.projectId})
  )
`;

async function enrichWithProjectData(rows: Record<string, unknown>[]) {
  const projectIds = [...new Set(rows.map((r: Record<string, unknown>) => r.projectId).filter(Boolean))] as string[];

  if (projectIds.length === 0) return rows.map(r => ({ ...r, projectType: null, revenueLines: [] }));

  const projectRows = await db
    .select({ id: projects.id, projectType: projects.projectType, product: projects.product, projectGroupId: projects.projectGroupId, campaignName: projects.campaignName })
    .from(projects)
    .where(inArray(projects.id, projectIds));

  // 그룹 내 캠페인 순번 계산 (캠페인 1, 캠페인 2...)
  const groupIds = [...new Set(projectRows.map(p => p.projectGroupId).filter(Boolean))] as string[];
  const campaignNumberMap = new Map<string, number>();
  if (groupIds.length > 0) {
    const siblings = await db
      .select({ id: projects.id, projectGroupId: projects.projectGroupId })
      .from(projects)
      .where(inArray(projects.projectGroupId, groupIds))
      .orderBy(asc(projects.createdAt));
    const groupCounters = new Map<string, number>();
    for (const s of siblings) {
      if (!s.projectGroupId) continue;
      const n = (groupCounters.get(s.projectGroupId) ?? 0) + 1;
      groupCounters.set(s.projectGroupId, n);
      campaignNumberMap.set(s.id, n);
    }
  }

  const revenueRows = await db
    .select({
      projectId:      projectRevenues.projectId,
      productName:    projectRevenues.productName,
      quantity:       projectRevenues.quantity,
      total:          projectRevenues.total,
      depositAccount: projectRevenues.depositAccount,
    })
    .from(projectRevenues)
    .where(inArray(projectRevenues.projectId, projectIds));

  const projectTypeMap    = new Map(projectRows.map(p => [p.id, p.projectType]));
  const projectProductMap = new Map(projectRows.map(p => [p.id, p.product]));
  const campaignNameMap   = new Map(projectRows.map(p => [p.id, p.campaignName]));
  const revenueLinesMap   = new Map<string, { productName: string | null; quantity: number | null; total: number | null; depositAccount: string | null }[]>();
  for (const rv of revenueRows) {
    if (!rv.projectId) continue;
    if (!revenueLinesMap.has(rv.projectId)) revenueLinesMap.set(rv.projectId, []);
    revenueLinesMap.get(rv.projectId)!.push({
      productName:    rv.productName,
      quantity:       rv.quantity,
      total:          rv.total,
      depositAccount: rv.depositAccount,
    });
  }

  return rows.map((r: Record<string, unknown>) => ({
    ...r,
    projectType:    r.projectId ? (projectTypeMap.get(r.projectId as string) ?? null) : null,
    projectProduct: r.projectId ? (projectProductMap.get(r.projectId as string) ?? null) : null,
    revenueLines:   r.projectId ? (revenueLinesMap.get(r.projectId as string) ?? []) : [],
    campaignNumber: r.projectId ? (campaignNumberMap.get(r.projectId as string) ?? null) : null,
    campaignName:   r.projectId ? (campaignNameMap.get(r.projectId as string) ?? null) : null,
  }));
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");

  const select = { ...getTableColumns(confirmRequests), assignedTeam: assignedTeamExpr };

  if (!projectId) {
    const rows = await db
      .select(select)
      .from(confirmRequests)
      .orderBy(desc(confirmRequests.createdAt));
    const enriched = await enrichWithProjectData(rows as unknown as Record<string, unknown>[]);
    return NextResponse.json({ items: enriched });
  }

  // 1) 직접 연결된 요청
  const directRows = await db
    .select(select)
    .from(confirmRequests)
    .where(eq(confirmRequests.projectId, projectId))
    .orderBy(desc(confirmRequests.createdAt));

  // 2) projectId 없이 생성된(고아) 요청 — 프로젝트 매출행 rowId로 매칭
  const revenueRows = await db
    .select({ revenueRowId: projectRevenues.revenueRowId })
    .from(projectRevenues)
    .where(eq(projectRevenues.projectId, projectId as unknown as string));

  const rowIds = revenueRows.map(r => r.revenueRowId).filter((id): id is string => Boolean(id));

  const orphanRows = rowIds.length > 0
    ? await db
        .select(select)
        .from(confirmRequests)
        .where(and(isNull(confirmRequests.projectId), inArray(confirmRequests.rowKey, rowIds)))
    : [];

  const rows = [...directRows, ...orphanRows]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const enriched = await enrichWithProjectData(rows as unknown as Record<string, unknown>[]);
  return NextResponse.json({ items: enriched });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  // 1:1 강제 — 같은 rowKey의 기존 요청을 먼저 삭제 (projectId 범위 내로 한정)
  if (body.rowKey) {
    const whereClause = body.projectId
      ? and(eq(confirmRequests.rowKey, body.rowKey), eq(confirmRequests.projectId, body.projectId))
      : eq(confirmRequests.rowKey, body.rowKey);
    await db.delete(confirmRequests).where(whereClause);
  }

  const [row] = await db.insert(confirmRequests).values({
    projectId:            body.projectId            || null,
    rowKey:               body.rowKey               || null,
    clientId:             body.clientId             || null,
    assignedTeam:         body.assignedTeam         || null,
    projectName:          body.projectName          ?? "",
    requester:            body.requester            ?? "",
    productName:          body.productName          ?? "",
    description:          body.description          || null,
    quantity:             body.quantity             || null,
    amount:               body.amount               || null,
    workStartDate:        body.workStartDate        || null,
    workEndDate:          body.workEndDate          || null,
    clientName:           body.clientName           || null,
    clientStoreName:      body.clientStoreName      || null,
    clientBusinessNumber: body.clientBusinessNumber || null,
    clientEmail:          body.clientEmail          || null,
    clientIndustry:       body.clientIndustry       || null,
    clientCategory:       body.clientCategory       || null,
    dueDate:              body.dueDate              || null,
    depositAccount:       body.depositAccount       || null,
    depositorName:        body.depositorName        || null,
    depositDate:          body.depositDate          || null,
    requestedAt:          body.requestedAt          ?? new Date().toISOString().slice(0, 10),
    status:               "대기",
    taxExempt:            body.taxExempt            ?? false,
  }).returning();
  return NextResponse.json({ item: row }, { status: 201 });
}
