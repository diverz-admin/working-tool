import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectRevenues, projectCosts } from "@/db/schema";
import { eq, and, gte, lte, isNotNull, inArray, sql } from "drizzle-orm";
import { monthRange } from "@/lib/month-range";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const year  = parseInt(searchParams.get("year")  ?? String(new Date().getFullYear()));
    const month = parseInt(searchParams.get("month") ?? "0"); // 0 = 연간 전체
    const team  = searchParams.get("team") ?? "";
    const criteria   = searchParams.get("criteria") ?? "캠페인 시작날짜";
    const useBank    = criteria === "통장";
    const useInvoice = criteria === "계산서날짜";
    // 캠페인 시작날짜 = 수주 기준(계약 공급가) / 나머지 = 실적 기준(실제 매출 행). 금액은 모두 공급가.
    const useContract = !useBank && !useInvoice;

    const from = month > 0 ? monthRange(year, month).from : `${year}-01-01`;
    const to   = month > 0 ? monthRange(year, month).to   : `${year}-12-31`;

    // 프로젝트 목록 — 캠페인 시작일 기준 필터링
    const projectRows = await db
      .select({
        id:             projects.id,
        campaignName:   projects.campaignName,
        advertiser:     projects.advertiser,
        assignedTeam:   projects.assignedTeam,
        assignedPerson: projects.assignedPerson,
        contractAmount: projects.contractAmount,
        kpiSupply:      projects.kpiSupply,
        status:         projects.status,
        startDate:      projects.startDate,
        endDate:        projects.endDate,
      })
      .from(projects)
      .where(
        and(
          team ? eq(projects.assignedTeam, team) : undefined,
          // 통장: 기간 내 입금/승인지급 활동 / 계산서: 기간 내 계산서 발행 활동 / 그 외: 캠페인 시작일이 기간 내
          useBank
            ? sql`(
                EXISTS (SELECT 1 FROM project_revenues pr WHERE pr.project_id = ${projects.id} AND pr.payment_date >= ${from} AND pr.payment_date <= ${to})
                OR EXISTS (SELECT 1 FROM project_costs pc WHERE pc.project_id = ${projects.id} AND pc.is_approved = true AND pc.purchase_date >= ${from} AND pc.purchase_date <= ${to})
              )`
            : useInvoice
            ? sql`(
                EXISTS (SELECT 1 FROM project_revenues pr WHERE pr.project_id = ${projects.id} AND pr.invoice_date >= ${from} AND pr.invoice_date <= ${to})
                OR EXISTS (SELECT 1 FROM project_costs pc WHERE pc.project_id = ${projects.id} AND pc.is_approved = true AND pc.invoice_date >= ${from} AND pc.invoice_date <= ${to})
              )`
            // 캠페인 시작일이 기간 내이거나, 기간 내 작업시작일을 가진 승인 매입이 있는 프로젝트
            // (매출이 먼저 잡히고 매입은 실제 작업에 들어가야 생기므로, 시작월이 지난 프로젝트의 매입도 잡아야 한다)
            : sql`(
                (${projects.startDate} IS NOT NULL AND ${projects.startDate} >= ${from} AND ${projects.startDate} <= ${to})
                OR EXISTS (SELECT 1 FROM project_costs pc WHERE pc.project_id = ${projects.id} AND pc.is_approved = true AND pc.work_start_date >= ${from} AND pc.work_start_date <= ${to})
              )`,
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
          // 통장: 입금 확인일(paymentDate) 기간 내 = 입금 승인된 행 / 계산서: 발행일(invoiceDate) 기간 내 = 발행된 행 / 그 외: 입금확인요청(반려 제외)
          useBank
            ? and(
                isNotNull(projectRevenues.paymentDate),
                gte(projectRevenues.paymentDate, from),
                lte(projectRevenues.paymentDate, to),
              )
            : useInvoice
            ? and(
                isNotNull(projectRevenues.invoiceDate),
                gte(projectRevenues.invoiceDate, from),
                lte(projectRevenues.invoiceDate, to),
              )
            // 수주 기준에서는 금액을 프로젝트 계약 공급가로 잡으므로, 매출 행은 상세 표시용으로만 전부 가져온다
            : undefined,
        )
      );

    // 승인 매입 — 통장: 승인일(purchaseDate) / 계산서: 발행일(invoiceDate) / 캠페인 시작(그 외): 작업시작일(workStartDate)
    const costDate = useBank ? projectCosts.purchaseDate : useInvoice ? projectCosts.invoiceDate : projectCosts.workStartDate;
    const costRows = await db
      .select({
        projectId:     projectCosts.projectId,
        invoiceDate:   projectCosts.invoiceDate,
        purchaseDate:  projectCosts.purchaseDate,
        workStartDate: projectCosts.workStartDate,
        total:         projectCosts.total,
        supplyPrice:   projectCosts.supplyPrice,
        productName:   projectCosts.productName,
        vendor:        projectCosts.vendor,
      })
      .from(projectCosts)
      .where(
        and(
          inArray(projectCosts.projectId, projectIds),
          eq(projectCosts.isApproved, true),
          and(isNotNull(costDate), gte(costDate, from), lte(costDate, to)),
        )
      );

    const revByProject  = groupBy(revRows,  r => r.projectId ?? "");
    const costByProject = groupBy(costRows, c => c.projectId ?? "");

    // 캠페인 시작일이 조회 기간 안에 있는가 (수주 기준 매출 귀속 조건)
    const startsInRange = (d: string | null) => Boolean(d && d >= from && d <= to);

    /** 프로젝트 매출액(공급가). 수주 기준은 계약 공급가, 실적 기준은 실제 매출 행 공급가 합. */
    const revenueOf = (p: { startDate: string | null; kpiSupply: number | null; id: string }) => {
      const revs = revByProject[p.id] ?? [];
      if (!useContract) return sum(revs, r => r.supplyPrice ?? 0);
      // 기간 내 매입 때문에 포함된, 시작월이 지난 프로젝트는 이 달의 매출이 아니다
      if (!startsInRange(p.startDate)) return 0;
      return p.kpiSupply ?? sum(revs, r => r.supplyPrice ?? 0);
    };

    // 프로젝트별 집계
    const projectSummaries = projectRows.map(p => {
      const revs    = revByProject[p.id]  ?? [];
      const costs   = costByProject[p.id] ?? [];
      const revenue = revenueOf(p);
      const cost    = sum(costs, c => c.supplyPrice ?? 0);
      const margin  = revenue - cost;
      return {
        ...p,
        revenue, cost, margin,
        marginRate: revenue > 0 ? round1(margin / revenue * 100) : 0,
        revenueRows: revs,
        costRows:    costs,
      };
    }).filter(p => p.revenue > 0 || p.cost > 0 || p.contractAmount);

    // 월별 집계 (12개월)
    const monthly = Array.from({ length: 12 }, (_, i) => emptyMonth(i + 1));
    if (useContract) {
      // 수주 기준: 프로젝트 1건 = 계약 공급가 1건, 캠페인 시작월에 귀속
      for (const p of projectRows) {
        const amount = revenueOf(p);
        if (!p.startDate || amount === 0) continue;
        const m = parseInt(p.startDate.substring(5, 7)) - 1;
        monthly[m].revenue     += amount;
        monthly[m].supplyPrice += amount;
        monthly[m].count       += 1;
      }
    } else {
      for (const r of revRows) {
        const refDate = useBank ? r.paymentDate : r.invoiceDate;
        if (!refDate) continue;
        const m = parseInt(refDate.substring(5, 7)) - 1;
        monthly[m].revenue     += r.supplyPrice ?? 0;
        monthly[m].supplyPrice += r.supplyPrice ?? 0;
        monthly[m].count       += 1;
      }
    }
    // 매입 귀속 월 — 통장: 승인일(purchaseDate) / 계산서: 발행일(invoiceDate) / 캠페인 시작: 작업시작일(workStartDate)
    for (const c of costRows) {
      const cd = useBank ? c.purchaseDate : useInvoice ? c.invoiceDate : c.workStartDate;
      if (!cd) continue;
      const m = parseInt(cd.substring(5, 7)) - 1;
      monthly[m].cost += c.supplyPrice ?? 0;
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

      // 팀별 월별 — 매출: 수주 기준은 캠페인 시작월, 실적 기준은 입금일·발행월 / 매입: 작업시작일·승인일·발행월
      const teamMonthly = Array.from({ length: 12 }, (_, i) => emptyMonth(i + 1));
      for (const p of ps) {
        if (useContract) {
          const rm = p.startDate && p.revenue > 0 ? parseInt(p.startDate.substring(5, 7)) - 1 : -1;
          if (rm >= 0) {
            teamMonthly[rm].revenue += p.revenue;
            teamMonthly[rm].count   += 1;
          }
        } else {
          for (const r of p.revenueRows) {
            const refDate = useBank ? r.paymentDate : r.invoiceDate;
            const rm = refDate ? parseInt(refDate.substring(5, 7)) - 1 : -1;
            if (rm >= 0) {
              teamMonthly[rm].revenue += r.supplyPrice ?? 0;
              teamMonthly[rm].count   += 1;
            }
          }
        }
        for (const c of p.costRows) {
          const cd = useBank ? c.purchaseDate : useInvoice ? c.invoiceDate : c.workStartDate;
          const cm = cd ? parseInt(cd.substring(5, 7)) - 1 : -1;
          if (cm >= 0) teamMonthly[cm].cost += c.supplyPrice ?? 0;
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
