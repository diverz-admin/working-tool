import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectRevenues, projectCosts } from "@/db/schema";
import { eq, and, gte, lte, isNotNull, inArray, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const year  = parseInt(searchParams.get("year")  ?? String(new Date().getFullYear()));
    const month = parseInt(searchParams.get("month") ?? "0"); // 0 = 연간 전체
    const team  = searchParams.get("team") ?? "";

    const from = month > 0
      ? `${year}-${String(month).padStart(2, "0")}-01`
      : `${year}-01-01`;
    const to = month > 0
      ? new Date(year, month, 0).toISOString().slice(0, 10)
      : `${year}-12-31`;

    // 프로젝트 목록 — 캠페인 시작일 기준 필터링
    const projectRows = await db
      .select({
        id:             projects.id,
        campaignName:   projects.campaignName,
        advertiser:     projects.advertiser,
        assignedTeam:   projects.assignedTeam,
        assignedPerson: projects.assignedPerson,
        contractAmount: projects.contractAmount,
        status:         projects.status,
        startDate:      projects.startDate,
        endDate:        projects.endDate,
      })
      .from(projects)
      .where(
        and(
          team ? eq(projects.assignedTeam, team) : undefined,
          isNotNull(projects.startDate),
          gte(projects.startDate, from),
          lte(projects.startDate, to),
        )
      );

    const empty = {
      year, month,
      monthly:      Array.from({ length: 12 }, (_, i) => emptyMonth(i + 1)),
      teams:        [] as TeamData[],
      persons:      [] as PersonData[],
      projects:     [],
      totalSummary: emptyTotal(),
    };

    if (projectRows.length === 0) return NextResponse.json(empty);

    const projectIds = projectRows.map(p => p.id);
    // 캠페인 시작일 맵 (월별 집계에 사용)
    const projectStartMap = new Map(projectRows.map(p => [p.id, p.startDate]));

    // 확정 매출 (입금확인요청이 제출된 프로젝트 = confirmRequest 존재, 반려 제외)
    const revRows = await db
      .select({
        projectId:   projectRevenues.projectId,
        invoiceDate: projectRevenues.invoiceDate,
        total:       projectRevenues.total,
        supplyPrice: projectRevenues.supplyPrice,
        productName: projectRevenues.productName,
        paymentDate: projectRevenues.paymentDate,
      })
      .from(projectRevenues)
      .where(
        and(
          inArray(projectRevenues.projectId, projectIds),
          sql`EXISTS (SELECT 1 FROM confirm_requests WHERE project_id = ${projectRevenues.projectId} AND status != '반려')`,
        )
      );

    // 승인 매입
    const costRows = await db
      .select({
        projectId:    projectCosts.projectId,
        purchaseDate: projectCosts.purchaseDate,
        total:        projectCosts.total,
        supplyPrice:  projectCosts.supplyPrice,
        productName:  projectCosts.productName,
        vendor:       projectCosts.vendor,
      })
      .from(projectCosts)
      .where(
        and(
          inArray(projectCosts.projectId, projectIds),
          eq(projectCosts.isApproved, true),
          isNotNull(projectCosts.purchaseDate),
          gte(projectCosts.purchaseDate, from),
          lte(projectCosts.purchaseDate, to),
        )
      );

    const revByProject  = groupBy(revRows,  r => r.projectId ?? "");
    const costByProject = groupBy(costRows, c => c.projectId ?? "");

    // 프로젝트별 집계
    const projectSummaries = projectRows.map(p => {
      const revs    = revByProject[p.id]  ?? [];
      const costs   = costByProject[p.id] ?? [];
      const revenue = sum(revs,  r => r.total ?? 0);
      const cost    = sum(costs, c => c.total ?? 0);
      const margin  = revenue - cost;
      return {
        ...p,
        revenue, cost, margin,
        marginRate: revenue > 0 ? round1(margin / revenue * 100) : 0,
        revenueRows: revs,
        costRows:    costs,
      };
    }).filter(p => p.revenue > 0 || p.cost > 0 || p.contractAmount);

    // 월별 집계 (12개월) — 확정 매출은 캠페인 시작월 기준
    const monthly = Array.from({ length: 12 }, (_, i) => emptyMonth(i + 1));
    for (const r of revRows) {
      const startDate = r.projectId ? projectStartMap.get(r.projectId) : null;
      if (!startDate) continue;
      const m = parseInt(startDate.substring(5, 7)) - 1;
      monthly[m].revenue    += r.total ?? 0;
      monthly[m].supplyPrice += r.supplyPrice ?? 0;
      monthly[m].count      += 1;
    }
    for (const c of costRows) {
      const m = parseInt(c.purchaseDate!.substring(5, 7)) - 1;
      monthly[m].cost += c.total ?? 0;
    }
    for (const m of monthly) {
      m.margin     = m.revenue - m.cost;
      m.marginRate = m.revenue > 0 ? round1(m.margin / m.revenue * 100) : 0;
    }

    // 팀별 집계
    const teamMap = new Map<string, typeof projectSummaries>();
    for (const p of projectSummaries) {
      const t = p.assignedTeam ?? "미지정";
      if (!teamMap.has(t)) teamMap.set(t, []);
      teamMap.get(t)!.push(p);
    }
    const teams: TeamData[] = Array.from(teamMap.entries()).map(([teamName, ps]) => {
      const revenue = sum(ps, p => p.revenue);
      const cost    = sum(ps, p => p.cost);
      const margin  = revenue - cost;

      // 팀별 월별 — 확정 매출은 캠페인 시작월 기준
      const teamMonthly = Array.from({ length: 12 }, (_, i) => emptyMonth(i + 1));
      for (const p of ps) {
        const startDate = p.startDate;
        const rm = startDate ? parseInt(startDate.substring(5, 7)) - 1 : -1;
        if (rm >= 0) {
          for (const r of p.revenueRows) {
            teamMonthly[rm].revenue += r.total ?? 0;
            teamMonthly[rm].count   += 1;
          }
        }
        for (const c of p.costRows) {
          const cm = parseInt(c.purchaseDate!.substring(5, 7)) - 1;
          teamMonthly[cm].cost += c.total ?? 0;
        }
      }
      for (const m of teamMonthly) {
        m.margin     = m.revenue - m.cost;
        m.marginRate = m.revenue > 0 ? round1(m.margin / m.revenue * 100) : 0;
      }

      return {
        team: teamName, projectCount: ps.length,
        revenue, cost, margin,
        marginRate: revenue > 0 ? round1(margin / revenue * 100) : 0,
        monthly: teamMonthly,
      };
    });

    // 담당자별 집계
    const personMap = new Map<string, typeof projectSummaries>();
    for (const p of projectSummaries) {
      const key = `${p.assignedPerson ?? "미지정"}||${p.assignedTeam ?? ""}`;
      if (!personMap.has(key)) personMap.set(key, []);
      personMap.get(key)!.push(p);
    }
    const persons: PersonData[] = Array.from(personMap.entries()).map(([key, ps]) => {
      const [name, personTeam] = key.split("||");
      const revenue = sum(ps, p => p.revenue);
      const cost    = sum(ps, p => p.cost);
      const margin  = revenue - cost;
      return {
        name, team: personTeam,
        projectCount: ps.length,
        revenue, cost, margin,
        marginRate: revenue > 0 ? round1(margin / revenue * 100) : 0,
      };
    }).sort((a, b) => b.revenue - a.revenue);

    const totalRevenue = sum(projectSummaries, p => p.revenue);
    const totalCost    = sum(projectSummaries, p => p.cost);
    const totalMargin  = totalRevenue - totalCost;

    return NextResponse.json({
      year, month,
      monthly,
      teams,
      persons,
      projects: projectSummaries,
      totalSummary: {
        projectCount: projectSummaries.length,
        revenue: totalRevenue, cost: totalCost, margin: totalMargin,
        marginRate: totalRevenue > 0 ? round1(totalMargin / totalRevenue * 100) : 0,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

interface MonthData  { month: number; revenue: number; supplyPrice: number; cost: number; margin: number; marginRate: number; count: number; }
interface TeamData   { team: string; projectCount: number; revenue: number; cost: number; margin: number; marginRate: number; monthly: MonthData[]; }
interface PersonData { name: string; team: string; projectCount: number; revenue: number; cost: number; margin: number; marginRate: number; }

function emptyMonth(m: number): MonthData {
  return { month: m, revenue: 0, supplyPrice: 0, cost: 0, margin: 0, marginRate: 0, count: 0 };
}
function emptyTotal() {
  return { projectCount: 0, revenue: 0, cost: 0, margin: 0, marginRate: 0 };
}
function groupBy<T>(arr: T[], key: (t: T) => string): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const item of arr) { const k = key(item); if (!map[k]) map[k] = []; map[k].push(item); }
  return map;
}
function sum<T>(arr: T[], fn: (t: T) => number): number { return arr.reduce((s, t) => s + fn(t), 0); }
function round1(n: number) { return Math.round(n * 10) / 10; }
