import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { chatMessages } from "@/db/schema";
import { eq } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const { content } = await req.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: "내용을 입력해주세요." }, { status: 400 });
  }

  const [row] = await db
    .update(chatMessages)
    .set({ content: content.trim() })
    .where(eq(chatMessages.id, id))
    .returning();

  if (!row) return NextResponse.json({ error: "메시지를 찾을 수 없습니다." }, { status: 404 });

  return NextResponse.json({ message: row });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  await db.delete(chatMessages).where(eq(chatMessages.id, id));

  return NextResponse.json({ ok: true });
}
