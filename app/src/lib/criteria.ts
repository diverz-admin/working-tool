/**
 * 매출·매입 집계 기준. 화면(클라이언트)에서도 쓰므로 DB를 부르는 revenue-stats와 따로 둔다.
 *
 * 모든 지표 화면의 기본 기준은 영업자 정산이다 —
 * 매출은 계산서 발행일(계산서 없는 건은 입금확인일), 매입은 승인일(확인일)로 귀속한다.
 */
export type StatsCriteria = "캠페인 시작날짜" | "계산서날짜" | "통장" | "영업자 정산";

export const DEFAULT_CRITERIA: StatsCriteria = "영업자 정산";

/** 화면에 적는 기준 설명 — 매출·매입이 어느 날짜로 잡히는지 */
export function criteriaDescription(criteria: string): string {
  switch (criteria) {
    case "영업자 정산": return "매출: 계산서 발행일 (계산서 없는 건은 입금확인일) 기준 · 매입: 승인일 기준";
    case "계산서날짜": return "매출: 계산서 발행일 기준 · 매입: 승인일 기준";
    case "통장":       return "매출: 입금확인일 기준 · 매입: 승인일 기준";
    default:           return "매출: 캠페인 시작일 기준 (입금확인 완료 건) · 매입: 작업시작일 기준";
  }
}
