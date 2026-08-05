// 팀 목록·색상 단일 소스. 화면마다 목록이 갈리지 않도록 여기서만 정의한다.

/** 표준 팀 목록 (표시 순서 = 정렬 순서) */
export const TEAMS = ["경영", "영업 1팀", "영업 2팀", "운영팀", "개발팀"] as const;
export type Team = (typeof TEAMS)[number];

/** 집계·차트 정렬 기준 (데이터에 없는 팀도 순서만 잡아준다) */
export const TEAM_ORDER: readonly string[] = TEAMS;

/** 결재 화면처럼 소속 밖 지출을 담아야 하는 곳에서 쓰는 목록 */
export const TEAMS_WITH_ETC: readonly string[] = [...TEAMS, "기타"];

/** 필터 바 ("전체" + 표준 팀) */
export const TEAM_FILTERS: readonly string[] = ["전체", ...TEAMS];

export const TEAM_COLORS: Record<string, string> = {
  "경영":     "#F59E0B",
  "영업 1팀": "#6366F1",
  "영업 2팀": "#10B981",
  "운영팀":   "#EC4899",
  "개발팀":   "#0EA5E9",
  "기타":     "#8B5CF6",
  "미지정":   "#94A3B8",
};

const FALLBACK_COLOR = "#8B5CF6";

export function teamColor(team?: string | null): string {
  if (!team) return TEAM_COLORS["미지정"];
  return TEAM_COLORS[team] ?? FALLBACK_COLOR;
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** 팀 배지(연한 배경 + 진한 글자) 스타일 */
export function teamBadgeStyle(team?: string | null, alpha = 0.12) {
  const color = teamColor(team);
  const { r, g, b } = hexToRgb(color);
  return { background: `rgba(${r},${g},${b},${alpha})`, color };
}

/** 사용자 팀("경영")과 광고주 팀("경영팀")처럼 접미사만 다른 표기를 흡수한다 */
export function normalizeTeam(team?: string | null): string {
  return (team ?? "").trim().replace(/팀$/, "");
}

/** 표준 목록에 없는 값(구 데이터 등)인지 판별 */
export function isKnownTeam(team?: string | null): boolean {
  return !!team && (TEAMS as readonly string[]).includes(team);
}
