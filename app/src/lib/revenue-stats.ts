import { db } from "@/db";
import { projects, projectRevenues, projectCosts } from "@/db/schema";
import { eq, and, sql, isNotNull } from "drizzle-orm";

/**
 * 대시보드와 프로젝트관리(매출 통계)가 동일한 숫자를 보여주도록,
 * 매출·매입 월별 집계를 이 모듈 한 곳에서만 정의한다.
 *
 * 기준(criteria)별 귀속 월
 *   캠페인 시작날짜 → 매출: projects.start_date        / 매입: project_costs.invoice_date
 *   계산서날짜      → 매출: revenues.invoice_date      / 매입: project_costs.invoice_date
 *   통장            → 매출: revenues.payment_date      / 매입: project_costs.purchase_date
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
 * 확정 매출 행 집계. 금액은 항상 SUM(project_revenues.total) — 계약금액(contract_amount)은 쓰지 않는다.
 * 캠페인 시작날짜 기준일 때만 "반려가 아닌 입금확인요청이 존재하는 프로젝트"로 제한한다
 * (다른 두 기준은 계산서 발행일/입금일 자체가 확정 여부를 뜻하므로 NOT NULL 조건이 그 역할을 한다).
 */
export async function fetchRevenueStats(
  year: number,
  criteria: StatsCriteria,
  team?: string,
): Promise<RevenueStatRow[]> {
  const dateExpr =
    criteria === "계산서날짜" ? projectRevenues.invoiceDate
    : criteria === "통장"     ? projectRevenues.paymentDate
    : projects.startDate;

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
        criteria === "캠페인 시작날짜"
          ? sql`EXISTS (SELECT 1 FROM confirm_requests WHERE project_id = ${projects.id} AND status != '반려')`
          : undefined,
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

/** 승인된 매입만. 귀속 월은 매입 행의 계산서 발행일(통장 기준일 때는 승인일)이며, 날짜가 없는 행은 제외된다. */
export async function fetchCostStats(
  year: number,
  criteria: StatsCriteria,
  team?: string,
): Promise<CostStatRow[]> {
  const dateExpr = criteria === "통장" ? projectCosts.purchaseDate : projectCosts.invoiceDate;

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
