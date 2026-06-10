import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { products } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const [row] = await db
      .update(products)
      .set({
        name:              body.name,
        vendor:            body.vendor             || null,
        vendorBankAccount: body.vendorBankAccount  || null,
        costPrice:         body.costPrice != null ? Number(body.costPrice) : null,
        salePrice:         body.salePrice != null ? Number(body.salePrice) : null,
        notes:             body.notes              || null,
        updatedAt:         new Date(),
      })
      .where(eq(products.id, id))
      .returning();
    return NextResponse.json({ product: row });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await db.delete(products).where(eq(products.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
