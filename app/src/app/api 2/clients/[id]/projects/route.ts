import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const rows = await db.select().from(projects).where(eq(projects.clientId, id));
    return NextResponse.json({ projects: rows });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}
