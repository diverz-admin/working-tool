import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectRevenues } from "@/db/schema";
import { eq, and, gte, lte, isNotNull, inArray, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const year     = parseInt(req.nextUrl.searchParams.get("year") ?? String(new Date().getFullYear()));
    const criteria = req.nextUrl.searchParams.get("criteria") ?? "캠페인 시작날짜";

    const useInvoice = criteria === "계산서날짜";
    const useSupply  = criteria === "공급가";
    const dateField  = useInvoice ? projectRevenues.invoiceDate : projects.startDate;

    // 1. 입금 확인된 프로젝트별 fallback 합계 + refDate
    const revSums = await db
      .select({
        projectId:   projectRevenues.projectId,
        totalSum:    sql<number>`COALESCE(SUM(${projectRevenues.total}), 0)`,
        supplySum:   sql<number>`COALESCE(SUM(${projectRevenues.supplyPrice}), 0)`,
        refDate:     sql<string>`MAX(${dateField})`,
      })
      .from(projectRevenues)
      .innerJoin(projects, eq(projectRevenues.projectId, projects.id))
      .where(
        and(
          isNotNull(projectRevenues.paymentDate),
          isNotNull(dateField),
          gte(dateField, `${year}-01-01`),
          lte(dateField, `${year}-12-31`),
        )
      )
      .groupBy(projectRevenues.projectId);

    const confirmedIds = revSums.map(r => r.projectId);
    if (!confirmedIds.length) {
      return NextResponse.json({ teams: [], other: new Array(12).fill(0) });
    }

    // 2. 프로젝트 KPI 조회
    const projectData = await db
      .select({
        id:             projects.id,
        assignedTeam:   projects.assignedTeam,
        assignedPerson: projects.assignedPerson,
        contractAmount: projects.contractAmount,
        kpiSupply:      projects.kpiSupply,
      })
      .from(projects)
      .where(inArray(projects.id, confirmedIds));

    const revMap = new Map(revSums.map(r => [r.projectId, r]));

    // 3. 팀/담당자별 월 집계
    const teamMap = new Map<string, Map<string, number[]>>();
    const other   = new Array(12).fill(0);

    for (const p of projectData) {
      const rev  = revMap.get(p.id);
      if (!rev?.refDate) continue;
      const month  = parseInt(rev.refDate.substring(5, 7)) - 1;
      const amount = useSupply
        ? (p.kpiSupply ?? Number(rev.supplySum))
        : (p.contractAmount ?? Number(rev.totalSum));

      const team   = p.assignedTeam   ?? "";
      const person = p.assignedPerson ?? "";

      if (!team) { other[month] += amount; continue; }

      if (!teamMap.has(team)) teamMap.set(team, new Map());
      const pMap = teamMap.get(team)!;
      if (!pMap.has(person || "미지정")) pMap.set(person || "미지정", new Array(12).fill(0));
      pMap.get(person || "미지정")![month] += amount;
    }

    const TEAM_ORDER = ["영업 1팀", "영업 2팀"];
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
