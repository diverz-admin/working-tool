import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { chatChannels } from "@/db/schema";
import { asc } from "drizzle-orm";

export async function GET() {
  const channels = await db
    .select()
    .from(chatChannels)
    .orderBy(asc(chatChannels.createdAt));
  return NextResponse.json({ channels });
}

export async function POST(req: NextRequest) {
  const { name, description } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "채널 이름 필요" }, { status: 400 });

  const [channel] = await db
    .insert(chatChannels)
    .values({ name: name.trim(), description: description?.trim() || null })
    .returning();

  return NextResponse.json({ channel }, { status: 201 });
}
