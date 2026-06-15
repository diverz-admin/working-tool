import { NextResponse } from "next/server";
import { db } from "@/db";
import { clients, products, users } from "@/db/schema";
import { asc, desc, eq } from "drizzle-orm";

export async function GET() {
  try {
    const [clientRows, productRows, userRows] = await Promise.all([
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
    ]);

    return NextResponse.json({
      clients: clientRows.map(c => ({
        ...c,
        advertiserName: c.contactName ?? "",
      })),
      products: productRows,
      users: userRows,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
