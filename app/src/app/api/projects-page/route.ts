import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  projectGroups, projects, projectRevenues, projectCosts,
  confirmRequests, paymentRequests, kpiTargets,
} from "@/db/schema";
import { eq, count, sql, max, desc, and, isNotNull, inArray } from "drizzle-orm";

function daysRemaining(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000);
}

export async function GET(req: NextRequest) {
  try {
    const year       = parseInt(req.nextUrl.searchParams.get("year") ?? String(new Date().getFullYear()));
    const criteria   = req.nextUrl.searchParams.get("criteria") ?? "캠페인 시작날짜";
    const useInvoice = criteria === "계산서날짜";

    // ── 13개 쿼리 전부 병렬 (기존: 3 cold start + project-groups 내부 sequential 2 round trip)
    const [
      // ─ 그룹/캠페인 목록 (project-groups) ─
      groupRows,
      workEndRows, revTotal, revStats, costTotal, costStats,
      allCampaigns, campCostTotal, campRevStats, campCostStats,
      // ─ 매출 KPI 통계 (stats/revenue) ─
      statsProjectData, kpiRows, statsCostRows,
    ] = await Promise.all([

      // 1. 그룹 + 캠페인 카운트
      db.select({
        id:             projectGroups.id,
        name:           projectGroups.name,
        clientId:       projectGroups.clientId,
        assignedTeam:   projectGroups.assignedTeam,
        assignedPerson: projectGroups.assignedPerson,
        status:         projectGroups.status,
        notes:          projectGroups.notes,
        createdAt:      projectGroups.createdAt,
        updatedAt:      projectGroups.updatedAt,
        campaignCount:        count(projects.id),
        activeCampaignCount:  sql<number>`COUNT(*) FILTER (WHERE ${projects.status} = '진행')`,
        activeProjectType:    sql<string | null>`MAX(${projects.projectType}) FILTER (WHERE ${projects.status} = '진행')`,
        activeProduct:        sql<string | null>`MAX(${projects.product}) FILTER (WHERE ${projects.status} = '진행')`,
        activeStartDate:      sql<string | null>`MIN(${projects.startDate}) FILTER (WHERE ${projects.status} = '진행')`,
        activeEndDate:        sql<string | null>`MAX(${projects.endDate}) FILTER (WHERE ${projects.status} = '진행')`,
        activeContractAmount: sql<number | null>`SUM(${projects.contractAmount}) FILTER (WHERE ${projects.status} = '진행')`,
      })
      .from(projectGroups)
      .leftJoin(projects, eq(projects.projectGroupId, projectGroups.id))
      .groupBy(projectGroups.id)
      .orderBy(
        sql`CASE WHEN ${projectGroups.status} = '진행' THEN 0 ELSE 1 END`,
        sql`MAX(${projects.endDate}) FILTER (WHERE ${projects.status} = '진행') ASC NULLS LAST`,
      ),

      // 2. 작업 만료일
      db.select({
        groupId:    projects.projectGroupId,
        minWorkEnd: sql<string | null>`MIN(${projectRevenues.workEndDate}) FILTER (WHERE ${projectRevenues.workCompleted} = false)`,
      })
      .from(projects)
      .innerJoin(projectRevenues, eq(projectRevenues.projectId, projects.id))
      .where(eq(projects.status, "진행"))
      .groupBy(projects.projectGroupId),

      // 3. 그룹별 매출 총계
      db.select({ groupId: projects.projectGroupId, total: count(projectRevenues.id) })
        .from(projects)
        .innerJoin(projectRevenues, eq(projectRevenues.projectId, projects.id))
        .where(eq(projects.status, "진행"))
        .groupBy(projects.projectGroupId),

      // 4. 그룹별 매출 상태
      db.select({
        groupId:   projects.projectGroupId,
        invoiced:  sql<number>`COUNT(*) FILTER (WHERE ${confirmRequests.taxInvoiceDate} IS NOT NULL)`,
        confirmed: sql<number>`COUNT(*) FILTER (WHERE ${confirmRequests.status} = '확인완료' AND ${confirmRequests.taxInvoiceDate} IS NULL)`,
        pending:   sql<number>`COUNT(*) FILTER (WHERE ${confirmRequests.status} = '대기')`,
      })
      .from(projects)
      .innerJoin(confirmRequests, sql`${confirmRequests.projectId} = ${projects.id}::text`)
      .where(eq(projects.status, "진행"))
      .groupBy(projects.projectGroupId),

      // 5. 그룹별 매입 총계
      db.select({ groupId: projects.projectGroupId, total: count(projectCosts.id) })
        .from(projects)
        .innerJoin(projectCosts, eq(projectCosts.projectId, projects.id))
        .where(eq(projects.status, "진행"))
        .groupBy(projects.projectGroupId),

      // 6. 그룹별 매입 상태
      db.select({
        groupId:  projects.projectGroupId,
        approved: sql<number>`COUNT(*) FILTER (WHERE ${paymentRequests.status} = '승인')`,
        pending:  sql<number>`COUNT(*) FILTER (WHERE ${paymentRequests.status} = '대기')`,
      })
      .from(projects)
      .innerJoin(paymentRequests, sql`${paymentRequests.projectId} = ${projects.id}::text`)
      .where(eq(projects.status, "진행"))
      .groupBy(projects.projectGroupId),

      // 7. 전체 캠페인 목록
      db.select({
        id:             projects.id,
        projectGroupId: projects.projectGroupId,
        campaignName:   projects.campaignName,
        projectType:    projects.projectType,
        product:        projects.product,
        status:         projects.status,
        startDate:      projects.startDate,
        endDate:        projects.endDate,
        contractAmount: projects.contractAmount,
        kpiSupply:      projects.kpiSupply,
        kpiTax:         projects.kpiTax,
        isExtended:     projects.isExtended,
        placeLink:      projects.placeLink,
        notes:          projects.notes,
        assignedTeam:   projects.assignedTeam,
        assignedPerson: projects.assignedPerson,
        clientId:       projects.clientId,
        advertiser:     projects.advertiser,
        workEndDate:    max(projectRevenues.workEndDate),
        revenueTotal:   count(projectRevenues.id),
      })
      .from(projects)
      .leftJoin(projectRevenues, eq(projectRevenues.projectId, projects.id))
      .groupBy(projects.id)
      .orderBy(desc(projects.createdAt)),

      // 8. 캠페인별 매입 총계
      db.select({ projectId: projectCosts.projectId, total: count(projectCosts.id) })
        .from(projectCosts).groupBy(projectCosts.projectId),

      // 9. 캠페인별 매출 상태
      db.select({
        projectId: confirmRequests.projectId,
        invoiced:  sql<number>`COUNT(*) FILTER (WHERE ${confirmRequests.taxInvoiceDate} IS NOT NULL)`,
        confirmed: sql<number>`COUNT(*) FILTER (WHERE ${confirmRequests.status} = '확인완료' AND ${confirmRequests.taxInvoiceDate} IS NULL)`,
        pending:   sql<number>`COUNT(*) FILTER (WHERE ${confirmRequests.status} = '대기')`,
      })
      .from(confirmRequests).groupBy(confirmRequests.projectId),

      // 10. 캠페인별 매입 상태
      db.select({
        projectId: paymentRequests.projectId,
        approved:  sql<number>`COUNT(*) FILTER (WHERE ${paymentRequests.status} = '승인')`,
        pending:   sql<number>`COUNT(*) FILTER (WHERE ${paymentRequests.status} = '대기')`,
      })
      .from(paymentRequests).groupBy(paymentRequests.projectId),

      // 11. 매출 통계 (stats/revenue)
      db.select({
        id:             projects.id,
        startDate:      projects.startDate,
        assignedTeam:   projects.assignedTeam,
        contractAmount: projects.contractAmount,
        totalSum:       sql<number>`COALESCE(SUM(${projectRevenues.total}), 0)`,
        refMonth:       sql<string>`TO_CHAR(MAX(${useInvoice ? projectRevenues.invoiceDate : projectRevenues.paymentDate}), 'YYYY-MM')`,
      })
      .from(projects)
      .innerJoin(projectRevenues, eq(projectRevenues.projectId, projects.id))
      .where(
        useInvoice
          ? and(isNotNull(projectRevenues.paymentDate), isNotNull(projectRevenues.invoiceDate), sql`EXTRACT(YEAR FROM ${projects.startDate}) = ${year}`)
          : and(isNotNull(projectRevenues.paymentDate), sql`EXTRACT(YEAR FROM ${projects.startDate}) = ${year}`)
      )
      .groupBy(projects.id, projects.startDate, projects.assignedTeam, projects.contractAmount),

      // 12. KPI 목표
      db.select().from(kpiTargets).where(eq(kpiTargets.year, year)),

      // 13. 월별 매입 비용
      db.select({
        month: sql<string>`TO_CHAR(${projects.startDate}, 'YYYY-MM')`,
        total: sql<number>`COALESCE(SUM(${projectCosts.total}), 0)`,
      })
      .from(projectCosts)
      .innerJoin(projects, eq(projects.id, projectCosts.projectId))
      .where(and(
        eq(projectCosts.isApproved, true),
        sql`EXTRACT(YEAR FROM ${projects.startDate}) = ${year}`,
      ))
      .groupBy(sql`TO_CHAR(${projects.startDate}, 'YYYY-MM')`),
    ]);

    // ── 그룹/캠페인 조립 ────────────────────────────────────
    const workEndMap    = new Map(workEndRows.map(r => [r.groupId, r.minWorkEnd ?? null]));
    const revTotalMap   = new Map(revTotal.map(r => [r.groupId, Number(r.total)]));
    const revStatsMap   = new Map(revStats.map(r => [r.groupId, { invoiced: Number(r.invoiced), confirmed: Number(r.confirmed), pending: Number(r.pending) }]));
    const costTotalMap  = new Map(costTotal.map(r => [r.groupId, Number(r.total)]));
    const costStatsMap  = new Map(costStats.map(r => [r.groupId, { approved: Number(r.approved), pending: Number(r.pending) }]));
    const campCostMap   = new Map(campCostTotal.map(r => [r.projectId!, Number(r.total)]));
    const campRevMap    = new Map(campRevStats.map(r => [r.projectId!, { invoiced: Number(r.invoiced), confirmed: Number(r.confirmed), pending: Number(r.pending) }]));
    const campCostStMap = new Map(campCostStats.map(r => [r.projectId!, { approved: Number(r.approved), pending: Number(r.pending) }]));

    const campaignsByGroup = new Map<string, object[]>();
    for (const c of allCampaigns) {
      if (!c.projectGroupId) continue;
      const effectiveEnd = c.workEndDate ?? c.endDate;
      const rev  = campRevMap.get(c.id)    ?? { invoiced: 0, confirmed: 0, pending: 0 };
      const cost = campCostStMap.get(c.id) ?? { approved: 0, pending: 0 };
      const camp = {
        ...c,
        workEndDate:      c.workEndDate ?? null,
        daysRemaining:    daysRemaining(effectiveEnd),
        revenueTotal:     Number(c.revenueTotal),
        revenueInvoiced:  rev.invoiced,
        revenueConfirmed: rev.confirmed,
        revenuePending:   rev.pending,
        costTotal:        campCostMap.get(c.id) ?? 0,
        costApproved:     cost.approved,
        costPending:      cost.pending,
      };
      if (!campaignsByGroup.has(c.projectGroupId)) campaignsByGroup.set(c.projectGroupId, []);
      campaignsByGroup.get(c.projectGroupId)!.push(camp);
    }

    const groups = groupRows.map(r => {
      const rev  = revStatsMap.get(r.id)  ?? { invoiced: 0, confirmed: 0, pending: 0 };
      const cost = costStatsMap.get(r.id) ?? { approved: 0, pending: 0 };
      return {
        ...r,
        campaignCount:           Number(r.campaignCount),
        activeCampaignCount:     Number(r.activeCampaignCount),
        activeContractAmount:    r.activeContractAmount ? Number(r.activeContractAmount) : null,
        activeDaysRemaining:     daysRemaining(r.activeEndDate),
        activeWorkDaysRemaining: daysRemaining(workEndMap.get(r.id) ?? null),
        revenueTotal:            revTotalMap.get(r.id) ?? 0,
        revenueInvoiced:         rev.invoiced,
        revenueConfirmed:        rev.confirmed,
        revenuePending:          rev.pending,
        costTotal:               costTotalMap.get(r.id) ?? 0,
        costApproved:            cost.approved,
        costPending:             cost.pending,
        campaigns:               campaignsByGroup.get(r.id) ?? [],
      };
    });

    // ── 매출 KPI 통계 조립 ──────────────────────────────────
    const monthlyCosts = Array.from({ length: 12 }, (_, i) => {
      const m = `${year}-${String(i + 1).padStart(2, "0")}`;
      const row = statsCostRows.find(r => r.month === m);
      return row ? Number(row.total) : 0;
    });

    type MonthEntry = { [team: string]: number };
    const teamMonthMap = new Map<string, MonthEntry[]>();
    for (const p of statsProjectData) {
      const monthStr = useInvoice
        ? (p.refMonth ?? "")
        : (p.startDate ? `${year}-${p.startDate.substring(5, 7)}` : "");
      if (!monthStr || !monthStr.startsWith(`${year}`)) continue;
      const monthIdx = parseInt(monthStr.substring(5, 7)) - 1;
      const team  = p.assignedTeam ?? "";
      const total = p.contractAmount ?? Number(p.totalSum ?? 0);
      if (!teamMonthMap.has(team)) teamMonthMap.set(team, Array.from({ length: 12 }, () => ({ total: 0 })));
      teamMonthMap.get(team)![monthIdx].total += total;
    }

    const rows: { month: string; team: string | null; total: number }[] = [];
    for (const [team, months] of teamMonthMap.entries()) {
      months.forEach((m, i) => {
        if (m.total > 0) rows.push({ month: `${year}-${String(i + 1).padStart(2, "0")}`, team, total: m.total });
      });
    }

    const teams      = Array.from(teamMonthMap.keys()).filter(Boolean) as string[];
    const monthStrs  = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);

    const monthly = monthStrs.map((month, idx) => {
      const monthNum = idx + 1;
      const entry: Record<string, string | number> = { month };
      let total = 0; let kpiTotal = 0;
      for (const team of teams) {
        const row = rows.find(r => r.month === month && r.team === team);
        const v = row ? row.total : 0;
        entry[team] = v; total += v;
        const kpi = kpiRows.find(k => k.month === monthNum && k.team === team);
        const kv = kpi ? kpi.target : 0;
        entry[`kpi_${team}`] = kv; kpiTotal += kv;
      }
      const kpiAll = kpiRows.find(k => k.month === monthNum && k.team === "전체");
      entry.kpiTotal = kpiAll ? kpiAll.target : kpiTotal;
      entry.total  = total;
      entry.cost   = monthlyCosts[idx];
      entry.profit = total - monthlyCosts[idx];
      return entry;
    });

    const yearTotal: Record<string, number> = { total: 0 };
    const yearKpi:   Record<string, number> = { total: 0 };
    for (const team of teams) {
      yearTotal[team] = rows.filter(r => r.team === team).reduce((s, r) => s + r.total, 0);
      yearTotal.total += yearTotal[team];
      yearKpi[team]   = kpiRows.filter(k => k.team === team).reduce((s, k) => s + k.target, 0);
      yearKpi.total  += yearKpi[team];
    }

    const thisMonthNum = new Date().getMonth() + 1;
    const thisMonth    = `${year}-${String(thisMonthNum).padStart(2, "0")}`;
    const currentMonth: Record<string, number> = { total: 0 };
    const currentKpi:   Record<string, number> = { total: 0 };
    for (const team of teams) {
      const row = rows.find(r => r.month === thisMonth && r.team === team);
      currentMonth[team] = row ? row.total : 0;
      currentMonth.total += currentMonth[team];
      const kpi = kpiRows.find(k => k.month === thisMonthNum && k.team === team);
      currentKpi[team]  = kpi ? kpi.target : 0;
      currentKpi.total += currentKpi[team];
    }
    const kpiAllMonth = kpiRows.find(k => k.month === thisMonthNum && k.team === "전체");
    if (kpiAllMonth) currentKpi.total = kpiAllMonth.target;

    const prevDate     = new Date(year, new Date().getMonth() - 1, 1);
    const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
    const prevMonth: Record<string, number> = { total: 0 };
    for (const team of teams) {
      const row = rows.find(r => r.month === prevMonthStr && r.team === team);
      prevMonth[team] = row ? row.total : 0;
      prevMonth.total += prevMonth[team];
    }

    const stats = { monthly, yearTotal, yearKpi, currentMonth, currentKpi, prevMonth: prevMonth, monthlyCosts, teams, year };

    return NextResponse.json({ groups, stats });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
