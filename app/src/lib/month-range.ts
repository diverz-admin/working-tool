/**
 * 월의 시작·종료 날짜를 'YYYY-MM-DD' 문자열로 반환한다.
 *
 * new Date(year, month, 0).toISOString() 을 쓰면 로컬 시간(KST)이 UTC로 당겨지면서
 * 말일이 하루 앞으로 밀려(예: 7월 → "2026-07-30") 매월 마지막 날 데이터가 통째로 누락된다.
 * 날짜 컬럼(date)은 시간대 개념이 없으므로 로컬 달력 값을 그대로 포맷해야 한다.
 */
export function monthRange(year: number, month: number): { from: string; to: string } {
  const mm       = String(month).padStart(2, "0");
  const lastDay  = new Date(year, month, 0).getDate();
  return {
    from: `${year}-${mm}-01`,
    to:   `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}
