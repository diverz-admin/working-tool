import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectRevenues, clients } from "@/db/schema";
import { eq, and, gte, lte, isNotNull, sql } from "drizzle-orm";
import { monthRange } from "@/lib/month-range";

export async function GET(req: NextRequest) {
  try {
    const year     = parseInt(req.nextUrl.searchParams.get("year")  ?? String(new Date().getFullYear()));
    const month    = parseInt(req.nextUrl.searchParams.get("month") ?? String(new Date().getMonth() + 1));
    const criteria = req.nextUrl.searchParams.get("criteria") ?? "캠페인 시작날짜";

    const useInvoice = criteria === "계산서날짜";
    const dateField  = useInvoice ? projectRevenues.invoiceDate : projects.startDate;

    const { from, to } = monthRange(year, month);

    // 단일 쿼리: 확인된 프로젝트 + KPI + 클라이언트
    const rows = await db
      .select({
        assignedTeam:   projects.assignedTeam,
        assignedPerson: projects.assignedPerson,
        startDate:      projects.startDate,
        contractAmount: projects.contractAmount,
        kpiSupply:      projects.kpiSupply,
        kpiTax:         projects.kpiTax,
        clientName:     clients.companyName,
        totalSum:       sql<number>`COALESCE(SUM(${projectRevenues.total}), 0)`,
        supplySum:      sql<number>`COALESCE(SUM(${projectRevenues.supplyPrice}), 0)`,
        taxSum:         sql<number>`COALESCE(SUM(${projectRevenues.tax}), 0)`,
      })
      .from(projectRevenues)
      .innerJoin(projects, eq(projectRevenues.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(
        and(
          isNotNull(projectRevenues.paymentDate),
          isNotNull(dateField),
          gte(dateField, from),
          lte(dateField, to),
        )
      )
      .groupBy(
        projects.id,
        projects.assignedTeam,
        projects.assignedPerson,
        projects.startDate,
        projects.contractAmount,
        projects.kpiSupply,
        projects.kpiTax,
        clients.companyName,
      );

    const result = rows.map(p => ({
      assignedTeam:   p.assignedTeam,
      assignedPerson: p.assignedPerson,
      startDate:      p.startDate,
      invoiceDate:    null,
      clientName:     p.clientName ?? null,
      total:       p.contractAmount ?? Number(p.totalSum ?? 0),
      supplyPrice: p.kpiSupply      ?? Number(p.supplySum ?? 0),
      tax:         p.kpiTax         ?? Number(p.taxSum    ?? 0),
    }));

    return NextResponse.json({ rows: result });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
