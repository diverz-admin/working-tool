import { NextResponse } from "next/server";
import { db } from "@/db";
import { kpiTargets } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

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

    for (const e of entries) {
      const existing = await db
        .select({ id: kpiTargets.id })
        .from(kpiTargets)
        .where(and(
          eq(kpiTargets.year,  e.year),
          eq(kpiTargets.month, e.month),
          eq(kpiTargets.team,  e.team),
        ));

      if (existing.length > 0) {
        await db.update(kpiTargets)
          .set({ target: e.target, updatedAt: new Date() })
          .where(and(
            eq(kpiTargets.year,  e.year),
            eq(kpiTargets.month, e.month),
            eq(kpiTargets.team,  e.team),
          ));
      } else {
        await db.insert(kpiTargets).values({
          year: e.year, month: e.month, team: e.team, target: e.target,
        });
      }
    }

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
