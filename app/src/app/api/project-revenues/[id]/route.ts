import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projectRevenues } from "@/db/schema";
import { eq } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();

    const updates: Record<string, unknown> = {};
    if (body.workCompleted !== undefined) updates.workCompleted = Boolean(body.workCompleted);
    if (body.completedQty  !== undefined) updates.completedQty  = Number(body.completedQty) || 0;
    if (body.workCompleted === true)  updates.completedAt = new Date();
    if (body.workCompleted === false) updates.completedAt = null;

    const [row] = await db.update(projectRevenues).set(updates).where(eq(projectRevenues.id, id)).returning();
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ row });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update revenue row" }, { status: 500 });
  }
}
