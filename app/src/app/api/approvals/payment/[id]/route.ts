import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { paymentRequests } from "@/db/schema";
import { eq } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const [row] = await db.update(paymentRequests).set({
    ...(body.status       !== undefined && { status:       body.status }),
    ...(body.rejectReason !== undefined && { rejectReason: body.rejectReason }),
  }).where(eq(paymentRequests.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item: row });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await db.delete(paymentRequests).where(eq(paymentRequests.id, id));
  return NextResponse.json({ ok: true });
}
