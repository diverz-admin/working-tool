/**
 * 회의록 매출현황 축 자동 집계 — 화면·복사 텍스트·공유 이미지가 함께 쓰는 표현 규칙.
 *
 * 같은 수치를 세 곳에서 각자 만들면 어느 하나만 고쳤을 때 조용히 갈라진다.
 * 무엇을 몇 개 보여줄지(briefStats)와 어떻게 읽을지(briefText)를 여기 한 곳에 둔다.
 */

/** /api/projects/revenue-brief 응답 */
export interface RevenueBriefData {
  asOf: string; asOfDay: number;
  kpiTarget: number | null;
  asOfRevenue: number; monthRevenue: number;
  asOfCost: number; monthCost: number;
  forecast: number;
  projects: { total: number; guaranteed: number; managed: number; etc: number; fresh: number; extended: number };
}

/**
 * 자동 집계 전용 색.
 * 목표 / 실적 / 전망을 색으로 갈라야 세 숫자가 한 덩어리로 안 뭉친다.
 * 회의록 본문에는 색을 쓰지 않으므로, 색이 있는 곳 = 시스템이 계산한 값이라는 신호도 된다.
 */
export const BRIEF_TONE = {
  target:   { fg: "#7048E8", bg: "#F5F2FF" },  // 목표 — 월 KPI
  actual:   { fg: "#1971C2", bg: "#EBF5FF" },  // 실적 — 누적 매출
  forecast: { fg: "#0B8457", bg: "#E9F9F1" },  // 전망 — 월말 예상
  cost:     { fg: "#D9480F", bg: "#FFF4E6" },  // 지출 — 누적 매입
} as const;

export type BriefTone = keyof typeof BRIEF_TONE;

export interface BriefStat {
  label: string;
  value: string;
  sub?: string;
  tone: BriefTone;
  /** 값이 실제 수치가 아닐 때(미설정 등) — 흐리게 둔다 */
  dim?: boolean;
}

/**
 * 자동 집계 금액은 반올림하지 않는다.
 * 만원 단위로 끊으면 3,384,000원이 "338만원"이 되어 회의록에 옮겨 적을 때 실제 금액과 어긋난다.
 */
export function wonExact(n: number) {
  return `${n.toLocaleString()}원`;
}

/**
 * 핵심 금액 세 칸.
 *
 * 주간회의는 월 KPI · 월 누적 매출 · 월 누적 매입을 본다.
 * 주 단위 회의에서 필요한 건 "이번 달 어디까지 왔나"이지 월말 전망이 아니다.
 * 누적은 기준일로 자르지 않고 그 달 전체를 집계한 값이다 — 수주 기준에서는 캠페인 시작일이
 * 아직 안 왔어도 이미 계약된 매출이라, 오늘로 자르면 프로젝트 리포트와 값이 어긋난다.
 *
 * 월간회의는 기준일 매출과 월말 예상매출까지 본다.
 */
export function briefStats(b: RevenueBriefData, isMonthly: boolean): BriefStat[] {
  const hasKpi = b.kpiTarget !== null && b.kpiTarget > 0;
  const rateOf = (n: number) => (hasKpi ? `${Math.round((n / b.kpiTarget!) * 100)}%` : null);

  const kpi: BriefStat = {
    label: "월 KPI", tone: "target",
    value: hasKpi ? wonExact(b.kpiTarget!) : "미설정",
    sub:   hasKpi ? undefined : "프로젝트 관리에서 등록",
    dim:   !hasKpi,
  };

  if (!isMonthly) {
    const rate = rateOf(b.monthRevenue);
    return [
      kpi,
      { label: "월 누적 매출", tone: "actual", value: wonExact(b.monthRevenue), sub: rate ? `KPI 달성 ${rate}` : undefined },
      { label: "월 누적 매입", tone: "cost",   value: wonExact(b.monthCost),    sub: `마진 ${wonExact(b.monthRevenue - b.monthCost)}` },
    ];
  }

  const rate = rateOf(b.asOfRevenue);
  const fcst = rateOf(b.forecast);
  return [
    kpi,
    { label: `${b.asOfDay}일 매출`, tone: "actual",   value: wonExact(b.asOfRevenue), sub: rate ? `KPI 달성 ${rate}` : undefined },
    { label: "월말 예상매출",       tone: "forecast", value: wonExact(b.forecast),    sub: fcst ? `예상 달성 ${fcst}` : undefined },
  ];
}

export interface BriefProgress {
  /** 무엇이 목표에 닿았는지 — 주간은 월 누적, 월간은 기준일까지 */
  label: string;
  achieved: number;
  target: number;
  /** 달성률(%). 100을 넘을 수 있다 */
  rate: number;
  /** 목표까지 남은 금액. 이미 넘겼으면 0 */
  remaining: number;
}

/**
 * 목표 대비 어디까지 왔는지. KPI가 없으면 그릴 것도 없으므로 null이다.
 * 주간회의는 월 누적 매출을, 월간회의는 기준일까지의 매출을 목표와 견준다 —
 * briefStats가 각각 두 번째 칸에 놓는 값과 같은 것이라야 카드 안에서 숫자가 갈라지지 않는다.
 */
export function briefProgress(b: RevenueBriefData, isMonthly: boolean): BriefProgress | null {
  if (b.kpiTarget === null || b.kpiTarget <= 0) return null;
  const achieved = isMonthly ? b.asOfRevenue : b.monthRevenue;
  return {
    label:     isMonthly ? `${b.asOfDay}일 매출` : "월 누적 매출",
    achieved,
    target:    b.kpiTarget,
    rate:      (achieved / b.kpiTarget) * 100,
    remaining: Math.max(0, b.kpiTarget - achieved),
  };
}

/** 브리핑을 메신저·메일에 그대로 붙일 수 있는 텍스트로 만든다. */
export function briefText(b: RevenueBriefData, isMonthly: boolean) {
  const lines = ["[매출 현황]"];
  briefStats(b, isMonthly).forEach((s, i) => {
    lines.push(`${i + 1}. ${s.label}: ${s.value}${s.sub && !s.dim ? ` (${s.sub})` : ""}`);
  });
  if (isMonthly) {
    const p = b.projects;
    lines.push("4. 프로젝트 현황", ` - 보장형 ${p.guaranteed}건`, ` - 관리형 ${p.managed}건`, ` - 신규 ${p.fresh}건`);
  }
  return lines.join("\n");
}
