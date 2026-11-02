import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, clients, campaignRenewals } from "@/db/schema";
import { and, eq, ne, or, gte, lte, inArray, isNotNull, isNull } from "drizzle-orm";
import { monthRange } from "@/lib/month-range";

/**
 * 회의록 ④ 프로젝트 일정 — 끝나는 캠페인이 곧 연장 영업 대상이다.
 *
 *   active   — 기준일(asOf) 현재 운영중. member-kpi와 같은 규칙
 *              (리드 제외 · 시작일 ≤ asOf · 종료일 없음 또는 ≥ asOf). 다음 해 종료도 포함한다.
 *   thisWeek — 종료일이 이번 주(weekStart ~ +6)인 캠페인
 *   nextWeek — 종료일이 다음 주(+7 ~ +13)인 캠페인
 *   lastWeek — 종료일이 지난주(-7 ~ -1)인 캠페인 + 자동 연장 판정
 *
 * 연장 판정: 같은 광고주(client_id)에 다른 프로젝트가 있고, 그 프로젝트가 끝난 건의 시작일
 * 이후에 시작해 끝난 건의 종료일보다 오래 이어지면(종료일 없음 포함) 연장된 것으로 본다.
 * 리드 상태 프로젝트는 아직 계약이 아니므로 세지 않는다.
 *
 * 이번 주·다음 주 건의 연장 협의 상태는 campaign_renewals에 사람이 고른다.
 * 그 표가 아직 DB에 없을 수 있어 조회가 실패하면 상태를 모두 null로 두고 화면은 그대로 보인다.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** 날짜 컬럼은 시간대가 없으므로 UTC로 계산해 하루 밀림을 막는다 */
function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const year  = parseInt(searchParams.get("year")  ?? "0");
    const month = parseInt(searchParams.get("month") ?? "0");
    const asOf      = searchParams.get("asOf") ?? "";
    const weekStart = searchParams.get("weekStart") ?? "";
    if (!year || !month || !ISO.test(asOf) || !ISO.test(weekStart)) {
      return NextResponse.json({ error: "year·month·asOf·weekStart 필요" }, { status: 400 });
    }
    const { to: monthEnd } = monthRange(year, month);

    const thisWeek = { from: weekStart,              to: addDays(weekStart, 6) };
    const nextWeek = { from: addDays(weekStart, 7),  to: addDays(weekStart, 13) };
    const lastWeek = { from: addDays(weekStart, -7), to: addDays(weekStart, -1) };

    const cols = {
      id: projects.id,
      name: projects.campaignName,
      clientId: projects.clientId,
      client: clients.companyName,
      person: projects.assignedPerson,
      start: projects.startDate,
      end: projects.endDate,
      type: projects.projectType,
      supply: projects.kpiSupply,
      contract: projects.contractAmount,
    };
    type Row = { id: string; name: string; clientId: string | null; client: string | null; person: string | null;
      start: string | null; end: string | null; type: string | null; supply: number | null; contract: number | null };

    const ending = (r: { from: string; to: string }) =>
      db.select(cols).from(projects).leftJoin(clients, eq(clients.id, projects.clientId))
        .where(and(ne(projects.status, "리드"), isNotNull(projects.endDate), gte(projects.endDate, r.from), lte(projects.endDate, r.to)))
        .orderBy(projects.endDate, projects.campaignName);

    const [activeRows, thisRows, nextRows, lastRows] = await Promise.all([
      db.select(cols).from(projects).leftJoin(clients, eq(clients.id, projects.clientId))
        .where(and(
          ne(projects.status, "리드"),
          isNotNull(projects.startDate),
          lte(projects.startDate, asOf),
          or(isNull(projects.endDate), gte(projects.endDate, asOf)),
        ))
        .orderBy(projects.endDate, projects.campaignName),
      ending(thisWeek),
      ending(nextWeek),
      ending(lastWeek),
    ]) as [Row[], Row[], Row[], Row[]];

    // ── 지난주 종료 건의 연장 판정 — 같은 광고주의 다른 프로젝트 ──
    const lastClientIds = [...new Set(lastRows.map(r => r.clientId).filter((v): v is string => !!v))];
    const siblings = lastClientIds.length
      ? await db.select({ id: projects.id, name: projects.campaignName, clientId: projects.clientId, start: projects.startDate, end: projects.endDate })
          .from(projects)
          .where(and(inArray(projects.clientId, lastClientIds), ne(projects.status, "리드"), isNotNull(projects.startDate)))
      : [];

    const renewalOf = (p: Row) => {
      if (!p.clientId || !p.start || !p.end) return null;
      const hit = siblings
        .filter(s => s.clientId === p.clientId && s.id !== p.id && s.start! >= p.start! && (s.end === null || s.end > p.end!))
        .sort((a, b) => a.start!.localeCompare(b.start!))[0];
      return hit ? { id: hit.id, name: hit.name, start: hit.start!, end: hit.end } : null;
    };

    // ── 연장 협의 상태 — 표가 없으면 비워 둔다 ──
    const decideIds = [...new Set([...thisRows, ...nextRows].map(r => r.id))];
    const statusOf = new Map<string, string>();
    let renewalsAvailable = true;
    if (decideIds.length) {
      try {
        const rows = await db.select({ projectId: campaignRenewals.projectId, status: campaignRenewals.status })
          .from(campaignRenewals).where(inArray(campaignRenewals.projectId, decideIds));
        for (const r of rows) statusOf.set(r.projectId, r.status);
      } catch (err) {
        renewalsAvailable = false;
        console.error("campaign_renewals 조회 실패 — 상태 없이 응답", err);
      }
    }

    const shape = (r: Row) => ({
      id: r.id, name: r.name, client: r.client, person: r.person,
      start: r.start, end: r.end, type: r.type,
      amount: r.supply ?? r.contract ?? 0,
    });

    return NextResponse.json({
      asOf, weekStart, monthEnd, renewalsAvailable,
      ranges: { thisWeek, nextWeek, lastWeek },
      active:   activeRows.map(shape),
      thisWeek: thisRows.map(r => ({ ...shape(r), status: statusOf.get(r.id) ?? null })),
      nextWeek: nextRows.map(r => ({ ...shape(r), status: statusOf.get(r.id) ?? null })),
      lastWeek: lastRows.map(r => ({ ...shape(r), renewal: renewalOf(r) })),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "프로젝트 일정 집계 실패" }, { status: 500 });
  }
}
