import { db } from "@/db";
import { internalLeaveRequests, users } from "@/db/schema";
import { sql } from "drizzle-orm";
import type { LeaveBalance, LeaveItem } from "@/lib/leave";

/** 휴가 테이블 / 연차 컬럼이 없는 DB에서도 동작하도록 보장 (내부지출 라우트와 동일한 패턴) */
export async function ensureLeaveSchema() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS internal_leave_requests (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      title         TEXT        NOT NULL,
      leave_type    TEXT        NOT NULL,
      requester     TEXT        NOT NULL,
      start_date    DATE        NOT NULL,
      end_date      DATE,
      requested_at  DATE        NOT NULL,
      leave_days    REAL        NOT NULL DEFAULT 0,
      note          TEXT,
      status        TEXT        NOT NULL DEFAULT '대기',
      reject_reason TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS annual_leave_days REAL NOT NULL DEFAULT 15
  `);
}

/** 사용자별 당해 연도 연차 잔여일수 — 승인된 요청의 차감 일수를 합산해 산출 */
export async function loadLeaveBalances(items: LeaveItem[]): Promise<Record<string, LeaveBalance>> {
  const year = String(new Date().getFullYear());
  const rows = await db
    .select({ name: users.name, granted: users.annualLeaveDays })
    .from(users);

  const balances: Record<string, LeaveBalance> = {};
  for (const r of rows) {
    balances[r.name] = { granted: r.granted ?? 0, used: 0, remaining: r.granted ?? 0 };
  }

  for (const item of items) {
    if (item.status !== "승인") continue;
    if (!item.startDate.startsWith(year)) continue;
    const b = balances[item.requester] ?? (balances[item.requester] = { granted: 0, used: 0, remaining: 0 });
    b.used += item.leaveDays;
  }

  for (const b of Object.values(balances)) {
    b.remaining = Math.round((b.granted - b.used) * 10) / 10;
  }
  return balances;
}

export { internalLeaveRequests };
