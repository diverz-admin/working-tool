import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { notices } from "@/db/schema";
import { desc, eq, and } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const pinnedOnly = searchParams.get("pinned") === "true";

  const rows = pinnedOnly
    ? await db.select().from(notices)
        .where(and(eq(notices.isPinned, true), eq(notices.isActive, true)))
        .orderBy(desc(notices.priority), desc(notices.createdAt))
    : await db.select().from(notices)
        .orderBy(desc(notices.priority), desc(notices.createdAt));

  return NextResponse.json({ notices: rows });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const [row] = await db.insert(notices).values({
    title:      body.title,
    content:    body.content ?? "",
    isPinned:   body.isPinned ?? false,
    isActive:   body.isActive ?? true,
    priority:   body.priority ?? 0,
    authorName: body.authorName ?? "관리자",
  }).returning();
  return NextResponse.json({ notice: row });
}
