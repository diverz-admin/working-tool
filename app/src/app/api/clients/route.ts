import { NextResponse } from "next/server";
import { db } from "@/db";
import { clients, projects } from "@/db/schema";
import { desc, eq, sql, count } from "drizzle-orm";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.companyName?.trim()) {
      return NextResponse.json({ error: "업체명은 필수입니다." }, { status: 400 });
    }
    const [row] = await db
      .insert(clients)
      .values({
        status:         body.status ?? "리드",
        companyName:    body.companyName,
        industry:       body.industry || null,
        contactName:    body.advertiserName || null,
        contactPhone:   body.advertiserContact || null,
        contactEmail:   body.contactEmail || null,
        businessNumber: body.businessNumber || null,
        category:       body.category || null,
        products:       body.products ?? [],
        monthlyAvg:     body.monthlyAvg ?? null,
        inboundDate:    body.inboundDate || null,
        inboundRoute:   body.inboundRoute || null,
        endDate:        body.endDate || null,
        endReason:      body.endReason || null,
        assignedTeam:   body.assignedTeam || null,
        assignedPerson: body.assignedPerson || null,
        notes:          body.notes || null,
      })
      .returning();
    return NextResponse.json({ client: row }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to create client" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const rows = await db
      .select({
        client: clients,
        projectCount: sql<number>`COUNT(${projects.id})::int`,
      })
      .from(clients)
      .leftJoin(projects, eq(projects.clientId, clients.id))
      .groupBy(clients.id)
      .orderBy(desc(clients.createdAt));

    const result = rows.map(({ client: c, projectCount }) => ({
      id: c.id,
      status: c.status as "리드" | "진행" | "종료",
      inboundDate: c.inboundDate ?? "",
      companyName: c.companyName,
      industry: c.industry ?? "",
      advertiserName: c.contactName ?? "",
      advertiserContact: c.contactPhone ?? "",
      contactEmail: c.contactEmail ?? undefined,
      businessNumber: c.businessNumber ?? undefined,
      category: c.category ?? undefined,
      products: c.products ?? [],
      monthlyAvg: c.monthlyAvg ?? undefined,
      inboundRoute: c.inboundRoute ?? "",
      endReason: c.endReason ?? undefined,
      endDate: c.endDate ?? undefined,
      assignedTeam: c.assignedTeam ?? undefined,
      assignedPerson: c.assignedPerson ?? undefined,
      notes: c.notes ?? undefined,
      projectCount: projectCount ?? 0,
    }));

    return NextResponse.json({ clients: result });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch clients" }, { status: 500 });
  }
}
