import type { MeetingAxisKey, MeetingSections, LegacyMeetingAxisEntry } from "@/db/schema";

/**
 * 회의록 4대 축. 화면(meetings)의 AXES 목록과 순서를 맞춰 둔다.
 */
export const MEETING_AXIS_KEYS: MeetingAxisKey[] = ["revenue", "operation", "sales", "marketing"];

/** 3칸 시절 각 칸의 이름. 합쳐 읽을 때 소제목으로 쓴다. */
const LEGACY_PARTS: { key: keyof LegacyMeetingAxisEntry; label: string }[] = [
  { key: "check",   label: "계획 점검" },
  { key: "current", label: "현황" },
  { key: "plan",    label: "계획" },
];

const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * 한 축을 자유 서술 한 칸으로 만든다.
 *
 * 새 형태({ text })면 그대로 쓰고, 3칸 시절 기록이면 이어 붙인다.
 * 칸이 하나만 차 있던 기록에까지 소제목을 붙이면 없던 구조가 생기므로,
 * 둘 이상 차 있을 때만 어느 칸에서 온 글인지 소제목으로 남긴다.
 */
function entryText(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const e = raw as Record<string, unknown>;
  if (typeof e.text === "string") return e.text;

  const parts = LEGACY_PARTS
    .map(p => ({ label: p.label, body: str(e[p.key]).trim() }))
    .filter(p => p.body);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].body;
  return parts.map(p => `[${p.label}]\n${p.body}`).join("\n\n");
}

/** 저장된 값이 어떤 형태든(없어도) 항상 4축을 채워 돌려준다. */
export function normalizeMeetingSections(raw: unknown): MeetingSections {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = {} as MeetingSections;
  for (const key of MEETING_AXIS_KEYS) out[key] = { text: entryText(src[key]) };
  return out;
}

/** 네 축이 모두 비었는지 — 비었으면 저장할 때 null로 떨어뜨린다(구버전과 동일 취급). */
export function meetingSectionsAreEmpty(s: MeetingSections): boolean {
  return MEETING_AXIS_KEYS.every(k => !s[k].text.trim());
}
