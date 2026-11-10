import { db } from "@/db";
import { projects, projectCosts } from "@/db/schema";
import { eq, and, sql, isNotNull, is, Column, getTableName, type AnyColumn, type SQL } from "drizzle-orm";

/**
 * 대시보드와 프로젝트관리(매출 통계)가 동일한 숫자를 보여주도록,
 * 매출·매입 월별 집계를 이 모듈 한 곳에서만 정의한다.
 *
 * 기준(criteria)별 귀속 월
 *   캠페인 시작날짜 → 매출: projects.start_date        / 매입: project_costs.work_start_date (작업시작일)
 *   계산서날짜      → 매출: confirm_requests.tax_invoice_date     / 매입: project_costs.purchase_date (확인일)
 *   통장            → 매출: confirm_requests.deposit_confirmed_at / 매입: project_costs.purchase_date (확인일)
 *
 * 금액은 항상 공급가(VAT 제외) 기준이며, 매출 금액의 출처는 기준에 따라 다르다.
 *   캠페인 시작날짜 → 수주 기준: 입금확인요청이 확인완료된 프로젝트의 계약 공급가(projects.kpi_supply)
 *   계산서날짜·통장 → 실적 기준: 결재확인 요청 금액(fetchConfirmRevenue 참고)
 */
export type StatsCriteria = "캠페인 시작날짜" | "계산서날짜" | "통장";

export function parseCriteria(raw: string | null): StatsCriteria {
  return raw === "계산서날짜" || raw === "통장" ? raw : "캠페인 시작날짜";
}

/**
 * 캠페인 시작날짜(수주) 기준에서 매출로 인정되는 프로젝트 — 입금확인요청이 확인완료된 것만.
 * 대기·반려 중이거나 요청이 없는(반려 후 삭제해 재요청 전인 경우 포함) 프로젝트는 매출에서 뺀다.
 */
export function isRevenueConfirmed(projectId: AnyColumn | SQL) {
  // 단일 테이블 select 목록에서는 drizzle이 컬럼을 테이블명 없이 "id"로 찍는데,
  // 서브쿼리 안에서는 그게 cr.id로 해석돼 항상 false가 된다 — 테이블명을 직접 붙인다.
  const ref = is(projectId, Column)
    ? sql`${sql.identifier(getTableName(projectId.table))}.${sql.identifier(projectId.name)}`
    : projectId;
  return sql<boolean>`EXISTS (SELECT 1 FROM confirm_requests cr WHERE cr.project_id = ${ref} AND cr.status = '확인완료')`;
}

/**
 * 계산서날짜·통장 기준 매출 = 결재확인(입금확인요청)에 기록된 발행일·입금확인일과 요청 금액.
 *
 * 계산서 발행·입금 확인은 요청 단위(대부분 계약금액 일괄 "__contract__")로 기록된다.
 * 매출 행(project_revenues)에도 날짜를 복사해 두지만, 복사 시점 이후에 추가된 행엔 날짜가 없고
 * 매출 행 합계가 계약금액과 다른 경우가 많아 행 기준으로 집계하면 매출이 크게 빠진다.
 *
 * 금액: 계약 일괄 요청이고 요청 금액이 프로젝트 계약금액과 같으면 계약 공급가·세액을 그대로 쓰고,
 * 그 외에는 요청 금액(VAT 포함)에서 공급가를 역산한다.
 */
export type ConfirmRevenueKind = "invoice" | "deposit";

export interface ConfirmRevenueRow {
  id:             string;          // 결재확인 요청 id
  projectId:      string | null;
  campaignName:   string | null;
  assignedTeam:   string | null;
  assignedPerson: string | null;
  startDate:      string | null;
  clientName:     string | null;
  productName:    string;
  invoiceDate:    string | null;   // 계산서 발행일
  paymentDate:    string | null;   // 입금 확인일
  total:          number;          // VAT 포함
  supplyPrice:    number;
  tax:            number;
}

export async function fetchConfirmRevenue(
  kind: ConfirmRevenueKind,
  from: string,
  to: string,
  opts: { team?: string; projectIds?: string[] } = {},
): Promise<ConfirmRevenueRow[]> {
  if (opts.projectIds && opts.projectIds.length === 0) return [];
  const dateCol = kind === "invoice" ? sql`cr.tax_invoice_date` : sql`cr.deposit_confirmed_at`;
  const rows = await db.execute<{
    id: string; project_id: string | null; campaign_name: string | null;
    assigned_team: string | null; assigned_person: string | null; start_date: string | null;
    client_name: string | null; product_name: string | null;
    tax_invoice_date: string | null; deposit_confirmed_at: string | null;
    row_key: string | null; amount: string | null;
    contract_amount: number | null; kpi_supply: number | null; kpi_tax: number | null;
  }>(sql`
    SELECT cr.id, cr.project_id, p.campaign_name,
           COALESCE(p.assigned_team, cr.assigned_team) AS assigned_team,
           p.assigned_person, p.start_date::text AS start_date,
           COALESCE(c.company_name, cr.client_name) AS client_name,
           cr.product_name, cr.tax_invoice_date, cr.deposit_confirmed_at,
           cr.row_key, cr.amount, p.contract_amount, p.kpi_supply, p.kpi_tax
    FROM confirm_requests cr
    LEFT JOIN projects p ON p.id = cr.project_id
    LEFT JOIN clients  c ON c.id = p.client_id
    WHERE cr.status <> '반려'
      AND ${dateCol} IS NOT NULL AND ${dateCol} <> ''
      AND ${dateCol} >= ${from} AND ${dateCol} <= ${to}
      ${opts.team ? sql`AND COALESCE(p.assigned_team, cr.assigned_team) = ${opts.team}` : sql``}
      ${opts.projectIds ? sql`AND cr.project_id IN (${sql.join(opts.projectIds.map(id => sql`${id}`), sql`, `)})` : sql``}
    ORDER BY ${dateCol}
  `);

  return Array.from(rows).map(r => {
    const total = Number(String(r.amount ?? "").replace(/[^0-9]/g, "")) || 0;
    const isContract = r.row_key === "__contract__"
      && r.kpi_supply != null && r.contract_amount != null && Number(r.contract_amount) === total;
    const supplyPrice = isContract ? Number(r.kpi_supply) : Math.round(total / 1.1);
    const tax = isContract && r.kpi_tax != null ? Number(r.kpi_tax) : total - supplyPrice;
    return {
      id:             r.id,
      projectId:      r.project_id,
      campaignName:   r.campaign_name,
      assignedTeam:   r.assigned_team,
      assignedPerson: r.assigned_person,
      startDate:      r.start_date,
      clientName:     r.client_name,
      productName:    r.product_name || (r.row_key === "__contract__" ? "계약금액" : ""),
      invoiceDate:    r.tax_invoice_date,
      paymentDate:    r.deposit_confirmed_at,
      total, supplyPrice, tax,
    };
  });
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
 * 해당 월에 시작한 프로젝트 중 입금확인요청이 확인완료된 것을 계약 공급가(kpi_supply)로 집계한다.
 * 매출 행이 아직 입력되지 않은 프로젝트도 포함하며, 계약 금액이 비어 있는 프로젝트만 실제 매출 행 합계로 대체한다.
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
      AND ${isRevenueConfirmed(sql`p.id`)}
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

  const kind: ConfirmRevenueKind = criteria === "계산서날짜" ? "invoice" : "deposit";
  const rows = await fetchConfirmRevenue(kind, `${year}-01-01`, `${year}-12-31`, { team });

  const buckets = new Map<string, RevenueStatRow & { projects: Set<string> }>();
  for (const r of rows) {
    const date = kind === "invoice" ? r.invoiceDate : r.paymentDate;
    if (!date) continue;
    const dateMonth = date.substring(0, 7);
    const key = `${dateMonth}|${r.assignedTeam ?? ""}`;
    let b = buckets.get(key);
    if (!b) {
      b = { dateMonth, assignedTeam: r.assignedTeam, totalSum: 0, supplySum: 0, taxSum: 0, projectCount: 0, projects: new Set() };
      buckets.set(key, b);
    }
    b.totalSum  += r.total;
    b.supplySum += r.supplyPrice;
    b.taxSum    += r.tax;
    b.projects.add(r.projectId ?? r.id);
  }
  return Array.from(buckets.values()).map(({ projects: ps, ...b }) => ({ ...b, projectCount: ps.size }));
}

/** 승인된 매입만. 귀속 월은 통장·계산서날짜 기준→매입 확인일(결재 승인일), 캠페인 시작날짜 기준→작업시작일이며, 해당 날짜가 없는 행은 제외된다. */
export async function fetchCostStats(
  year: number,
  criteria: StatsCriteria,
  team?: string,
): Promise<CostStatRow[]> {
  const dateExpr =
    criteria === "통장" || criteria === "계산서날짜" ? projectCosts.purchaseDate   // 매입은 계산서 기준도 확인일
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
