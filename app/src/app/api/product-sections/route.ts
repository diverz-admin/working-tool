import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { productSections } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const tabType = req.nextUrl.searchParams.get("tabType") ?? null;
  let query = db.select().from(productSections).orderBy(asc(productSections.sortOrder), asc(productSections.createdAt));
  if (tabType) {
    const rows = await db.select().from(productSections)
      .where(eq(productSections.tabType, tabType))
      .orderBy(asc(productSections.sortOrder), asc(productSections.createdAt));
    return NextResponse.json({ sections: rows });
  }
  const rows = await query;
  return NextResponse.json({ sections: rows });
}

export async function POST(req: NextRequest) {
  const { name, accent, tabType } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "섹션명 필요" }, { status: 400 });
  const type = tabType ?? "purchase";
  const all = await db.select({ sortOrder: productSections.sortOrder }).from(productSections)
    .where(eq(productSections.tabType, type))
    .orderBy(asc(productSections.sortOrder));
  const maxOrder = all.length ? Math.max(...all.map(r => r.sortOrder)) + 1 : 0;
  const [row] = await db.insert(productSections).values({
    name:      name.trim(),
    tabType:   type,
    accent:    accent ?? "#3182F6",
    sortOrder: maxOrder,
  }).returning();
  return NextResponse.json({ section: row }, { status: 201 });
}
