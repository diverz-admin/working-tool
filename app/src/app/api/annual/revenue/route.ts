import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectRevenues } from "@/db/schema";
import { eq, and, isNotNull, sql } from "drizzle-orm";
import { TEAM_ORDER } from "@/lib/teams";

export async function GET(req: NextRequest) {
  try {
    const year     = parseInt(req.nextUrl.searchParams.get("year") ?? String(new Date().getFullYear()));
    const criteria = req.nextUrl.searchParams.get("criteria") ?? "캠페인 시작날짜";

    const useInvoice = criteria === "계산서날짜";
    const useSupply  = criteria === "공급가";

    // 단일 쿼리: 확인된 프로젝트 + KPI + revenue 합계
    const projectData = await db
      .select({
        id:             projects.id,
        assignedTeam:   projects.assignedTeam,
        assignedPerson: projects.assignedPerson,
        startDate:      projects.startDate,
        contractAmount: projects.contractAmount,
        kpiSupply:      projects.kpiSupply,
        totalSum:       sql<number>`COALESCE(SUM(${projectRevenues.total}), 0)`,
        supplySum:      sql<number>`COALESCE(SUM(${projectRevenues.supplyPrice}), 0)`,
        maxInvoiceDate: sql<string>`MAX(${projectRevenues.invoiceDate})`,
      })
      .from(projects)
      .innerJoin(projectRevenues, eq(projectRevenues.projectId, projects.id))
      .where(
        useInvoice
          ? and(
              isNotNull(projectRevenues.paymentDate),
              isNotNull(projectRevenues.invoiceDate),
              sql`EXTRACT(YEAR FROM ${projects.startDate}) = ${year}`,
            )
          : and(
              isNotNull(projectRevenues.paymentDate),
              sql`EXTRACT(YEAR FROM ${projects.startDate}) = ${year}`,
            )
      )
      .groupBy(
        projects.id,
        projects.assignedTeam,
        projects.assignedPerson,
        projects.startDate,
        projects.contractAmount,
        projects.kpiSupply,
      );

    if (!projectData.length) {
      return NextResponse.json({ teams: [], other: new Array(12).fill(0) });
    }

    // 팀/담당자별 월 집계
    const teamMap = new Map<string, Map<string, number[]>>();
    const other   = new Array(12).fill(0);

    for (const p of projectData) {
      const refDate = useInvoice ? p.maxInvoiceDate : p.startDate;
      if (!refDate) continue;
      const month  = parseInt(refDate.substring(5, 7)) - 1;
      const amount = useSupply
        ? (p.kpiSupply ?? Number(p.supplySum))
        : (p.contractAmount ?? Number(p.totalSum));

      const team   = p.assignedTeam   ?? "";
      const person = p.assignedPerson ?? "";

      if (!team) { other[month] += amount; continue; }

      if (!teamMap.has(team)) teamMap.set(team, new Map());
      const pMap = teamMap.get(team)!;
      if (!pMap.has(person || "미지정")) pMap.set(person || "미지정", new Array(12).fill(0));
      pMap.get(person || "미지정")![month] += amount;
    }

    const teams = Array.from(teamMap.entries())
      .sort(([a], [b]) => {
        const ia = TEAM_ORDER.indexOf(a), ib = TEAM_ORDER.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      })
      .map(([team, pMap]) => ({
        team,
        persons: Array.from(pMap.entries()).map(([person, monthly]) => ({ person, monthly })),
      }));

    return NextResponse.json({ teams, other });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
