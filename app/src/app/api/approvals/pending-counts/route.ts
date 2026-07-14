import { NextResponse } from "next/server";
import { db } from "@/db";
import { confirmRequests, paymentRequests, internalExpenseRequests, internalLeaveRequests } from "@/db/schema";
import { eq, count } from "drizzle-orm";
import { ensureLeaveSchema } from "@/lib/leaveDb";

export async function GET() {
  await ensureLeaveSchema();

  const [[confirmRow], [paymentRow], [expenseRow], [leaveRow]] = await Promise.all([
    db.select({ cnt: count() }).from(confirmRequests).where(eq(confirmRequests.status, "대기")),
    db.select({ cnt: count() }).from(paymentRequests).where(eq(paymentRequests.status, "대기")),
    db.select({ cnt: count() }).from(internalExpenseRequests).where(eq(internalExpenseRequests.status, "대기")),
    db.select({ cnt: count() }).from(internalLeaveRequests).where(eq(internalLeaveRequests.status, "대기")),
  ]);

  return NextResponse.json({
    confirm: Number(confirmRow?.cnt ?? 0),
    payment: Number(paymentRow?.cnt ?? 0),
    expense: Number(expenseRow?.cnt ?? 0),
    leave:   Number(leaveRow?.cnt ?? 0),
  });
}
