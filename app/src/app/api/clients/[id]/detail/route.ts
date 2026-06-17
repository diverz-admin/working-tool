import { NextResponse } from "next/server";
import { db } from "@/db";
import { clients, clientAccounts, clientUrls, projects } from "@/db/schema";
import { eq } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;

    const [clientRows, accounts, urls, linkedProjects] = await Promise.all([
      db.select().from(clients).where(eq(clients.id, id)).limit(1),
      db.select().from(clientAccounts).where(eq(clientAccounts.clientId, id)).orderBy(clientAccounts.createdAt),
      db.select().from(clientUrls).where(eq(clientUrls.clientId, id)).orderBy(clientUrls.createdAt),
      db.select().from(projects).where(eq(projects.clientId, id)),
    ]);

    const c = clientRows[0];
    if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      client: {
        id: c.id,
        status: c.status,
        companyName: c.companyName,
        industry: c.industry ?? "",
        advertiserName: c.contactName ?? "",
        advertiserContact: c.contactPhone ?? "",
        contactEmail: c.contactEmail ?? "",
        businessNumber: c.businessNumber ?? "",
        category: c.category ?? "",
        products: c.products ?? [],
        monthlyAvg: c.monthlyAvg ?? null,
        inboundDate: c.inboundDate ?? "",
        inboundRoute: c.inboundRoute ?? "",
        endDate: c.endDate ?? "",
        endReason: c.endReason ?? "",
        assignedTeam: c.assignedTeam ?? "",
        assignedPerson: c.assignedPerson ?? "",
        notes: c.notes ?? "",
        bizRegFileUrl: c.bizRegFileUrl ?? null,
        bizRegFileName: c.bizRegFileName ?? null,
      },
      accounts,
      urls,
      projects: linkedProjects,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch client detail" }, { status: 500 });
  }
}
