import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectRevenues, projectCosts, kpiTargets } from "@/db/schema";
import { and, eq, gte, lt, lte, inArray, isNotNull, sql } from "drizzle-orm";
import { monthRange } from "@/lib/month-range";

/**
 * 회의록 "매출현황" 축에 붙는 브리핑 수치.
 *
 * 회의에서 실제로 읽는 순서 그대로 돌려준다.
 *   1. 월 KPI            — kpi_targets에 등록된 팀 월 목표
 *   2. N일 매출           — 1일부터 기준일(asOf)까지 잡힌 매출
 *      월말 예상매출      — 당월 시작 프로젝트의 계약 공급가 합계(이미 수주해 확보한 금액)
 *   3. 프로젝트 현황       — 보장형 / 관리형 / 신규 건수
 *
 * "N일 매출"은 화면에서 고른 기준(통장·계산서·캠페인 시작일)을 따르고,
 * "월말 예상매출"은 기준과 무관하게 항상 수주(계약 공급가) 기준이다.
 * 둘의 근거가 다르므로 화면에도 그렇게 표기해야 한다.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const year  = parseInt(searchParams.get("year")  ?? "0");
    const month = parseInt(searchParams.get("month") ?? "0");
    if (!year || !month) return NextResponse.json({ error: "year·month 필요" }, { status: 400 });

    const teamParam = searchParams.get("team") ?? "전체";
    const team      = teamParam === "전체" ? null : teamParam;
    const criteria  = searchParams.get("criteria") ?? "캠페인 시작날짜";
    const useBank    = criteria === "통장";
    const useInvoice = criteria === "계산서날짜";
    const useContract = !useBank && !useInvoice;   // 수주(계약 공급가) 기준

    const { from, to } = monthRange(year, month);

    // 기준일 — 지정이 없으면 오늘. 조회 월을 벗어나면 월 경계로 맞춘다(지난 달은 말일 기준).
    const rawAsOf = searchParams.get("asOf") || new Date().toLocaleDateString("sv-SE");
    const asOf = rawAsOf < from ? from : rawAsOf > to ? to : rawAsOf;

    // ── 1. 월 KPI ──
    const kpiRows = await db.select({ team: kpiTargets.team, target: kpiTargets.target })
      .from(kpiTargets)
      .where(and(eq(kpiTargets.year, year), eq(kpiTargets.month, month)));
    // 목표 0은 "등록만 되고 값은 안 넣은" 상태다. 0원 목표로 표시하면 달성률이 무의미해지므로 미설정으로 본다.
    const targetOf = (t: string) => {
      const v = kpiRows.find(r => r.team === t)?.target ?? 0;
      return v > 0 ? v : 0;
    };
    // "전체" 행이 따로 저장되는 화면이 있어 팀별 합계와 중복될 수 있다 — 전체 행이 있으면 그 값을 쓴다.
    const kpiRaw = team
      ? targetOf(team)
      : (targetOf("전체") || kpiRows.filter(r => r.team !== "전체").reduce((s, r) => s + Math.max(r.target, 0), 0));
    const kpiTarget = kpiRaw > 0 ? kpiRaw : null;

    // ── 2. 당월 시작 프로젝트 ──
    const monthProjects = await db
      .select({
        id: projects.id, startDate: projects.startDate, kpiSupply: projects.kpiSupply,
        contractAmount: projects.contractAmount, projectType: projects.projectType,
        isExtended: projects.isExtended, status: projects.status,
        clientId: projects.clientId, advertiser: projects.advertiser,
      })
      .from(projects)
      .where(and(
        team ? eq(projects.assignedTeam, team) : undefined,
        isNotNull(projects.startDate),
        gte(projects.startDate, from),
        lte(projects.startDate, to),
      ));

    /**
     * 수주 기준 매출액 = 계약 공급가(kpi_supply).
     * 비어 있으면 실제 매출 행의 공급가 합으로 대체한다 — @/lib/revenue-stats 와 같은 규칙이다.
     * contract_amount 는 VAT 포함 금액이라 대체값으로 쓰면 공급가 집계가 10% 부풀려진다.
     */
    const monthIds = monthProjects.map(p => p.id);
    const revSumRows = monthIds.length
      ? await db
          .select({
            projectId: projectRevenues.projectId,
            supplySum: sql<number>`COALESCE(SUM(${projectRevenues.supplyPrice}), 0)`,
          })
          .from(projectRevenues)
          .where(inArray(projectRevenues.projectId, monthIds))
          .groupBy(projectRevenues.projectId)
      : [];
    const revSumByProject = new Map(revSumRows.map(r => [r.projectId, Number(r.supplySum ?? 0)]));
    const supplyOf = (p: { id: string; kpiSupply: number | null }) =>
      p.kpiSupply ?? revSumByProject.get(p.id) ?? 0;

    // 월말 예상매출 = 당월 시작 프로젝트 계약 공급가 합계
    const forecast = monthProjects.reduce((s, p) => s + supplyOf(p), 0);

    // 팀에 속한 전체 프로젝트 — 매출·매입 행은 지난달 시작 프로젝트에도 달릴 수 있어 당월 시작분만으로는 부족하다
    const teamProjects = await db.select({ id: projects.id }).from(projects)
      .where(team ? eq(projects.assignedTeam, team) : undefined);
    const ids = teamProjects.map(p => p.id);

    // ── 3. 기준일까지 매출 ──
    let asOfRevenue = 0;
    let monthRevenue = 0;   // 당월 전체 기간에 이미 잡힌 매출 (기준일 이후 포함)

    if (useContract) {
      // 수주 기준: 캠페인 시작일이 곧 매출 귀속일
      for (const p of monthProjects) {
        const amount = supplyOf(p);
        monthRevenue += amount;
        if (p.startDate && p.startDate <= asOf) asOfRevenue += amount;
      }
    } else if (ids.length > 0) {
      // 실적 기준: 매출 행의 입금일(통장) 또는 계산서 발행일
      const dateCol = useBank ? projectRevenues.paymentDate : projectRevenues.invoiceDate;
      const revRows = await db
        .select({ supplyPrice: projectRevenues.supplyPrice, refDate: dateCol })
        .from(projectRevenues)
        .where(and(
          inArray(projectRevenues.projectId, ids),
          isNotNull(dateCol), gte(dateCol, from), lte(dateCol, to),
        ));
      for (const r of revRows) {
        const amount = r.supplyPrice ?? 0;
        monthRevenue += amount;
        if (r.refDate && r.refDate <= asOf) asOfRevenue += amount;
      }
    }

    /**
     * ── 3-2. 기준일까지 승인매입 ──
     * 귀속일은 월간 리포트와 같은 규칙을 쓴다 — 통장: 승인일 / 계산서: 발행일 / 그 외: 작업시작일.
     * 승인되지 않은 매입은 확정 지출이 아니므로 뺀다.
     */
    let asOfCost = 0;
    let monthCost = 0;
    if (ids.length > 0) {
      const costDateCol = useBank ? projectCosts.purchaseDate
        : useInvoice ? projectCosts.invoiceDate
        : projectCosts.workStartDate;
      const costRows = await db
        .select({ supplyPrice: projectCosts.supplyPrice, refDate: costDateCol })
        .from(projectCosts)
        .where(and(
          inArray(projectCosts.projectId, ids),
          eq(projectCosts.isApproved, true),
          isNotNull(costDateCol), gte(costDateCol, from), lte(costDateCol, to),
        ));
      for (const c of costRows) {
        const amount = c.supplyPrice ?? 0;
        monthCost += amount;
        if (c.refDate && c.refDate <= asOf) asOfCost += amount;
      }
    }

    // ── 4. 프로젝트 현황 ──
    const countType = (t: string) => monthProjects.filter(p => p.projectType === t).length;
    const guaranteed = countType("보장형");
    const managed    = countType("관리형");
    const extended   = monthProjects.filter(p => p.isExtended === true).length;

    /**
     * 신규 = 이번 달 이전에 거래 이력이 없는 광고주의 건.
     * 팀이 아니라 회사 전체 기준으로 본다 — 다른 팀이 이미 거래한 광고주는 회사 입장에서 신규가 아니다.
     */
    const advertiserKey = sql<string>`COALESCE(${projects.clientId}::text, ${projects.advertiser})`;
    const priorRows = await db.selectDistinct({ key: advertiserKey })
      .from(projects)
      .where(and(isNotNull(projects.startDate), lt(projects.startDate, from)));
    const priorKeys = new Set(priorRows.map(r => r.key).filter(Boolean));
    const fresh = monthProjects.filter(p => {
      const key = p.clientId ?? p.advertiser;
      return !!key && !priorKeys.has(key);
    }).length;

    return NextResponse.json({
      year, month, team: teamParam, criteria,
      asOf,
      asOfDay: parseInt(asOf.slice(8, 10)),
      kpiTarget,
      asOfRevenue,
      monthRevenue,
      asOfCost,
      monthCost,
      forecast,
      projects: {
        total:      monthProjects.length,
        guaranteed,
        managed,
        etc:        monthProjects.length - guaranteed - managed,
        fresh,      // 첫 거래 광고주 건수
        extended,   // 연장 계약 건수
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "매출 브리핑 집계 실패" }, { status: 500 });
  }
}
