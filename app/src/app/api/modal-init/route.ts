import { NextResponse } from "next/server";
import { db } from "@/db";
import { clients, products, users, clientUrls } from "@/db/schema";
import { asc, desc, eq } from "drizzle-orm";

export async function GET() {
  try {
    const [clientRows, productRows, userRows, urlRows] = await Promise.all([
      db.select({
        id:             clients.id,
        status:         clients.status,
        companyName:    clients.companyName,
        contactName:    clients.contactName,
        products:       clients.products,
        monthlyAvg:     clients.monthlyAvg,
        inboundDate:    clients.inboundDate,
        endDate:        clients.endDate,
        assignedTeam:   clients.assignedTeam,
        assignedPerson: clients.assignedPerson,
      }).from(clients).orderBy(desc(clients.createdAt)),

      db.select().from(products)
        .orderBy(asc(products.category), asc(products.rowNum), asc(products.createdAt)),

      db.select({
        id:     users.id,
        name:   users.name,
        team:   users.team,
        status: users.status,
      }).from(users).where(eq(users.status, "활성")),

      db.select({
        clientId: clientUrls.clientId,
        label:    clientUrls.label,
        url:      clientUrls.url,
      }).from(clientUrls),
    ]);

    const urlsByClient = new Map<string, { label: string; url: string }[]>();
    for (const u of urlRows) {
      if (!urlsByClient.has(u.clientId)) urlsByClient.set(u.clientId, []);
      urlsByClient.get(u.clientId)!.push({ label: u.label, url: u.url });
    }

    return NextResponse.json({
      clients: clientRows.map(c => ({
        ...c,
        advertiserName: c.contactName ?? "",
        urls: urlsByClient.get(c.id) ?? [],
      })),
      products: productRows,
      users: userRows,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
