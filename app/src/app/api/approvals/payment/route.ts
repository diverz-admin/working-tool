import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { paymentRequests } from "@/db/schema";
import { eq, desc, getTableColumns, sql } from "drizzle-orm";

const assignedTeamExpr = sql<string | null>`
  COALESCE(
    ${paymentRequests.assignedTeam},
    (SELECT p.assigned_team FROM projects p WHERE p.id::text = ${paymentRequests.projectId})
  )
`;

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  const rows = await db
    .select({ ...getTableColumns(paymentRequests), assignedTeam: assignedTeamExpr })
    .from(paymentRequests)
    .where(projectId ? eq(paymentRequests.projectId, projectId) : undefined)
    .orderBy(desc(paymentRequests.createdAt));
  return NextResponse.json({ items: rows });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  // 1:1 강제 — 같은 rowKey의 기존 요청을 먼저 삭제
  if (body.rowKey) {
    await db.delete(paymentRequests).where(eq(paymentRequests.rowKey, body.rowKey));
  }

  const [row] = await db.insert(paymentRequests).values({
    projectId:          body.projectId          || null,
    rowKey:             body.rowKey             || null,
    assignedTeam:       body.assignedTeam       || null,
    projectName:        body.projectName        ?? "",
    requester:          body.requester          ?? "",
    productName:        body.productName        ?? "",
    vendor:             body.vendor             ?? "",
    quantity:           body.quantity           || null,
    amount:             body.amount             || null,
    payDate:            body.payDate            || null,
    workStartDate:      body.workStartDate      || null,
    workEndDate:        body.workEndDate        || null,
    invoiceFileUrl:     body.invoiceFileUrl     || null,
    invoiceFileName:    body.invoiceFileName    || null,
    vendorBankAccount:  body.vendorBankAccount  || null,
    requestedAt:        body.requestedAt        ?? new Date().toISOString().slice(0, 10),
    status:             "대기",
  }).returning();
  return NextResponse.json({ item: row }, { status: 201 });
}
