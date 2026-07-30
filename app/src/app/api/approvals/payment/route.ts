import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { paymentRequests } from "@/db/schema";
import { eq, desc, getTableColumns, sql } from "drizzle-orm";

const assignedTeamExpr = sql<string | null>`
  COALESCE(
    ${paymentRequests.assignedTeam},
    (SELECT p.assigned_team FROM projects p WHERE p.id = ${paymentRequests.projectId})
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

  const projectId         = body.projectId         || null;
  const rowKey            = body.rowKey             || null;
  const assignedTeam      = body.assignedTeam       || null;
  const projectName       = body.projectName        ?? "";
  const requester         = body.requester          ?? "";
  const productName       = body.productName        ?? "";
  const vendor            = body.vendor             ?? "";
  const quantity          = body.quantity           || null;
  const amount            = body.amount             || null;
  const unitPrice         = Number.isFinite(Number(body.unitPrice)) && Number(body.unitPrice) > 0
                              ? Math.round(Number(body.unitPrice)) : null;
  const payDate           = body.payDate            || null;
  const workStartDate     = body.workStartDate      || null;
  const workEndDate       = body.workEndDate        || null;
  const invoiceFileUrl    = body.invoiceFileUrl     || null;
  const invoiceFileName   = body.invoiceFileName    || null;
  const vendorBankAccount = body.vendorBankAccount  || null;
  const requestedAt       = body.requestedAt        ?? new Date().toISOString().slice(0, 10);

  if (rowKey) {
    // DELETE + INSERT in a single DB round trip via CTE
    const result = await db.execute(sql`
      WITH deleted AS (
        DELETE FROM payment_requests WHERE row_key = ${rowKey} AND project_id = ${projectId}
      )
      INSERT INTO payment_requests (
        project_id, row_key, assigned_team, project_name, requester,
        product_name, vendor, quantity, amount, unit_price, pay_date, work_start_date,
        work_end_date, invoice_file_url, invoice_file_name, vendor_bank_account,
        requested_at, status
      ) VALUES (
        ${projectId}, ${rowKey}, ${assignedTeam}, ${projectName}, ${requester},
        ${productName}, ${vendor}, ${quantity}, ${amount}, ${unitPrice}, ${payDate},
        ${workStartDate}, ${workEndDate}, ${invoiceFileUrl}, ${invoiceFileName},
        ${vendorBankAccount}, ${requestedAt}, '대기'
      ) RETURNING *
    `);
    const raw = (result as unknown as Record<string, unknown>[])[0] ?? {};
    const item = {
      id:                raw.id,
      projectId:         raw.project_id,
      rowKey:            raw.row_key,
      assignedTeam:      raw.assigned_team,
      projectName:       raw.project_name,
      requester:         raw.requester,
      productName:       raw.product_name,
      vendor:            raw.vendor,
      quantity:          raw.quantity,
      amount:            raw.amount,
      unitPrice:         raw.unit_price,
      payDate:           raw.pay_date,
      workStartDate:     raw.work_start_date,
      workEndDate:       raw.work_end_date,
      invoiceFileUrl:    raw.invoice_file_url,
      invoiceFileName:   raw.invoice_file_name,
      vendorBankAccount: raw.vendor_bank_account,
      requestedAt:       raw.requested_at,
      status:            raw.status,
      rejectReason:      raw.reject_reason,
    };
    return NextResponse.json({ item }, { status: 201 });
  }

  const [row] = await db.insert(paymentRequests).values({
    projectId, rowKey, assignedTeam, projectName, requester,
    productName, vendor, quantity, amount, unitPrice, payDate, workStartDate,
    workEndDate, invoiceFileUrl, invoiceFileName, vendorBankAccount,
    requestedAt, status: "대기",
  }).returning();
  return NextResponse.json({ item: row }, { status: 201 });
}
