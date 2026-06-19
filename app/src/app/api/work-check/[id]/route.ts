import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projectCosts } from "@/db/schema";
import { eq } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

// Staff 포함 전체 권한 — workCompleted 토글 전용
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { workCompleted } = await req.json();
    if (workCompleted === undefined) return NextResponse.json({ error: "workCompleted required" }, { status: 400 });

    const [row] = await db
      .update(projectCosts)
      .set({ workCompleted: Boolean(workCompleted) })
      .where(eq(projectCosts.id, id))
      .returning();

    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ row });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
