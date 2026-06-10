import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { annualCosts, projectCosts } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const year = parseInt(req.nextUrl.searchParams.get("year") ?? String(new Date().getFullYear()));

    // 수동 입력 비용 (직접매입(상품) 제외)
    const manualRows = await db.select().from(annualCosts)
      .where(and(eq(annualCosts.year, year)));
    const filtered = manualRows.filter(r => r.category !== "직접매입(상품)");

    // 직접매입(상품): 승인된 프로젝트 매입에서 자동 계산 (계산서날짜 우선, 없으면 매입날짜)
    const approved = await db
      .select({ invoiceDate: projectCosts.invoiceDate, purchaseDate: projectCosts.purchaseDate, total: projectCosts.total })
      .from(projectCosts)
      .where(eq(projectCosts.isApproved, true));

    const monthly = new Array(12).fill(0);
    for (const r of approved) {
      const dateStr = r.invoiceDate ?? r.purchaseDate;
      if (!dateStr) continue;
      const y = parseInt(dateStr.substring(0, 4));
      if (y !== year) continue;
      monthly[parseInt(dateStr.substring(5, 7)) - 1] += r.total ?? 0;
    }

    const directRows = monthly
      .map((amount, i) => ({ year, month: i + 1, category: "직접매입(상품)", item: "합계", amount }))
      .filter(r => r.amount > 0);

    return NextResponse.json({ costs: [...filtered, ...directRows] });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { year, month, category, item, amount } = await req.json();

    const [existing] = await db
      .select({ id: annualCosts.id })
      .from(annualCosts)
      .where(
        and(
          eq(annualCosts.year, year),
          eq(annualCosts.month, month),
          eq(annualCosts.category, category),
          eq(annualCosts.item, item),
        )
      );

    if (existing) {
      await db
        .update(annualCosts)
        .set({ amount, updatedAt: new Date() })
        .where(
          and(
            eq(annualCosts.year, year),
            eq(annualCosts.month, month),
            eq(annualCosts.category, category),
            eq(annualCosts.item, item),
          )
        );
    } else {
      await db.insert(annualCosts).values({ year, month, category, item, amount });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
