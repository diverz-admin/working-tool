import { NextResponse } from "next/server";
import { db } from "@/db";
import { clients, projects } from "@/db/schema";
import { desc, eq, count } from "drizzle-orm";

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
        storeName:      body.storeName || null,
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
    // 목록용 경량 쿼리: bizRegFileUrl·notes 제외, 프로젝트 카운트는 별도 쿼리로 병렬 처리
    const [clientRows, countRows] = await Promise.all([
      db.select({
        id:             clients.id,
        status:         clients.status,
        inboundDate:    clients.inboundDate,
        companyName:    clients.companyName,
        storeName:      clients.storeName,
        industry:       clients.industry,
        contactName:    clients.contactName,
        contactPhone:   clients.contactPhone,
        contactEmail:   clients.contactEmail,
        businessNumber: clients.businessNumber,
        category:       clients.category,
        products:       clients.products,
        monthlyAvg:     clients.monthlyAvg,
        inboundRoute:   clients.inboundRoute,
        endReason:      clients.endReason,
        endDate:        clients.endDate,
        assignedTeam:   clients.assignedTeam,
        assignedPerson: clients.assignedPerson,
        createdAt:      clients.createdAt,
      })
        .from(clients)
        .orderBy(desc(clients.createdAt)),
      db.select({
        clientId: projects.clientId,
        cnt: count(projects.id),
      })
        .from(projects)
        .groupBy(projects.clientId),
    ]);

    const countMap = new Map(countRows.map(r => [r.clientId, r.cnt]));

    const result = clientRows.map(c => ({
      id:               c.id,
      status:           c.status as "리드" | "진행" | "종료",
      inboundDate:      c.inboundDate ?? "",
      companyName:      c.companyName,
      storeName:        c.storeName ?? "",
      industry:         c.industry ?? "",
      advertiserName:   c.contactName ?? "",
      advertiserContact: c.contactPhone ?? "",
      contactEmail:     c.contactEmail ?? undefined,
      businessNumber:   c.businessNumber ?? undefined,
      category:         c.category ?? undefined,
      products:         c.products ?? [],
      monthlyAvg:       c.monthlyAvg ?? undefined,
      inboundRoute:     c.inboundRoute ?? "",
      endReason:        c.endReason ?? undefined,
      endDate:          c.endDate ?? undefined,
      assignedTeam:     c.assignedTeam ?? undefined,
      assignedPerson:   c.assignedPerson ?? undefined,
      projectCount:     countMap.get(c.id) ?? 0,
    }));

    return NextResponse.json({ clients: result });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch clients" }, { status: 500 });
  }
}
