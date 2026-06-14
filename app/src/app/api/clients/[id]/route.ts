import { NextResponse } from "next/server";
import { db } from "@/db";
import { clients, projects } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [c] = await db.select().from(clients).where(eq(clients.id, id));
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
        notes:          c.notes ?? "",
        bizRegFileUrl:  c.bizRegFileUrl  ?? null,
        bizRegFileName: c.bizRegFileName ?? null,
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch client" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const [row] = await db
      .update(clients)
      .set({
        status:         body.status,
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
        bizRegFileUrl:  body.bizRegFileUrl  ?? null,
        bizRegFileName: body.bizRegFileName ?? null,
      })
      .where(eq(clients.id, id))
      .returning();

    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ client: row });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update client" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // 연결된 프로젝트 존재 여부 확인
    const linkedProjects = await db.select({ id: projects.id }).from(projects).where(eq(projects.clientId, id));
    if (linkedProjects.length > 0) {
      const userRole = req.headers.get("X-User-Role") ?? "";
      if (userRole !== "Admin") {
        return NextResponse.json(
          { error: "연결된 프로젝트가 있는 광고주는 관리자만 삭제할 수 있습니다." },
          { status: 403 }
        );
      }
    }

    await db.delete(clients).where(eq(clients.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to delete client" }, { status: 500 });
  }
}
