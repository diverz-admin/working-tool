import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projectCosts } from "@/db/schema";
import { eq } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();

    const updates: Record<string, unknown> = {};
    if (body.workCompleted !== undefined) updates.workCompleted = Boolean(body.workCompleted);
    if (body.settingDate !== undefined) updates.settingDate = body.settingDate || null;

    const [row] = await db.update(projectCosts).set(updates).where(eq(projectCosts.id, id)).returning();
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ row });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update cost row" }, { status: 500 });
  }
}
