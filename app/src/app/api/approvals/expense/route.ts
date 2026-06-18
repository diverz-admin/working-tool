import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { internalExpenseRequests } from "@/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  const items = await db
    .select()
    .from(internalExpenseRequests)
    .orderBy(desc(internalExpenseRequests.createdAt));
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const [item] = await db
    .insert(internalExpenseRequests)
    .values({
      title:        body.title        ?? "",
      assignedTeam: body.assignedTeam || null,
      requester:    body.requester    ?? "",
      requestedAt:  body.requestedAt  ?? new Date().toISOString().slice(0, 10),
      amount:       body.amount       ? Number(body.amount) : null,
      content:      body.content      || null,
      attachments:  body.attachments  || null,
      status:       "대기",
    })
    .returning();

  return NextResponse.json({ item }, { status: 201 });
}
