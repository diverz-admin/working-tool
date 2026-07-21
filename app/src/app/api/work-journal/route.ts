import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workJournals, clients, projects } from "@/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { monthRange } from "@/lib/month-range";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year  = parseInt(searchParams.get("year")  ?? String(new Date().getFullYear()));
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1));
  const team  = searchParams.get("team");

  const { from, to } = monthRange(year, month);

  const conditions = [gte(workJournals.date, from), lte(workJournals.date, to)];
  if (team) conditions.push(eq(workJournals.assignedTeam, team));

  const rows = await db
    .select({
      id:           workJournals.id,
      date:         workJournals.date,
      title:        workJournals.title,
      content:      workJournals.content,
      authorName:   workJournals.authorName,
      assignedTeam: workJournals.assignedTeam,
      clientId:     workJournals.clientId,
      projectId:    workJournals.projectId,
      createdAt:    workJournals.createdAt,
      clientName:   clients.companyName,
      projectName:  projects.campaignName,
    })
    .from(workJournals)
    .leftJoin(clients,  eq(workJournals.clientId,  clients.id))
    .leftJoin(projects, eq(workJournals.projectId, projects.id))
    .where(and(...conditions))
    .orderBy(desc(workJournals.date), desc(workJournals.createdAt));

  return NextResponse.json({ journals: rows });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { date, title, content, authorName, assignedTeam, clientId, projectId } = body;

  if (!date || !title?.trim() || !authorName?.trim()) {
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });
  }

  const [row] = await db
    .insert(workJournals)
    .values({
      date,
      title:        title.trim(),
      content:      content ?? "",
      authorName:   authorName.trim(),
      assignedTeam: assignedTeam || null,
      clientId:     clientId   || null,
      projectId:    projectId  || null,
    })
    .returning();

  return NextResponse.json({ journal: row }, { status: 201 });
}
