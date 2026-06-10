import { db } from "@/db";
import { projectRevenues, workDailyLogs } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function recalcCompletedQty(revenueId: string): Promise<number> {
  const [row] = await db
    .update(projectRevenues)
    .set({
      completedQty: sql`(SELECT COALESCE(SUM(${workDailyLogs.qty}), 0) FROM ${workDailyLogs} WHERE ${workDailyLogs.revenueId} = ${projectRevenues.id})`,
    })
    .where(eq(projectRevenues.id, revenueId))
    .returning({ completedQty: projectRevenues.completedQty });
  return row?.completedQty ?? 0;
}
