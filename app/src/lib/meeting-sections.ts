import type { MeetingAxisKey, MeetingAxisEntry, MeetingSections, MeetingMemberEntry, MeetingMembers, MeetingTeamKey, MeetingTeamNotes } from "@/db/schema";

/** 회의록 4대 축. 화면(meetings)의 AXES 목록과 순서를 맞춰 둔다. */
export const MEETING_AXIS_KEYS: MeetingAxisKey[] = ["revenue", "operation", "sales", "marketing"];

/**
 * 사람이 직접 쓰는 축.
 * 매출현황은 자동 집계가 회의에서 읽을 수치를 전부 만들어 주므로 입력 칸을 두지 않는다.
 * 같은 숫자를 손으로 옮겨 적으면 집계와 어긋나는 순간 어느 쪽이 맞는지 알 수 없어진다.
 */
export const MEETING_WRITABLE_AXIS_KEYS: MeetingAxisKey[] = ["operation", "sales", "marketing"];

const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * 한 축을 prev · current · next 세 칸으로 맞춘다.
 *
 * 지난 형태로 저장된 기록도 여기서 옮긴다.
 *   3칸 시절 check·current·plan → prev·current·next (가리키는 기간이 그대로 같다)
 *   1칸 시절 text               → current (언제 얘기인지 알 수 없으니 이번 기간으로 둔다)
 */
function toEntry(raw: unknown): MeetingAxisEntry {
  if (!raw || typeof raw !== "object") return { prev: "", current: "", next: "" };
  const e = raw as Record<string, unknown>;
  if (typeof e.prev === "string" || typeof e.next === "string") {
    return { prev: str(e.prev), current: str(e.current), next: str(e.next) };
  }
  if (typeof e.text === "string") return { prev: "", current: e.text, next: "" };
  return { prev: str(e.check), current: str(e.current), next: str(e.plan) };
}

/** 저장된 값이 없거나 지난 형태여도 항상 4축 × 3칸을 채워 돌려준다. */
export function normalizeMeetingSections(raw: unknown): MeetingSections {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = {} as MeetingSections;
  for (const key of MEETING_AXIS_KEYS) out[key] = toEntry(src[key]);
  return out;
}

/** 한 축에 쓴 내용이 있는지 */
export function axisHasText(e: MeetingAxisEntry): boolean {
  return !!(e.prev.trim() || e.current.trim() || e.next.trim());
}

/** 쓸 수 있는 축이 전부 비었는지 — 비었으면 저장할 때 null로 떨어뜨린다. */
export function meetingSectionsAreEmpty(s: MeetingSections): boolean {
  return MEETING_WRITABLE_AXIS_KEYS.every(k => !axisHasText(s[k]));
}

// ─── 멤버별 기록 ──────────────────────────────────────────────

export const emptyMemberEntry = (): MeetingMemberEntry => ({ done: "", todo: "", issue: "" });

export function memberHasText(e?: MeetingMemberEntry | null): boolean {
  return !!e && !!(e.done.trim() || e.todo.trim() || e.issue.trim());
}

/** 저장된 멤버 기록을 이름 → 세 칸으로 맞춘다. 내용이 없는 멤버는 뺀다. */
export function normalizeMeetingMembers(raw: unknown): MeetingMembers {
  const out: MeetingMembers = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [name, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!name.trim() || !v || typeof v !== "object") continue;
    const e = v as Record<string, unknown>;
    const entry = { done: str(e.done), todo: str(e.todo), issue: str(e.issue) };
    if (memberHasText(entry)) out[name.trim()] = entry;
  }
  return out;
}

// ─── 팀별 기록 ────────────────────────────────────────────────

/** 사람이 아니라 팀 단위로 쓰는 칸 — 회의록 화면 순서와 같다 */
export const MEETING_TEAM_KEYS: MeetingTeamKey[] = ["ops", "marketing", "dev", "admin"];

/** 저장된 팀 기록을 팀 → 세 칸으로 맞춘다. 모르는 키·빈 칸은 뺀다. */
export function normalizeMeetingTeamNotes(raw: unknown): MeetingTeamNotes {
  const out: MeetingTeamNotes = {};
  if (!raw || typeof raw !== "object") return out;
  const src = raw as Record<string, unknown>;
  for (const key of MEETING_TEAM_KEYS) {
    const v = src[key];
    if (!v || typeof v !== "object") continue;
    const e = v as Record<string, unknown>;
    const entry = { done: str(e.done), todo: str(e.todo), issue: str(e.issue) };
    if (memberHasText(entry)) out[key] = entry;
  }
  return out;
}

/** 참석자 이름 목록 — 공백·중복을 뺀다 */
export function normalizeAttendees(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((v): v is string => typeof v === "string").map(v => v.trim()).filter(Boolean))];
}
