import { NextResponse } from "next/server";
import { db } from "@/db";
import { projectRevenues } from "@/db/schema";
import { eq } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();

    const update: Partial<typeof projectRevenues.$inferInsert> = {};
    if (body.completedQty !== undefined) update.completedQty = Number(body.completedQty);
    if (body.workCompleted !== undefined) {
      update.workCompleted = Boolean(body.workCompleted);
      update.completedAt = body.workCompleted ? new Date() : null;
    }

    await db.update(projectRevenues).set(update).where(eq(projectRevenues.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update revenue row" }, { status: 500 });
  }
}
