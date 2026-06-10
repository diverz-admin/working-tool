import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  try {
    const { id } = await params;

    const [original] = await db.select().from(projects).where(eq(projects.id, id));
    if (!original) return NextResponse.json({ error: "Not found" }, { status: 404 });

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

    return NextResponse.json({ project: copied });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to copy project" }, { status: 500 });
  }
}
