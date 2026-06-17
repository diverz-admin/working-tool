import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { productSections, products } from "@/db/schema";
import { eq } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const { name } = body;
  if (!name?.trim()) return NextResponse.json({ error: "이름이 필요합니다" }, { status: 400 });

  const [sec] = await db.select().from(productSections).where(eq(productSections.id, id));
  if (!sec) return NextResponse.json({ error: "섹션을 찾을 수 없습니다" }, { status: 404 });

  const newName = name.trim();
  await db.update(productSections).set({ name: newName }).where(eq(productSections.id, id));
  await db.update(products).set({ category: newName }).where(eq(products.category, sec.name));

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await db.delete(productSections).where(eq(productSections.id, id));
  return NextResponse.json({ ok: true });
}
