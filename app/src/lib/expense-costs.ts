import { db } from "@/db";
import { internalExpenseRequests } from "@/db/schema";
import { eq, and, gte, lte, isNotNull } from "drizzle-orm";

export interface CostCell {
  year: number;
  month: number;
  category: string;
  item: string;
  amount: number;
}

/**
 * 승인된 내부지출을 판관비 카테고리·월별 합계 셀로 더한다 (요청일 기준).
 * 연간·월간·대시보드가 같은 규칙으로 지출을 잡도록 한 곳에서만 계산한다.
 * costs 배열을 직접 수정한다.
 */
export async function addApprovedExpenses(costs: CostCell[], year: number, range?: { from: string; to: string }) {
  let rows: { requestedAt: string | null; amount: number | null; expenseCategory: string | null }[] = [];
  try {
    rows = await db.select({
      requestedAt:     internalExpenseRequests.requestedAt,
      amount:          internalExpenseRequests.amount,
      expenseCategory: internalExpenseRequests.expenseCategory,
    }).from(internalExpenseRequests)
      .where(and(
        eq(internalExpenseRequests.status, "승인"),
        isNotNull(internalExpenseRequests.expenseCategory),
        gte(internalExpenseRequests.requestedAt, range?.from ?? `${year}-01-01`),
        lte(internalExpenseRequests.requestedAt, range?.to ?? `${year}-12-31`),
      ));
  } catch { /* expense_category 컬럼 없으면 무시 */ }

  for (const r of rows) {
    if (!r.requestedAt || !r.amount || !r.expenseCategory) continue;
    const month = parseInt(r.requestedAt.substring(5, 7));
    const existing = costs.find(c => c.category === r.expenseCategory && c.month === month && c.item === "합계");
    if (existing) existing.amount += r.amount;
    else costs.push({ year, month, category: r.expenseCategory, item: "합계", amount: r.amount });
  }
  return costs;
}
