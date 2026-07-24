import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectRevenues, projectCosts, projectGroups, confirmRequests, paymentRequests } from "@/db/schema";
import { eq, asc, and, ne } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

/** date 컬럼(YYYY-MM-DD)과 문자열 비교하기 위한 한국 기준 오늘 날짜 */
function todayKST() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const [[project], revenues, costs, confirms, payments] = await Promise.all([
      db.select().from(projects).where(eq(projects.id, id)),
      db.select().from(projectRevenues).where(eq(projectRevenues.projectId, id)).orderBy(asc(projectRevenues.rowNum)),
      db.select().from(projectCosts).where(eq(projectCosts.projectId, id)).orderBy(asc(projectCosts.rowNum)),
      db.select().from(confirmRequests).where(eq(confirmRequests.projectId, id)),
      db.select().from(paymentRequests).where(eq(paymentRequests.projectId, id)),
    ]);
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ project, revenues, costs, confirmRequests: confirms, paymentRequests: payments });
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

    let [row] = await db.update(projects).set(updates).where(eq(projects.id, id)).returning();
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // 캠페인 상태는 종료일이 결정한다. 지금까지는 크론(auto-end-projects)이 "종료"로 바꾸기만 하고
    // 되돌리는 경로가 없어서, 종료된 캠페인의 기간을 연장해도 계속 종료로 남았다.
    // 저장할 때마다 종료일 기준으로 다시 계산해 연장 → 진행중, 앞당김 → 종료가 모두 반영되게 한다.
    if (row.endDate) {
      const derived = row.endDate < todayKST() ? "종료" : "진행";
      if (derived !== row.status) {
        [row] = await db.update(projects)
          .set({ status: derived, updatedAt: new Date() })
          .where(eq(projects.id, id))
          .returning();
      }
    }

    if (row.projectGroupId) {
      if (row.status === "종료") {
        // 그룹 내 캠페인이 모두 종료됐을 때만 그룹도 종료
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
      } else {
        // 진행중 캠페인이 하나라도 생기면 종료 처리된 그룹도 다시 열어준다
        await db.update(projectGroups)
          .set({ status: "진행", updatedAt: new Date() })
          .where(and(
            eq(projectGroups.id, row.projectGroupId),
            eq(projectGroups.status, "종료"),
          ));
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
