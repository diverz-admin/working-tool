import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { internalExpenseRequests } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const [item] = await db
    .update(internalExpenseRequests)
    .set({
      status:       body.status       ?? undefined,
      rejectReason: body.rejectReason ?? null,
      updatedAt:    new Date(),
    })
    .where(eq(internalExpenseRequests.id, id))
    .returning();

  return NextResponse.json({ item });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.delete(internalExpenseRequests).where(eq(internalExpenseRequests.id, id));
  return NextResponse.json({ ok: true });
}
