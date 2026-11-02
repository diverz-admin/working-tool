"use client";

/**
 * 정기 회의록 ① 전체 매출 — 회사 전체 기준, 자동 집계.
 *
 * 회의에서 읽는 순서: 이번 달 누적 실적 → 목표 대비 게이지(오늘 기준선) → 남은 금액·하루 필요·수주 예상
 * → 최근 6주 주간 매출 → 지난 2달과 비교.
 * 숫자는 /api/meeting-board/revenue 한 곳에서 오며, 금액 규칙은 revenue-brief와 같다.
 */

import { useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import { C, TONE, SectionCard, Flag, Empty, md, won, man, type BoardContext } from "./shared";

interface RevenueData {
  year: number; month: number; criteria: string; asOf: string;
  current: {
    target: number | null; asOfRevenue: number; monthRevenue: number; forecast: number;
    asOfDay: number; daysInMonth: number;
  };
  weeks: { start: string; end: string; current: boolean; amount: number }[];
  months: { year: number; month: number; current: boolean; actual: number; target: number | null }[];
}

/** 이 섹션에서만 쓰는 의미 색 — 목표(보라)·실적(파랑)·수주 예상(초록) */
const SEM = {
  target: "#7048E8", targetSoft: "#F5F2FF",
  actual: "#1971C2",
  forecast: "#0B8457", forecastSoft: "#E9F9F1",
};

const pct = (r: number) => (r < 10 ? r.toFixed(1) : r.toFixed(0));

export default function RevenueSection({ ctx, onBadge }: { ctx: BoardContext; onBadge?: (text: string) => void }) {
  const key = `year=${ctx.year}&month=${ctx.month}&asOf=${ctx.asOf}&criteria=${encodeURIComponent(ctx.criteria)}`;
  const [state, setState] = useState<{ key: string; data?: RevenueData; error?: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchJson<RevenueData>(`/api/meeting-board/revenue?${key}`)
      .then(data => { if (alive) setState({ key, data }); })
      .catch((e: unknown) => { if (alive) setState({ key, error: e instanceof Error ? e.message : "불러오지 못했습니다" }); });
    return () => { alive = false; };
  }, [key]);

  const ready = state?.key === key ? state : null;
  const data = ready?.data;

  // 목차 배지 — 달성률, 목표가 없으면 "자동"
  const badgeRef = useRef(onBadge);
  useEffect(() => { badgeRef.current = onBadge; });
  useEffect(() => {
    if (!data) return;
    const { target, asOfRevenue } = data.current;
    badgeRef.current?.(target ? `${pct((asOfRevenue / target) * 100)}%` : "자동");
  }, [data]);

  let pill: React.ReactNode = null;
  if (data?.current.target) {
    const { target, asOfRevenue, asOfDay, daysInMonth } = data.current;
    const shouldBe = Math.round((target * asOfDay) / daysInMonth);
    pill = asOfRevenue >= shouldBe
      ? <Flag tone={TONE.good}>목표 페이스 유지</Flag>
      : <Flag tone={TONE.warn}>페이스보다 {man(shouldBe - asOfRevenue)}원 부족</Flag>;
  }

  return (
    <SectionCard id="s-revenue" no={1} title="전체 매출" hint={`자동 집계 · ${ctx.criteria} 기준`} right={pill}>
      <div style={{ wordBreak: "keep-all" }}>
        {!ready ? <Empty>매출을 불러오는 중…</Empty>
          : ready.error ? <p className="text-[13px] px-1 py-4" style={{ color: C.bad }}>{ready.error}</p>
          : data ? <Body data={data} /> : null}
      </div>
    </SectionCard>
  );
}

function Body({ data }: { data: RevenueData }) {
  const { month, asOf } = data;
  const { target, asOfRevenue, forecast, asOfDay, daysInMonth } = data.current;
  const rate = target ? (asOfRevenue / target) * 100 : 0;
  const pace = (asOfDay / daysInMonth) * 100;
  const shouldBe = target ? Math.round((target * asOfDay) / daysInMonth) : 0;
  const remain = target ? Math.max(target - asOfRevenue, 0) : 0;
  const leftDays = daysInMonth - asOfDay + 1;     // 오늘 포함
  const monthEnd = asOfDay === daysInMonth;
  const mm = String(month).padStart(2, "0");
  const midDay = `${data.year}-${mm}-15`;

  const tiles: { t: string; v: string; s: string; fg: string; bg: string }[] = [
    target
      ? { t: "남은 금액", v: remain > 0 ? won(remain) : "목표 달성", s: "목표까지", fg: SEM.target, bg: SEM.targetSoft }
      : { t: "남은 금액", v: "—", s: "목표가 등록되면 계산", fg: SEM.target, bg: SEM.targetSoft },
    target && !monthEnd
      ? { t: "하루 필요", v: won(Math.round(remain / leftDays)), s: `남은 ${leftDays}일 기준 · 주 ${man((remain / leftDays) * 7)}원`, fg: C.warn, bg: C.warnSoft }
      : { t: "하루 필요", v: "—", s: target ? "마감된 달" : "목표가 등록되면 계산", fg: C.warn, bg: C.warnSoft },
    { t: "수주 예상", v: won(forecast), s: `${month}월 시작 계약 합계`, fg: SEM.forecast, bg: SEM.forecastSoft },
  ];

  return (
    <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* 왼쪽 — 큰 숫자 · 게이지 · 필요한 것 */}
      <div className="min-w-0">
        <p className="text-[13px] font-semibold" style={{ color: C.muted }}>
          {month}월 {monthEnd ? "실적" : "누적 실적"}
          <span className="font-normal ml-1.5" style={{ color: C.faint }}>{md(`${data.year}-${mm}-01`)} ~ {md(asOf)}</span>
        </p>
        <p className="text-[34px] md:text-[38px] font-bold tabular-nums leading-tight mt-1" style={{ color: C.ink, letterSpacing: "-0.8px" }}>
          {won(asOfRevenue)}
        </p>
        <p className="text-[14px] mt-0.5 tabular-nums" style={{ color: C.muted }}>
          {target
            ? <>목표 <span className="font-semibold" style={{ color: SEM.target }}>{won(target)}</span> 중 {pct(rate)}%</>
            : <>{month}월 목표가 아직 없습니다 · KPI 화면에서 등록하면 달성률이 나옵니다</>}
        </p>

        {target && (
          <div className="tabular-nums">
            <div className="relative mt-7 mb-2">
              <div className="h-3.5 rounded-full overflow-hidden" style={{ background: C.track }}>
                <span className="block h-full rounded-full"
                  style={{ width: `${Math.min(100, Math.max(rate, 1))}%`, background: rate >= 100 ? C.good : SEM.actual }} />
              </div>
              {!monthEnd && (
                <span className="absolute rounded-sm" aria-hidden
                  style={{ left: `${pace}%`, top: -6, bottom: -6, width: 2, background: C.ink, transform: "translateX(-1px)" }}>
                  <span className="absolute text-[11px] font-semibold whitespace-nowrap"
                    style={{ top: -19, color: C.ink, ...(pace < 25 ? { left: 0 } : pace > 75 ? { right: 0 } : { left: "50%", transform: "translateX(-50%)" }) }}>
                    오늘 기준선 {man(shouldBe)}
                  </span>
                </span>
              )}
            </div>
            <div className="flex justify-between text-[11px]" style={{ color: C.faint }}>
              <span>{month}.1</span><span>{md(midDay)}</span><span>{month}.{daysInMonth}</span>
            </div>
          </div>
        )}

        <div className="grid gap-2.5 mt-5 grid-cols-1 sm:grid-cols-3">
          {tiles.map(k => (
            <div key={k.t} className="rounded-xl px-3.5 py-3 min-w-0" style={{ background: k.bg }}>
              <p className="text-[11px] font-semibold" style={{ color: k.fg }}>{k.t}</p>
              <p className="text-[17px] font-bold mt-0.5 tabular-nums" style={{ color: C.ink }}>{k.v}</p>
              <p className="text-[11px]" style={{ color: C.muted }}>{k.s}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 오른쪽 — 주간 막대 · 지난 달 비교 */}
      <div className="min-w-0">
        <div className="flex justify-between items-baseline gap-2 flex-wrap mb-1.5">
          <p className="text-[13px] font-semibold" style={{ color: C.ink }}>주차별 매출</p>
          {target && <p className="text-[11px]" style={{ color: C.faint }}>점선 = {month}월 목표를 주 단위로 나눈 금액</p>}
        </div>
        <WeekChart weeks={data.weeks} weekNeed={target ? Math.round(target / (daysInMonth / 7)) : null} />
        <div className="grid grid-cols-3 gap-2 mt-2.5">
          {data.months.map(m => {
            const r = m.target ? (m.actual / m.target) * 100 : 0;
            return (
              <div key={`${m.year}-${m.month}`} className="rounded-xl px-3 py-2.5 min-w-0" style={{ border: `1px solid ${C.line}` }}>
                <p className="text-[11px] font-semibold" style={{ color: C.muted }}>{m.month}월 {m.current ? (monthEnd ? "마감" : "진행 중") : "마감"}</p>
                <p className="text-[15px] font-semibold tabular-nums" style={{ color: C.ink }}>{man(m.actual)}원</p>
                <div className="h-1 rounded-full overflow-hidden mt-1.5 mb-1" style={{ background: C.track }}>
                  <i className="block h-full rounded-full"
                    style={{ width: `${m.target ? Math.min(100, Math.max(r, 2)) : 0}%`, background: r >= 100 ? C.good : SEM.actual }} />
                </div>
                <p className="text-[11px] font-medium tabular-nums" style={{ color: C.muted }}>
                  {m.target ? `목표 ${man(m.target)} · ${r.toFixed(0)}%` : "목표 없음"}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** 최근 6주 주간 매출 막대 + 필요한 주간 매출 점선. viewBox로 그려 폭에 맞춰 줄어든다 */
function WeekChart({ weeks, weekNeed }: { weeks: RevenueData["weeks"]; weekNeed: number | null }) {
  const W = 460, H = 190, L = 6, R = 40, B = 26, T = 22;
  const top = Math.max(...weeks.map(w => w.amount), weekNeed ?? 0, 1);
  // 눈금 — 보기 좋은 간격(100만 단위 1·2·5 배수)으로 4칸
  const rawStep = top / 4;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= rawStep) ?? rawStep;
  const max = step * 4;
  const y = (v: number) => H - B - (v / max) * (H - B - T);
  const bw = (W - L - R) / weeks.length;
  const total = weeks.reduce((s, w) => s + w.amount, 0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block h-auto" role="img"
      aria-label={`최근 ${weeks.length}주 주차별 매출, 합계 ${man(total)}원`}>
      {[0, 1, 2, 3, 4].map(i => (
        <g key={i}>
          <line x1={L} x2={W - R} y1={y(step * i)} y2={y(step * i)} stroke={C.lineSoft} strokeWidth={1} />
          <text x={W - R + 6} y={y(step * i) + 3.5} fontSize={10} fill={C.faint}>{man(step * i)}</text>
        </g>
      ))}
      {weeks.map((w, i) => {
        const x = L + i * bw + bw * 0.22, bwid = bw * 0.56;
        const h = Math.max(3, H - B - y(w.amount));
        const color = w.current ? C.accent : SEM.actual;
        return (
          <g key={w.start}>
            <title>{`${md(w.start)} ~ ${md(w.end)} · ${won(w.amount)}`}</title>
            <rect x={x} y={H - B - h} width={bwid} height={h} rx={5} fill={color} fillOpacity={w.current ? 1 : 0.28} />
            <text x={x + bwid / 2} y={H - B - h - 6} fontSize={11} fontWeight={600} textAnchor="middle"
              fill={w.current ? C.accent : C.body}>{man(w.amount)}</text>
            <text x={x + bwid / 2} y={H - 8} fontSize={11} textAnchor="middle"
              fill={w.current ? C.accent : C.faint} fontWeight={w.current ? 600 : 400}>
              {w.current ? "이번 주" : md(w.start).replace(".", "/")}
            </text>
          </g>
        );
      })}
      {weekNeed !== null && (
        <g>
          <line x1={L} x2={W - R} y1={y(weekNeed)} y2={y(weekNeed)} stroke={SEM.target} strokeWidth={1.5} strokeDasharray="5 4" />
          <text x={L + 2} y={y(weekNeed) - 6} fontSize={10.5} fontWeight={600} fill={SEM.target}>주 {man(weekNeed)} 필요</text>
        </g>
      )}
    </svg>
  );
}
