import { NextResponse } from "next/server";
import { db } from "@/db";
import { kpiTargets } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));

    const rows = await db
      .select()
      .from(kpiTargets)
      .where(eq(kpiTargets.year, year));

    return NextResponse.json({ targets: rows });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch KPI targets" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    // body: { year, month, team, target }[]
    const entries: { year: number; month: number; team: string; target: number }[] = body.entries;

    // 단일 배치 upsert (N×2 쿼리 → 1 쿼리)
    await db.insert(kpiTargets)
      .values(entries.map(e => ({ year: e.year, month: e.month, team: e.team, target: e.target })))
      .onConflictDoUpdate({
        target: [kpiTargets.year, kpiTargets.month, kpiTargets.team],
        set: { target: sql`excluded.target`, updatedAt: new Date() },
      });

    const updated = await db
      .select()
      .from(kpiTargets)
      .where(eq(kpiTargets.year, entries[0]?.year ?? new Date().getFullYear()));

    return NextResponse.json({ targets: updated });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to save KPI targets" }, { status: 500 });
  }
}
