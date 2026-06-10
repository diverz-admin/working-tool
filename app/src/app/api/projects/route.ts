import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectRevenues, projectCosts, projectGroups } from "@/db/schema";
import { NextRequest } from "next/server";
import { desc, eq, max, getTableColumns, count, sql, and } from "drizzle-orm";
import { clients } from "@/db/schema";

function daysRemaining(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).setHours(0,0,0,0) - new Date().setHours(0,0,0,0);
  return Math.ceil(diff / 86400000);
}

function computeTab(status: string, days: number | null) {
  if (status === "종료") return "종료";
  if (days !== null && days <= 0) return "종료";
  if (days !== null && days <= 1) return "종료1일전";
  if (days !== null && days <= 3) return "종료3일전";
  if (days !== null && days <= 7) return "종료7일전";
  return "전체";
}

export async function GET(req: NextRequest) {
  const groupId = req.nextUrl.searchParams.get("groupId");
  try {
    // 매출 행의 작업만료일 최댓값 + 매출 진행상황 집계
    const rows = await db
      .select({
        ...getTableColumns(projects),
        workEndDate:      max(projectRevenues.workEndDate),
        revenueTotal:     count(projectRevenues.id),
        revenueCompleted: sql<number>`COUNT(*) FILTER (WHERE ${projectRevenues.workCompleted} = TRUE)`,
      })
      .from(projects)
      .leftJoin(projectRevenues, eq(projectRevenues.projectId, projects.id))
      .where(groupId ? eq(projects.projectGroupId, groupId) : undefined)
      .groupBy(projects.id)
      .orderBy(desc(projects.createdAt));

    // 매입 진행상황 집계 (별도 쿼리)
    const costProgress = await db
      .select({
        projectId:    projectCosts.projectId,
        costTotal:    count(projectCosts.id),
        costCompleted: sql<number>`COUNT(*) FILTER (WHERE ${projectCosts.workCompleted} = TRUE)`,
      })
      .from(projectCosts)
      .groupBy(projectCosts.projectId);

    const costMap = new Map(
      costProgress.map((c) => [c.projectId, { costTotal: Number(c.costTotal), costCompleted: Number(c.costCompleted) }])
    );

    const result = rows.map((p) => {
      // 작업만료일 우선, 없으면 계약 종료일 fallback
      const effectiveEnd = p.workEndDate ?? p.endDate;
      const days = daysRemaining(effectiveEnd);
      const costs = costMap.get(p.id) ?? { costTotal: 0, costCompleted: 0 };
      return {
        ...p,
        workEndDate:      p.workEndDate ?? null,
        effectiveEnd,
        daysRemaining:    days,
        tab:              computeTab(p.status, days),
        revenueTotal:     Number(p.revenueTotal),
        revenueCompleted: Number(p.revenueCompleted),
        costTotal:        costs.costTotal,
        costCompleted:    costs.costCompleted,
      };
    });

    return NextResponse.json({ projects: result });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // projectGroupId 없으면 광고주 상호명으로 신규 프로젝트 자동 생성
    let groupId: string | null = body.projectGroupId || null;
    if (!groupId) {
      // clientId가 있으면 clients 테이블의 companyName(상호명) 우선 사용
      let groupName = body.advertiser?.trim() || body.campaignName || "신규 프로젝트";
      if (body.clientId) {
        const [client] = await db.select({ companyName: clients.companyName })
          .from(clients).where(eq(clients.id, body.clientId));
        if (client?.companyName) groupName = client.companyName;
      }
      const [group] = await db.insert(projectGroups).values({
        name:           groupName,
        clientId:       body.clientId || null,
        assignedTeam:   body.assignedTeam || null,
        assignedPerson: body.assignedPerson || null,
        status:         "진행",
        notes:          null,
      }).returning();
      groupId = group.id;
    }

    const [row] = await db.insert(projects).values({
      status:         body.status ?? "진행",
      campaignName:   body.campaignName,
      advertiser:     body.advertiser || null,
      product:        body.product || null,
      assignedTeam:   body.assignedTeam || null,
      assignedPerson: body.assignedPerson || null,
      contractAmount: body.contractAmount != null && body.contractAmount !== "" ? parseInt(body.contractAmount) : null,
      startDate:      body.startDate || null,
      endDate:        body.endDate || null,
      clientId:       body.clientId || null,
      projectType:    body.projectType || null,
      placeLink:      body.placeLink || null,
      notes:          body.notes || null,
      projectGroupId: groupId,
    }).returning();

    return NextResponse.json({ project: row, projectGroupId: groupId }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
