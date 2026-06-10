import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { salesTargets, projects, projectRevenues } from "@/db/schema";
import { eq, and, gte, lte, isNotNull } from "drizzle-orm";

type Criteria = "공급가" | "캠페인 시작날짜" | "계산서날짜";

function quarterOf(month: number) { return Math.ceil(month / 3); }

function dateRange(year: number, type: "annual" | "quarterly" | "monthly", month: number): [string, string] {
  if (type === "annual") return [`${year}-01-01`, `${year}-12-31`];
  if (type === "quarterly") {
    const q = quarterOf(month);
    const sm = (q - 1) * 3 + 1;
    const em = q * 3;
    const lastDay = new Date(year, em, 0).getDate();
    return [
      `${year}-${String(sm).padStart(2, "0")}-01`,
      `${year}-${String(em).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    ];
  }
  const lastDay = new Date(year, month, 0).getDate();
  return [
    `${year}-${String(month).padStart(2, "0")}-01`,
    `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  ];
}

async function getAchieved(team: string, start: string, end: string, criteria: Criteria): Promise<number> {
  // criteria === "계산서날짜" → filter by invoiceDate
  // 나머지 → filter by paymentDate
  // criteria === "공급가" → sum supplyPrice, else sum total

  type Row = { supplyPrice: number | null; total: number | null };
  let rows: Row[];

  if (criteria === "계산서날짜") {
    rows = await db
      .select({ supplyPrice: projectRevenues.supplyPrice, total: projectRevenues.total })
      .from(projectRevenues)
      .innerJoin(projects, eq(projectRevenues.projectId, projects.id))
      .where(
        and(
          eq(projects.assignedTeam, team),
          isNotNull(projectRevenues.invoiceDate),
          gte(projectRevenues.invoiceDate, start),
          lte(projectRevenues.invoiceDate, end),
        )
      );
  } else {
    rows = await db
      .select({ supplyPrice: projectRevenues.supplyPrice, total: projectRevenues.total })
      .from(projectRevenues)
      .innerJoin(projects, eq(projectRevenues.projectId, projects.id))
      .where(
        and(
          eq(projects.assignedTeam, team),
          isNotNull(projects.startDate),
          gte(projects.startDate, start),
          lte(projects.startDate, end),
        )
      );
  }

  return rows.reduce(
    (s, r) => s + ((criteria === "공급가" ? r.supplyPrice : r.total) ?? 0),
    0
  );
}

async function getContracted(team: string, start: string, end: string) {
  const rows = await db
    .select({ contractAmount: projects.contractAmount })
    .from(projects)
    .where(
      and(
        eq(projects.assignedTeam, team),
        isNotNull(projects.startDate),
        gte(projects.startDate, start),
        lte(projects.startDate, end),
      )
    );
  const valid = rows.filter((r) => (r.contractAmount ?? 0) > 0);
  return { amount: valid.reduce((s, r) => s + (r.contractAmount ?? 0), 0), count: valid.length };
}

export async function GET(req: NextRequest) {
  try {
    const team  = req.nextUrl.searchParams.get("team") ?? "";
    const year  = parseInt(req.nextUrl.searchParams.get("year")  ?? String(new Date().getFullYear()));
    const month = parseInt(req.nextUrl.searchParams.get("month") ?? String(new Date().getMonth() + 1));
    const quarter = quarterOf(month);

    const [targetRow] = await db
      .select()
      .from(salesTargets)
      .where(and(eq(salesTargets.team, team), eq(salesTargets.year, year)));

    const annualTarget    = targetRow?.annualTarget ?? 0;
    const quarterlyTarget = Math.round(annualTarget / 4);
    const monthlyTarget   = Math.round(annualTarget / 12);
    const criteria        = (targetRow?.criteria ?? "캠페인 시작날짜") as Criteria;

    const [as, qs, ms] = [
      dateRange(year, "annual",    month),
      dateRange(year, "quarterly", month),
      dateRange(year, "monthly",   month),
    ];

    const [annualA, quarterlyA, monthlyA] = await Promise.all([
      getAchieved(team, as[0], as[1], criteria),
      getAchieved(team, qs[0], qs[1], criteria),
      getAchieved(team, ms[0], ms[1], criteria),
    ]);

    const [annualC, quarterlyC, monthlyC] = await Promise.all([
      getContracted(team, as[0], as[1]),
      getContracted(team, qs[0], qs[1]),
      getContracted(team, ms[0], ms[1]),
    ]);

    return NextResponse.json({
      annualTarget, quarterlyTarget, monthlyTarget, quarter, criteria,
      annual:    { achieved: annualA,    contracted: annualC.amount,    contractCount: annualC.count },
      quarterly: { achieved: quarterlyA, contracted: quarterlyC.amount, contractCount: quarterlyC.count },
      monthly:   { achieved: monthlyA,   contracted: monthlyC.amount,   contractCount: monthlyC.count },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { team, year, annualTarget, criteria } = await req.json();
    if (!team || !year) return NextResponse.json({ error: "team, year required" }, { status: 400 });

    const [existing] = await db
      .select({ id: salesTargets.id })
      .from(salesTargets)
      .where(and(eq(salesTargets.team, team), eq(salesTargets.year, year)));

    const vals = {
      annualTarget: annualTarget ?? 0,
      criteria:     criteria ?? "캠페인 시작날짜",
      updatedAt:    new Date(),
    };

    if (existing) {
      await db.update(salesTargets).set(vals)
        .where(and(eq(salesTargets.team, team), eq(salesTargets.year, year)));
    } else {
      await db.insert(salesTargets).values({ team, year, ...vals });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
