import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { monthlyCosts } from "@/db/schema";
import { and, eq, asc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const year  = parseInt(req.nextUrl.searchParams.get("year")  ?? String(new Date().getFullYear()));
  const month = parseInt(req.nextUrl.searchParams.get("month") ?? String(new Date().getMonth() + 1));
  const rows  = await db.select().from(monthlyCosts)
    .where(and(eq(monthlyCosts.year, year), eq(monthlyCosts.month, month)))
    .orderBy(asc(monthlyCosts.entryDate), asc(monthlyCosts.createdAt));
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const [row] = await db.insert(monthlyCosts).values({
    year:        body.year,
    month:       body.month,
    assignee:    body.assignee    || null,
    entryDate:   body.entryDate   || null,
    vendor:      body.vendor      || null,
    productName: body.productName || null,
    quantity:    body.quantity    ?? null,
    supplyPrice: body.supplyPrice ?? 0,
    tax:         body.tax         ?? 0,
    total:       body.total       ?? 0,
    invoiceDate: body.invoiceDate || null,
  }).returning();
  return NextResponse.json({ row }, { status: 201 });
}
