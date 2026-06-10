import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectRevenues, clients } from "@/db/schema";
import { eq, and, gte, lte, isNotNull } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const year     = parseInt(req.nextUrl.searchParams.get("year")  ?? String(new Date().getFullYear()));
    const month    = parseInt(req.nextUrl.searchParams.get("month") ?? String(new Date().getMonth() + 1));
    const criteria = req.nextUrl.searchParams.get("criteria") ?? "캠페인 시작날짜";

    const useInvoice = criteria === "계산서날짜";
    const dateField  = useInvoice ? projectRevenues.invoiceDate : projects.startDate;

    const from = `${year}-${String(month).padStart(2, "0")}-01`;
    const to   = new Date(year, month, 0).toISOString().slice(0, 10);

    const rows = await db
      .select({
        id:           projectRevenues.id,
        rowNum:       projectRevenues.rowNum,
        assignee:     projectRevenues.assignee,
        assignedTeam: projects.assignedTeam,
        productName:  projectRevenues.productName,
        quantity:     projectRevenues.quantity,
        supplyPrice:  projectRevenues.supplyPrice,
        tax:          projectRevenues.tax,
        total:        projectRevenues.total,
        startDate:    projects.startDate,
        invoiceDate:  projectRevenues.invoiceDate,
        clientName:   clients.companyName,
      })
      .from(projectRevenues)
      .innerJoin(projects, eq(projectRevenues.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(
        and(
          isNotNull(projectRevenues.paymentDate),
          isNotNull(dateField),
          gte(dateField, from),
          lte(dateField, to),
        )
      )
      .orderBy(dateField, projectRevenues.rowNum);

    return NextResponse.json({ rows });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
