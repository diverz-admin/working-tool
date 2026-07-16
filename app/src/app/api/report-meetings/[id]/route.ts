import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { reportMeetings } from "@/db/schema";
import { eq } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await db.delete(reportMeetings).where(eq(reportMeetings.id, id));
  return NextResponse.json({ ok: true });
}
