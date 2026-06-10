import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { chatChannels } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.delete(chatChannels).where(eq(chatChannels.id, id));
  return NextResponse.json({ ok: true });
}
