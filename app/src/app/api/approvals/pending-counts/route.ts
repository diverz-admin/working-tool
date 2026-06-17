import { NextResponse } from "next/server";
import { db } from "@/db";
import { confirmRequests, paymentRequests } from "@/db/schema";
import { eq, count } from "drizzle-orm";

export async function GET() {
  const [[confirmRow], [paymentRow]] = await Promise.all([
    db.select({ cnt: count() }).from(confirmRequests).where(eq(confirmRequests.status, "대기")),
    db.select({ cnt: count() }).from(paymentRequests).where(eq(paymentRequests.status, "대기")),
  ]);

  return NextResponse.json({
    confirm: Number(confirmRow?.cnt ?? 0),
    payment: Number(paymentRow?.cnt ?? 0),
  });
}
