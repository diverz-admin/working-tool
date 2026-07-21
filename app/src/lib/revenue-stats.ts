import { db } from "@/db";
import { projects, projectRevenues, projectCosts } from "@/db/schema";
import { eq, and, sql, isNotNull } from "drizzle-orm";

/**
 * 대시보드와 프로젝트관리(매출 통계)가 동일한 숫자를 보여주도록,
 * 매출·매입 월별 집계를 이 모듈 한 곳에서만 정의한다.
 *
 * 기준(criteria)별 귀속 월
 *   캠페인 시작날짜 → 매출: projects.start_date        / 매입: project_costs.work_start_date (작업시작일)
 *   계산서날짜      → 매출: revenues.invoice_date      / 매입: project_costs.invoice_date
 *   통장            → 매출: revenues.payment_date      / 매입: project_costs.purchase_date
 *
 * 금액은 항상 공급가(VAT 제외) 기준이며, 매출 금액의 출처는 기준에 따라 다르다.
 *   캠페인 시작날짜 → 수주 기준: 프로젝트의 계약 공급가(projects.kpi_supply)
 *   계산서날짜·통장 → 실적 기준: 실제 매출 행(project_revenues.supply_price)
 */
export type StatsCriteria = "캠페인 시작날짜" | "계산서날짜" | "통장";

export function parseCriteria(raw: string | null): StatsCriteria {
  return raw === "계산서날짜" || raw === "통장" ? raw : "캠페인 시작날짜";
}

export interface RevenueStatRow {
  dateMonth: string;            // 'YYYY-MM'
  assignedTeam: string | null;
  totalSum: number;             // VAT 포함
  supplySum: number;
  taxSum: number;
  projectCount: number;
}

export interface CostStatRow {
  month: string;                // 'YYYY-MM'
  total: number;                // VAT 포함
  supplyPrice: number;
  tax: number;
  count: number;
}

/**
 * 캠페인 시작날짜 기준 = 수주 기준.
 * 해당 월에 시작한 모든 프로젝트를 계약 공급가(kpi_supply)로 집계한다.
 * 매출 행이 아직 입력되지 않았거나 입금확인요청이 없는 프로젝트도 빠짐없이 포함하며,
 * 계약 금액이 비어 있는 프로젝트만 실제 매출 행 합계로 대체한다.
 */
async function fetchContractRevenueStats(
  year: number,
  team?: string,
): Promise<RevenueStatRow[]> {
  const rows = await db.execute<{
    date_month: string;
    assigned_team: string | null;
    total_sum: string | number;
    supply_sum: string | number;
    tax_sum: string | number;
    project_count: string | number;
  }>(sql`
    SELECT TO_CHAR(p.start_date, 'YYYY-MM')                          AS date_month,
           p.assigned_team                                           AS assigned_team,
           COALESCE(SUM(COALESCE(p.contract_amount, rv.total_sum, 0)), 0)  AS total_sum,
           COALESCE(SUM(COALESCE(p.kpi_supply,      rv.supply_sum, 0)), 0) AS supply_sum,
           COALESCE(SUM(COALESCE(p.kpi_tax,         rv.tax_sum, 0)), 0)    AS tax_sum,
           COUNT(*)                                                  AS project_count
    FROM projects p
    LEFT JOIN (
      SELECT project_id,
             SUM(total)        AS total_sum,
             SUM(supply_price) AS supply_sum,
             SUM(tax)          AS tax_sum
      FROM project_revenues
      GROUP BY project_id
    ) rv ON rv.project_id = p.id
    WHERE p.start_date IS NOT NULL
      AND EXTRACT(YEAR FROM p.start_date) = ${year}
      ${team ? sql`AND p.assigned_team = ${team}` : sql``}
    GROUP BY 1, p.assigned_team
  `);

  return Array.from(rows).map(r => ({
    dateMonth:    r.date_month,
    assignedTeam: r.assigned_team,
    totalSum:     Number(r.total_sum     ?? 0),
    supplySum:    Number(r.supply_sum    ?? 0),
    taxSum:       Number(r.tax_sum       ?? 0),
    projectCount: Number(r.project_count ?? 0),
  }));
}

/**
 * 계산서날짜·통장 기준 = 실적 기준. 실제 매출 행을 그 행에 기록된 날짜로 귀속시킨다
 * (날짜가 기록돼 있다는 것 자체가 발행·입금 확정을 뜻하므로 별도 확정 조건은 두지 않는다).
 */
export async function fetchRevenueStats(
  year: number,
  criteria: StatsCriteria,
  team?: string,
): Promise<RevenueStatRow[]> {
  if (criteria === "캠페인 시작날짜") return fetchContractRevenueStats(year, team);

  const dateExpr =
    criteria === "계산서날짜" ? projectRevenues.invoiceDate : projectRevenues.paymentDate;

  const teamFilter = team ? eq(projects.assignedTeam, team) : undefined;

  const raw = await db
    .select({
      dateMonth:    sql<string>`TO_CHAR(${dateExpr}, 'YYYY-MM')`,
      assignedTeam: projects.assignedTeam,
      totalSum:     sql<number>`COALESCE(SUM(${projectRevenues.total}), 0)`,
      supplySum:    sql<number>`COALESCE(SUM(${projectRevenues.supplyPrice}), 0)`,
      taxSum:       sql<number>`COALESCE(SUM(${projectRevenues.tax}), 0)`,
      projectCount: sql<number>`COUNT(DISTINCT ${projects.id})`,
    })
    .from(projectRevenues)
    .innerJoin(projects, eq(projects.id, projectRevenues.projectId))
    .where(
      and(
        isNotNull(dateExpr),
        sql`EXTRACT(YEAR FROM ${dateExpr}) = ${year}`,
        teamFilter,
      ),
    )
    .groupBy(sql`TO_CHAR(${dateExpr}, 'YYYY-MM')`, projects.assignedTeam);

  return raw.map(r => ({
    dateMonth:    r.dateMonth,
    assignedTeam: r.assignedTeam,
    totalSum:     Number(r.totalSum    ?? 0),
    supplySum:    Number(r.supplySum   ?? 0),
    taxSum:       Number(r.taxSum      ?? 0),
    projectCount: Number(r.projectCount ?? 0),
  }));
}

/** 승인된 매입만. 귀속 월은 계산서날짜 기준→계산서 발행일, 통장 기준→입금승인일, 캠페인 시작날짜 기준→작업시작일이며, 해당 날짜가 없는 행은 제외된다. */
export async function fetchCostStats(
  year: number,
  criteria: StatsCriteria,
  team?: string,
): Promise<CostStatRow[]> {
  const dateExpr =
    criteria === "통장"       ? projectCosts.purchaseDate
    : criteria === "계산서날짜" ? projectCosts.invoiceDate
    : projectCosts.workStartDate;   // 캠페인 시작날짜 기준 → 매입은 작업시작일

  const raw = await db
    .select({
      month:       sql<string>`TO_CHAR(${dateExpr}, 'YYYY-MM')`,
      total:       sql<number>`COALESCE(SUM(${projectCosts.total}), 0)`,
      supplyPrice: sql<number>`COALESCE(SUM(${projectCosts.supplyPrice}), 0)`,
      tax:         sql<number>`COALESCE(SUM(${projectCosts.tax}), 0)`,
      count:       sql<number>`COUNT(*)`,
    })
    .from(projectCosts)
    .innerJoin(projects, eq(projects.id, projectCosts.projectId))
    .where(
      and(
        eq(projectCosts.isApproved, true),
        isNotNull(dateExpr),
        sql`EXTRACT(YEAR FROM ${dateExpr}) = ${year}`,
        team ? eq(projects.assignedTeam, team) : undefined,
      ),
    )
    .groupBy(sql`TO_CHAR(${dateExpr}, 'YYYY-MM')`);

  return raw.map(r => ({
    month:       r.month,
    total:       Number(r.total       ?? 0),
    supplyPrice: Number(r.supplyPrice ?? 0),
    tax:         Number(r.tax         ?? 0),
    count:       Number(r.count       ?? 0),
  }));
}

/** 12칸(1~12월) 배열로 접기. */
export function toMonthlyBuckets(
  revRows: RevenueStatRow[],
  costRows: CostStatRow[],
) {
  const revenue = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1, total: 0, supplyPrice: 0, tax: 0, count: 0,
  }));
  const cost = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1, total: 0, supplyPrice: 0, tax: 0, count: 0,
  }));

  for (const r of revRows) {
    const i = monthIndex(r.dateMonth);
    if (i < 0) continue;
    revenue[i].total       += r.totalSum;
    revenue[i].supplyPrice += r.supplySum;
    revenue[i].tax         += r.taxSum;
    revenue[i].count       += r.projectCount;
  }
  for (const c of costRows) {
    const i = monthIndex(c.month);
    if (i < 0) continue;
    cost[i].total       += c.total;
    cost[i].supplyPrice += c.supplyPrice;
    cost[i].tax         += c.tax;
    cost[i].count       += c.count;
  }
  return { revenue, cost };
}

function monthIndex(yyyymm: string | null): number {
  if (!yyyymm) return -1;
  const i = parseInt(yyyymm.substring(5, 7)) - 1;
  return i >= 0 && i <= 11 ? i : -1;
}
