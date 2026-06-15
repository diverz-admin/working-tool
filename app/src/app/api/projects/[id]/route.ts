import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectRevenues, projectCosts, projectGroups, confirmRequests, paymentRequests } from "@/db/schema";
import { eq, asc, and, ne } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const [[project], revenues, costs] = await Promise.all([
      db.select().from(projects).where(eq(projects.id, id)),
      db.select().from(projectRevenues).where(eq(projectRevenues.projectId, id)).orderBy(asc(projectRevenues.rowNum)),
      db.select().from(projectCosts).where(eq(projectCosts.projectId, id)).orderBy(asc(projectCosts.rowNum)),
    ]);
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ project, revenues, costs });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch project" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.status         !== undefined) updates.status         = body.status;
    if (body.campaignName   !== undefined) updates.campaignName   = body.campaignName;
    if (body.advertiser     !== undefined) updates.advertiser     = body.advertiser || null;
    if (body.product        !== undefined) updates.product        = body.product || null;
    if (body.assignedTeam   !== undefined) updates.assignedTeam   = body.assignedTeam || null;
    if (body.assignedPerson !== undefined) updates.assignedPerson = body.assignedPerson || null;
    if (body.contractAmount !== undefined) updates.contractAmount = body.contractAmount != null && body.contractAmount !== "" ? parseInt(body.contractAmount) : null;
    if (body.kpiSupply      !== undefined) updates.kpiSupply      = body.kpiSupply != null && body.kpiSupply !== "" ? parseInt(body.kpiSupply) : null;
    if (body.kpiTax         !== undefined) updates.kpiTax         = body.kpiTax    != null && body.kpiTax    !== "" ? parseInt(body.kpiTax)    : null;
    if (body.startDate      !== undefined) updates.startDate      = body.startDate || null;
    if (body.endDate        !== undefined) updates.endDate        = body.endDate || null;
    if (body.clientId       !== undefined) updates.clientId       = body.clientId || null;
    if (body.projectType      !== undefined) updates.projectType      = body.projectType || null;
    if (body.placeLink        !== undefined) updates.placeLink        = body.placeLink || null;
    if (body.notes            !== undefined) updates.notes            = body.notes || null;
    if (body.isExtended       !== undefined) updates.isExtended       = Boolean(body.isExtended);
    if (body.extensionCount   !== undefined) updates.extensionCount   = parseInt(body.extensionCount) || 0;
    if (body.originalEndDate  !== undefined) updates.originalEndDate  = body.originalEndDate || null;
    if (body.extensionNotes   !== undefined) updates.extensionNotes   = body.extensionNotes || null;

    const [row] = await db.update(projects).set(updates).where(eq(projects.id, id)).returning();
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // 캠페인이 종료로 바뀌었고 프로젝트 그룹에 속한 경우 → 그룹 내 미종료 캠페인 확인
    if (body.status === "종료" && row.projectGroupId) {
      const remaining = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(
          eq(projects.projectGroupId, row.projectGroupId),
          ne(projects.status, "종료"),
        ));
      if (remaining.length === 0) {
        await db.update(projectGroups)
          .set({ status: "종료", updatedAt: new Date() })
          .where(eq(projectGroups.id, row.projectGroupId));
      }
    }

    return NextResponse.json({ project: row, projectGroupId: row.projectGroupId });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params;

    const [approvedPayment] = await db
      .select({ id: paymentRequests.id })
      .from(paymentRequests)
      .where(and(eq(paymentRequests.projectId, id), eq(paymentRequests.status, "승인")))
      .limit(1);
    if (approvedPayment) {
      return NextResponse.json({ error: "승인된 매입 입금요청이 있어 삭제할 수 없습니다. 결재 내역을 먼저 처리해주세요." }, { status: 409 });
    }

    const [confirmedRevenue] = await db
      .select({ id: confirmRequests.id })
      .from(confirmRequests)
      .where(and(eq(confirmRequests.projectId, id), eq(confirmRequests.status, "확인완료")))
      .limit(1);
    if (confirmedRevenue) {
      return NextResponse.json({ error: "확인완료된 매출 입금확인요청이 있어 삭제할 수 없습니다. 결재 내역을 먼저 처리해주세요." }, { status: 409 });
    }

    await db.delete(projects).where(eq(projects.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }
}
