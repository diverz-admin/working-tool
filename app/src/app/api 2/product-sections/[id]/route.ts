import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { productSections } from "@/db/schema";
import { eq } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await db.delete(productSections).where(eq(productSections.id, id));
  return NextResponse.json({ ok: true });
}
