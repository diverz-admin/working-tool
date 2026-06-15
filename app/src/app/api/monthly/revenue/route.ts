import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectRevenues, clients } from "@/db/schema";
import { eq, and, gte, lte, isNotNull, inArray, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const year     = parseInt(req.nextUrl.searchParams.get("year")  ?? String(new Date().getFullYear()));
    const month    = parseInt(req.nextUrl.searchParams.get("month") ?? String(new Date().getMonth() + 1));
    const criteria = req.nextUrl.searchParams.get("criteria") ?? "캠페인 시작날짜";

    const useInvoice = criteria === "계산서날짜";
    const dateField  = useInvoice ? projectRevenues.invoiceDate : projects.startDate;

    const from = `${year}-${String(month).padStart(2, "0")}-01`;
    const to   = new Date(year, month, 0).toISOString().slice(0, 10);

    // 1. 입금 확인된 프로젝트별 매출행 합계 (fallback + 상세 정보용)
    const revSums = await db
      .select({
        projectId:   projectRevenues.projectId,
        totalSum:    sql<number>`COALESCE(SUM(${projectRevenues.total}), 0)`,
        supplySum:   sql<number>`COALESCE(SUM(${projectRevenues.supplyPrice}), 0)`,
        taxSum:      sql<number>`COALESCE(SUM(${projectRevenues.tax}), 0)`,
        rowCount:    sql<number>`COUNT(*)`,
      })
      .from(projectRevenues)
      .innerJoin(projects, eq(projectRevenues.projectId, projects.id))
      .where(
        and(
          isNotNull(projectRevenues.paymentDate),
          isNotNull(dateField),
          gte(dateField, from),
          lte(dateField, to),
        )
      )
      .groupBy(projectRevenues.projectId);

    const confirmedIds = revSums.map(r => r.projectId);
    if (!confirmedIds.length) return NextResponse.json({ rows: [] });

    // 2. 프로젝트 KPI + 클라이언트 조회
    const projectData = await db
      .select({
        id:             projects.id,
        assignedTeam:   projects.assignedTeam,
        assignedPerson: projects.assignedPerson,
        startDate:      projects.startDate,
        contractAmount: projects.contractAmount,
        kpiSupply:      projects.kpiSupply,
        kpiTax:         projects.kpiTax,
        clientName:     clients.companyName,
      })
      .from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(inArray(projects.id, confirmedIds));

    const revMap = new Map(revSums.map(r => [r.projectId, r]));

    // 3. 프로젝트당 1행으로 반환 (KPI 우선, fallback은 행 합계)
    const rows = projectData.map(p => {
      const rev = revMap.get(p.id);
      return {
        assignedTeam:  p.assignedTeam,
        assignedPerson: p.assignedPerson,
        startDate:     p.startDate,
        invoiceDate:   null,
        clientName:    p.clientName ?? null,
        total:       p.contractAmount ?? Number(rev?.totalSum ?? 0),
        supplyPrice: p.kpiSupply      ?? Number(rev?.supplySum ?? 0),
        tax:         p.kpiTax         ?? Number(rev?.taxSum    ?? 0),
      };
    });

    return NextResponse.json({ rows });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
