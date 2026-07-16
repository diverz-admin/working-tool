import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { clientReports } from "@/db/schema";
import { eq } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await db.delete(clientReports).where(eq(clientReports.id, id));
  return NextResponse.json({ ok: true });
}
