import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectCosts } from "@/db/schema";
import { eq, and, gte, lte, isNotNull } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const year     = parseInt(req.nextUrl.searchParams.get("year")  ?? String(new Date().getFullYear()));
    const month    = parseInt(req.nextUrl.searchParams.get("month") ?? String(new Date().getMonth() + 1));
    const criteria = req.nextUrl.searchParams.get("criteria") ?? "캠페인 시작날짜";

    const useInvoice = criteria === "계산서날짜";
    const dateField  = useInvoice ? projectCosts.invoiceDate : projects.startDate;

    const from = `${year}-${String(month).padStart(2, "0")}-01`;
    const to   = new Date(year, month, 0).toISOString().slice(0, 10);

    const rows = await db
      .select({
        id:           projectCosts.id,
        rowNum:       projectCosts.rowNum,
        assignee:     projectCosts.assignee,
        assignedTeam: projects.assignedTeam,
        campaignName: projects.campaignName,
        vendor:       projectCosts.vendor,
        productName:  projectCosts.productName,
        quantity:     projectCosts.quantity,
        supplyPrice:  projectCosts.supplyPrice,
        tax:          projectCosts.tax,
        total:        projectCosts.total,
        startDate:    projects.startDate,
        invoiceDate:  projectCosts.invoiceDate,
      })
      .from(projectCosts)
      .innerJoin(projects, eq(projectCosts.projectId, projects.id))
      .where(
        and(
          eq(projectCosts.isApproved, true),
          isNotNull(dateField),
          gte(dateField, from),
          lte(dateField, to),
        )
      )
      .orderBy(dateField, projectCosts.rowNum);

    return NextResponse.json({ rows });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
