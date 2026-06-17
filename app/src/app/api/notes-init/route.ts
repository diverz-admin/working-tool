import { NextResponse } from "next/server";
import { db } from "@/db";
import { clients, projects } from "@/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  try {
    const [clientRows, projectRows] = await Promise.all([
      db.select({ id: clients.id, companyName: clients.companyName, status: clients.status })
        .from(clients).orderBy(desc(clients.createdAt)),
      db.select({ id: projects.id, campaignName: projects.campaignName })
        .from(projects).orderBy(desc(projects.createdAt)),
    ]);
    return NextResponse.json({ clients: clientRows, projects: projectRows });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
