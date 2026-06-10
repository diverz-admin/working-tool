import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { products } from "@/db/schema";
import { asc } from "drizzle-orm";

export async function GET() {
  try {
    const rows = await db
      .select()
      .from(products)
      .orderBy(asc(products.category), asc(products.rowNum), asc(products.createdAt));
    return NextResponse.json({ products: rows });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const [row] = await db
      .insert(products)
      .values({
        category:  body.category,
        rowNum:    body.rowNum  ?? null,
        name:              body.name,
        vendor:            body.vendor             || null,
        vendorBankAccount: body.vendorBankAccount  || null,
        costPrice:         body.costPrice != null ? Number(body.costPrice) : null,
        salePrice:         body.salePrice != null ? Number(body.salePrice) : null,
        notes:             body.notes              || null,
      })
      .returning();
    return NextResponse.json({ product: row }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
