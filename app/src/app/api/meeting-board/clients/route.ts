import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, clients, projects, projectCosts, confirmRequests, clientCare } from "@/db/schema";
import { and, eq, ne, or, gte, lte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { splitGuaranteed, type GuaranteedRank } from "@/lib/meeting-brief";

/**
 * 정기 회의록 ③ 영업관리팀 — 영업팀이 가져온 업체가 잘 돌고 있는지 본다.
 *
 * 업체 = 기준일(asOf) 현재 운영중 캠페인이 1건 이상 있는 광고주.
 *   운영중 규칙은 member-kpi·revenue-brief와 같다(리드 제외 · 시작일 ≤ asOf · 종료일 없음 또는 ≥ asOf).
 * 리워드 = 그 캠페인들의 매입 행(project_costs) 중 지난주 월요일 이후에도 작업이 잡혀 있던 것.
 *   이미 끝난 작업도 지난주 것까지는 "작업 마감"으로 보여 준다 — 회의에서 지난주 결과를 함께 본다.
 * 만족도·특이사항 = client_care. 테이블이 아직 없어도 나머지는 그대로 돌려준다(careReady=false).
 */

export type Satisfaction = "만족" | "보통" | "불만";

export interface OpsReward {
  vendor: string | null;      // 매입처. 패키지(업체 없음)는 null
  product: string;
  quantity: number | null;
  end: string | null;         // 작업 종료일
  done: boolean;              // 기준일 전에 작업이 끝남
  isPackage: boolean;
}

export interface OpsClient {
  id: string;
  name: string;
  owner: string | null;       // 가장 먼저 끝나는 캠페인의 영업 담당
  owners: string[];           // 이 업체 캠페인의 담당 전부 (담당 필터용)
  campaigns: string[];        // 운영중 캠페인 이름
  guaranteed: boolean;        // 보장형 캠페인이 하나라도 있음
  endDate: string | null;     // 가장 가까운 종료일 — 캠페인 종료일과 아직 안 끝난 품목 종료일 중 이른 날. 둘 다 없으면 null
  campaignEnd: string | null; // 가장 먼저 끝나는 캠페인의 종료일
  campaignOver: boolean;      // 캠페인 기간은 모두 끝났고 품목 작업만 남음(보장형 연장 작업)
  itemEnd: string | null;     // 아직 안 끝난 품목 중 가장 이른 종료일 (패키지 제외)
  rewards: OpsReward[];
  rank: { rank: number | null; keyword: string | null; checked: boolean } | null; // 보장형만
  satisfaction: Satisfaction | null;
  note: string;
  checkedAt: string | null;
}

export interface OpsBoardData {
  asOf: string;
  weekStart: string;
  members: { name: string; position: string | null }[];
  campaignCount: number;
  clients: OpsClient[];
  careReady: boolean;
  rewardMix: { vendor: string; product: string; clients: number }[];
  guaranteed: { inside: number; outside: number; unchecked: number; total: number };
  pending: {
    confirm: { count: number; amount: number; oldestDate: string | null; oldestName: string | null; requesters: string[] };
    costs: { count: number; supply: number };
  };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const mondayOf = (iso: string) => addDays(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));
const toIso = (v: unknown): string | null => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};
/** "₩1,080,000" 같은 글자 금액 → 숫자 */
const parseAmount = (s: string | null) => Number((s ?? "").replace(/[^0-9]/g, "")) || 0;
/** 업체 없이 적힌 기간 패키지(6개월·1년 패키지) — 리워드가 아니라 계약 형태다 */
const isPackageRow = (vendor: string | null, product: string) =>
  (!vendor || vendor.trim() === "-") && /패키지/.test(product);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const rawAsOf = searchParams.get("asOf") ?? "";
    const asOf = ISO.test(rawAsOf) ? rawAsOf : today();
    const rawWeek = searchParams.get("weekStart") ?? "";
    const weekStart = ISO.test(rawWeek) ? rawWeek : mondayOf(asOf);
    const rewardFrom = addDays(weekStart, -7); // 지난주 월요일

    // ── 1. 운영중 캠페인 + 광고주 ──
    const [memberRows, activeRows] = await Promise.all([
      db.select({ name: users.name, position: users.position }).from(users)
        .where(and(eq(users.status, "활성"), eq(users.team, "영업관리팀"))),
      db.select({
        id: projects.id, clientId: projects.clientId, campaign: projects.campaignName,
        person: projects.assignedPerson, type: projects.projectType, endDate: projects.endDate,
        companyName: clients.companyName,
      })
        .from(projects)
        .innerJoin(clients, eq(clients.id, projects.clientId))
        .where(and(
          ne(projects.status, "리드"),
          isNotNull(projects.startDate),
          lte(projects.startDate, asOf),
          or(
            isNull(projects.endDate), gte(projects.endDate, asOf),
            // 보장형은 캠페인 기간이 끝난 뒤에도 작업이 이어진다 — 기준일 이후에 끝나는 품목이 있으면 함께 본다
            sql`EXISTS (SELECT 1 FROM ${projectCosts} WHERE ${projectCosts.projectId} = ${projects.id} AND ${projectCosts.workEndDate} >= ${asOf})`,
          ),
        )),
    ]);

    const projectIds = activeRows.map(p => p.id);
    const clientIds  = [...new Set(activeRows.map(p => p.clientId).filter((v): v is string => !!v))];

    // ── 2. 리워드(매입 행) · 처리 대기 · 만족도 ──
    const [costRows, unapproved, confirmRows, care] = await Promise.all([
      projectIds.length
        ? db.select({
            projectId: projectCosts.projectId, vendor: projectCosts.vendor, product: projectCosts.productName,
            quantity: projectCosts.quantity, end: projectCosts.workEndDate,
          })
            .from(projectCosts)
            .where(and(
              inArray(projectCosts.projectId, projectIds),
              or(isNull(projectCosts.workEndDate), gte(projectCosts.workEndDate, rewardFrom)),
            ))
        : Promise.resolve([]),
      // 매입 미승인 — 지금 돌고 있는 캠페인의 매입 행만. 오래된 종료 캠페인의 0원 행까지 세면 회의에서 볼 숫자가 아니다
      projectIds.length
        ? db.select({
            n: sql<number>`COUNT(*)`,
            supply: sql<number>`COALESCE(SUM(${projectCosts.supplyPrice}), 0)`,
          })
            .from(projectCosts)
            .where(and(
              inArray(projectCosts.projectId, projectIds),
              or(isNull(projectCosts.isApproved), eq(projectCosts.isApproved, false)),
            ))
        : Promise.resolve([{ n: 0, supply: 0 }]),
      // 입금확인 대기 — 결재 화면의 대기 목록 그대로(기간 제한 없음)
      db.select({
        name: confirmRequests.projectName, requester: confirmRequests.requester,
        amount: confirmRequests.amount, requestedAt: confirmRequests.requestedAt,
      })
        .from(confirmRequests)
        .where(eq(confirmRequests.status, "대기")),
      clientIds.length
        ? db.select().from(clientCare).where(inArray(clientCare.clientId, clientIds))
            .then(rows => ({ ok: true as const, rows }))
            .catch(err => {
              // client_care 마이그레이션 전 — 만족도 없이 나머지는 보여 준다
              console.error("[meeting-board/clients] client_care 조회 실패", err);
              return { ok: false as const, rows: [] };
            })
        : Promise.resolve({ ok: true as const, rows: [] }),
    ]);

    // ── 3. 보장형 현재 순위 — revenue-brief와 같은 방식(광고주로도 잇고, 기준일 3일 안의 마지막 조회) ──
    const gRows = activeRows.filter(p => p.type === "보장형");
    const gProjectIds = gRows.map(p => p.id);
    const gClientIds  = [...new Set(gRows.map(p => p.clientId).filter((v): v is string => !!v))];
    type LatestRank = { project_id: string | null; client_id: string | null; keyword: string; rank: number | null };
    const latestRanks: LatestRank[] = gProjectIds.length
      ? Array.from(await db.execute<LatestRank>(sql`
          SELECT DISTINCT ON (t.id) t.project_id, t.client_id, t.keyword, r.rank
          FROM keyword_trackers t
          JOIN keyword_rankings r ON r.tracker_id = t.id
          WHERE (t.project_id IN ${gProjectIds}
                 ${gClientIds.length ? sql`OR t.client_id IN ${gClientIds}` : sql``})
            AND r.checked_at <  ((${asOf}::date + 1)::timestamp AT TIME ZONE 'Asia/Seoul')
            AND r.checked_at >= ((${asOf}::date - 2)::timestamp AT TIME ZONE 'Asia/Seoul')
          ORDER BY t.id, r.checked_at DESC
        `))
      : [];

    // ── 4. 업체 단위로 묶기 ──
    const careOf = new Map(care.rows.map(r => [r.clientId, r]));
    const clientOfProject = new Map(activeRows.map(p => [p.id, p.clientId!]));
    const rewardsOf = new Map<string, Map<string, OpsReward>>();
    for (const c of costRows) {
      const cid = clientOfProject.get(c.projectId);
      const product = (c.product ?? "").trim();
      if (!cid || !product) continue;
      const pkg = isPackageRow(c.vendor, product);
      const vendor = pkg || !c.vendor?.trim() || c.vendor.trim() === "-" ? null : c.vendor.trim();
      const end = toIso(c.end);
      // 같은 매입처·상품은 한 줄로 합친다(주차별로 쪼개 적은 행) — 수량은 더하고, 종료일은 가장 늦은 날
      const key = `${vendor}|${product}`;
      const m = rewardsOf.get(cid) ?? new Map<string, OpsReward>();
      const prev = m.get(key);
      if (prev) {
        prev.quantity = (prev.quantity ?? 0) + (c.quantity ?? 0) || null;
        if (prev.end && (!end || end > prev.end)) prev.end = end;
        prev.done = !!prev.end && prev.end < asOf;
      } else {
        m.set(key, { vendor, product, quantity: c.quantity ?? null, end, done: !!end && end < asOf, isPackage: pkg });
      }
      rewardsOf.set(cid, m);
    }

    const byClient = new Map<string, typeof activeRows>();
    for (const p of activeRows) {
      const list = byClient.get(p.clientId!) ?? [];
      list.push(p);
      byClient.set(p.clientId!, list);
    }

    const clientList: OpsClient[] = [...byClient.entries()].map(([cid, ps]) => {
      const running = ps.filter(p => !p.endDate || toIso(p.endDate)! >= asOf); // 캠페인 기간이 남은 것
      const sorted = [...(running.length ? running : ps)].sort((a, b) => (toIso(a.endDate) ?? "9999").localeCompare(toIso(b.endDate) ?? "9999"));
      const gs = ps.filter(p => p.type === "보장형");
      let rank: OpsClient["rank"] = null;
      if (gs.length) {
        const ids = new Set(gs.map(p => p.id));
        const mine = latestRanks.filter(r => (r.project_id && ids.has(r.project_id)) || r.client_id === cid);
        const ranked = mine.filter(r => r.rank !== null).sort((a, b) => a.rank! - b.rank!);
        rank = { rank: ranked[0]?.rank ?? null, keyword: (ranked[0] ?? mine[0])?.keyword ?? null, checked: mine.length > 0 };
      }
      const rewards = [...(rewardsOf.get(cid)?.values() ?? [])].sort((a, b) =>
        Number(a.done) - Number(b.done) || Number(b.isPackage) - Number(a.isPackage)
        || (b.end ?? "9999").localeCompare(a.end ?? "9999") || a.product.localeCompare(b.product, "ko"));
      // 캠페인은 남았어도 품목이 먼저 끝나면 그날을 종료일로 본다(패키지는 계약 형태라 제외)
      const campaignEnd = running.length ? toIso(sorted[0].endDate) : null;
      const itemEnd = rewards
        .filter(r => !r.done && !r.isPackage && r.end)
        .map(r => r.end!)
        .sort()[0] ?? null;
      const endDate = campaignEnd && itemEnd ? (itemEnd < campaignEnd ? itemEnd : campaignEnd) : campaignEnd ?? itemEnd;
      const c = careOf.get(cid);
      const sat = c?.satisfaction;
      return {
        id: cid,
        name: ps[0].companyName,
        owner: sorted[0].person ?? null,
        owners: [...new Set(ps.map(p => p.person).filter((v): v is string => !!v))],
        campaigns: [...new Set(sorted.map(p => p.campaign))],
        guaranteed: gs.length > 0,
        endDate,
        campaignEnd,
        campaignOver: !running.length,
        itemEnd,
        rewards,
        rank,
        satisfaction: sat === "만족" || sat === "보통" || sat === "불만" ? sat : null,
        note: c?.note ?? "",
        checkedAt: toIso(c?.checkedAt),
      };
    });
    clientList.sort((a, b) => (a.endDate ?? "9999").localeCompare(b.endDate ?? "9999") || a.name.localeCompare(b.name, "ko"));

    // ── 5. 지금 쓰는 리워드 — 기준일에 작업이 돌고 있는 것만, 업체 수 ──
    const mix = new Map<string, Set<string>>();
    for (const c of clientList) for (const r of c.rewards) {
      if (r.done || r.isPackage || !r.vendor) continue;
      const k = `${r.vendor}|${r.product}`;
      mix.set(k, (mix.get(k) ?? new Set()).add(c.id));
    }
    const rewardMix = [...mix.entries()]
      .map(([k, s]) => { const [vendor, product] = k.split("|"); return { vendor, product, clients: s.size }; })
      .sort((a, b) => b.clients - a.clients || a.product.localeCompare(b.product, "ko"));

    // ── 6. 보장형 순위 요약 (업체 단위) ──
    const gRanks: GuaranteedRank[] = clientList.filter(c => c.rank).map(c => ({
      name: c.name, rank: c.rank!.rank, keyword: c.rank!.keyword, checked: c.rank!.checked,
    }));
    const split = splitGuaranteed(gRanks);

    const confirmSorted = [...confirmRows].sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
    const u = unapproved[0];

    const body: OpsBoardData = {
      asOf,
      weekStart,
      members: memberRows.map(m => ({ name: m.name, position: m.position })),
      campaignCount: activeRows.length,
      clients: clientList,
      careReady: care.ok,
      rewardMix,
      guaranteed: { inside: split.inside.length, outside: split.outside.length, unchecked: split.unchecked.length, total: gRanks.length },
      pending: {
        confirm: {
          count: confirmRows.length,
          amount: confirmRows.reduce((s, r) => s + parseAmount(r.amount), 0),
          oldestDate: confirmSorted[0]?.requestedAt.slice(0, 10) ?? null,
          oldestName: confirmSorted[0]?.name ?? null,
          requesters: [...new Set(confirmRows.map(r => r.requester).filter(Boolean))],
        },
        costs: { count: Number(u?.n ?? 0), supply: Number(u?.supply ?? 0) },
      },
    };
    return NextResponse.json(body);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "영업관리 현황 집계 실패" }, { status: 500 });
  }
}
