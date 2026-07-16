import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { clientReports } from "@/db/schema";
import { and, eq } from "drizzle-orm";

// 리포트 수기 내용 저장 (광고주+년+월 upsert)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { clientId, year, month } = body;
  if (!clientId || !year || !month) {
    return NextResponse.json({ error: "필수값 누락" }, { status: 400 });
  }

  const values = {
    managerName:     body.managerName     || null,
    summary:         body.summary         || null,
    activityContent: body.activityContent ?? "",
    nextPlanContent: body.nextPlanContent ?? "",
    comment:         body.comment         || null,
  };

  const [existing] = await db.select({ id: clientReports.id }).from(clientReports)
    .where(and(eq(clientReports.clientId, clientId), eq(clientReports.year, year), eq(clientReports.month, month)))
    .limit(1);

  if (existing) {
    const [row] = await db.update(clientReports)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(clientReports.id, existing.id))
      .returning();
    return NextResponse.json({ report: row });
  }

  const [row] = await db.insert(clientReports)
    .values({ clientId, year, month, ...values })
    .returning();
  return NextResponse.json({ report: row }, { status: 201 });
}
