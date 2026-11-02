/**
 * 오늘(한국 시간)부터 dateStr(YYYY-MM-DD)까지 남은 일수. 지났으면 음수, 없으면 null.
 *
 * 서버(Vercel)는 UTC라서 setHours(0,0,0,0)로 자르면 한국 시간 00시~09시 사이에
 * 오늘이 어제로 잡혀 당일 종료 건이 D-1로 나온다. 그래서 오늘 날짜를 Asia/Seoul로 정한다.
 */
export function daysRemaining(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  return Math.round((Date.parse(String(dateStr).slice(0, 10)) - Date.parse(today)) / 86400000);
}
