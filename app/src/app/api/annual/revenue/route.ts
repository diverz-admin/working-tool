import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectRevenues } from "@/db/schema";
import { eq, and, gte, lte, isNotNull } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const year     = parseInt(req.nextUrl.searchParams.get("year") ?? String(new Date().getFullYear()));
    const criteria = req.nextUrl.searchParams.get("criteria") ?? "캠페인 시작날짜";

    const useInvoice    = criteria === "계산서날짜";
    const useSupply     = criteria === "공급가";
    const dateField     = useInvoice ? projectRevenues.invoiceDate : projects.startDate;

    const rows = await db
      .select({
        assignedTeam:   projects.assignedTeam,
        assignedPerson: projects.assignedPerson,
        date:  useInvoice ? projectRevenues.invoiceDate : projects.startDate,
        total: projectRevenues.total,
        supplyPrice: projectRevenues.supplyPrice,
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
      );

    // group: team → person → monthly[12]
    const teamMap = new Map<string, Map<string, number[]>>();
    const other   = new Array(12).fill(0);

    for (const row of rows) {
      const month  = parseInt(row.date!.substring(5, 7)) - 1;
      const amount = (useSupply ? row.supplyPrice : row.total) ?? 0;
      const team   = row.assignedTeam   ?? "";
      const person = row.assignedPerson ?? "";

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
