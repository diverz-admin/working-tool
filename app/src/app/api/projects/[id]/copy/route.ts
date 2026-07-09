import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectRevenues, projectCosts, products } from "@/db/schema";
import { eq } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

/** 매출 행의 productName 은 상품관리 기준 `이름 · 벤더` (벤더 없으면 `이름`) 형식으로 저장된다. */
function revenueProductKey(name: string, vendor: string | null) {
  return vendor ? `${name} · ${vendor}` : name;
}

export async function POST(_req: Request, { params }: Params) {
  try {
    const { id } = await params;

    const [original] = await db.select().from(projects).where(eq(projects.id, id));
    if (!original) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [revenues, costs, productList] = await Promise.all([
      db.select().from(projectRevenues).where(eq(projectRevenues.projectId, id)),
      db.select().from(projectCosts).where(eq(projectCosts.projectId, id)),
      db.select().from(products),
    ]);

    // 복사 시점의 상품관리 판매가를 다시 적용하기 위한 조회 맵
    const salePriceByKey = new Map<string, number>();
    const nameCount = new Map<string, number>();
    for (const p of productList) {
      nameCount.set(p.name, (nameCount.get(p.name) ?? 0) + 1);
      if (p.salePrice != null) salePriceByKey.set(revenueProductKey(p.name, p.vendor), p.salePrice);
    }
    // 이름이 유일한 상품은 벤더 접미사 없이도 매칭
    for (const p of productList) {
      if (p.salePrice != null && nameCount.get(p.name) === 1) salePriceByKey.set(p.name, p.salePrice);
    }

    function withCurrentSalePrice(r: typeof revenues[number]) {
      if (!r.productName) return {};
      const salePrice = salePriceByKey.get(r.productName);
      if (salePrice == null || salePrice <= 0) return {};
      const qty    = r.quantity && r.quantity > 0 ? r.quantity : 1;
      const supply = salePrice * qty;
      const tax    = r.depositAccount === "전재민" ? 0 : Math.round(supply * 0.1);
      return { supplyPrice: supply, tax, total: supply + tax };
    }

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
            revenues.map((row) => {
              const { id: _id, createdAt: _c, workCompleted: _wc, completedAt: _ca, completedQty: _cq, paymentDate: _pd, invoiceDate: _ivd, ...r } = row;
              return {
              ...r,
              ...withCurrentSalePrice(row),
              projectId:     copied.id,
              workCompleted: false,
              completedAt:   null,
              completedQty:  0,
              paymentDate:   null,
              invoiceDate:   null,
              };
            })
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
