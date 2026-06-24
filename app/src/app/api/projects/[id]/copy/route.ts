import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectRevenues, projectCosts } from "@/db/schema";
import { eq } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  try {
    const { id } = await params;

    const [original] = await db.select().from(projects).where(eq(projects.id, id));
    if (!original) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [revenues, costs] = await Promise.all([
      db.select().from(projectRevenues).where(eq(projectRevenues.projectId, id)),
      db.select().from(projectCosts).where(eq(projectCosts.projectId, id)),
    ]);

    const [copied] = await db.insert(projects).values({
      projectGroupId: original.projectGroupId,
      status:         "진행",
      campaignName:   original.campaignName,
      clientId:       original.clientId,
      advertiser:     original.advertiser,
      product:        original.product,
      assignedTeam:   original.assignedTeam,
      assignedPerson: original.assignedPerson,
      contractAmount: null,
      startDate:      null,
      endDate:        null,
      projectType:    original.projectType,
      placeLink:      original.placeLink,
      notes:          original.notes,
      isExtended:     false,
      extensionCount: 0,
    }).returning();

    await Promise.all([
      revenues.length > 0
        ? db.insert(projectRevenues).values(
            revenues.map(({ id: _id, createdAt: _c, workCompleted: _wc, completedAt: _ca, completedQty: _cq, paymentDate: _pd, invoiceDate: _ivd, ...r }) => ({
              ...r,
              projectId:     copied.id,
              workCompleted: false,
              completedAt:   null,
              completedQty:  0,
              paymentDate:   null,
              invoiceDate:   null,
            }))
          )
        : Promise.resolve(),
      costs.length > 0
        ? db.insert(projectCosts).values(
            costs.map(({ id: _id, createdAt: _c, workCompleted: _wc, isApproved: _ia, invoiceFileUrl: _fu, invoiceFileName: _fn, costRowId: _cr, invoiceDate: _ivd, purchaseDate: _pd, ...r }) => ({
              ...r,
              projectId:       copied.id,
              costRowId:       null,
              workCompleted:   false,
              isApproved:      false,
              invoiceFileUrl:  null,
              invoiceFileName: null,
              invoiceDate:     null,
              purchaseDate:    null,
            }))
          )
        : Promise.resolve(),
    ]);

    return NextResponse.json({ project: copied });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to copy project" }, { status: 500 });
  }
}
