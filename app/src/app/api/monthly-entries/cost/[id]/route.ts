import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { monthlyCosts } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body   = await req.json();
  const [row]  = await db.update(monthlyCosts).set({
    assignee:    body.assignee    ?? null,
    entryDate:   body.entryDate   ?? null,
    vendor:      body.vendor      ?? null,
    productName: body.productName ?? null,
    quantity:    body.quantity    ?? null,
    supplyPrice: body.supplyPrice ?? 0,
    tax:         body.tax         ?? 0,
    total:       body.total       ?? 0,
    invoiceDate: body.invoiceDate ?? null,
    updatedAt:   new Date(),
  }).where(eq(monthlyCosts.id, id)).returning();
  return NextResponse.json({ row });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.delete(monthlyCosts).where(eq(monthlyCosts.id, id));
  return NextResponse.json({ ok: true });
}
