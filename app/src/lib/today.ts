/**
 * 오늘 날짜 YYYY-MM-DD.
 *
 * toISOString()으로 자르면 UTC 기준이라 한국 시간 00시~09시 사이에는 하루 전 날짜가 나온다.
 * 아침에 올린 입금·계산서 날짜가 어제로 찍히는 문제라 로컬 기준으로 만든다.
 * "sv-SE" 로케일이 곧 YYYY-MM-DD 형식이다.
 */
export function todayStr() {
  return new Date().toLocaleDateString("sv-SE");
}
