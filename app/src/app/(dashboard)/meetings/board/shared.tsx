"use client";

/**
 * 정기 회의록 화면(MeetingBoard)의 섹션들이 함께 쓰는 토큰·부품.
 *
 * 섹션마다 카드·숫자 타일·입력 칸을 따로 만들면 굵기와 간격이 조금씩 어긋난다.
 * 글자 굵기는 가볍게 둔다 — 섹션 제목·큰 숫자만 700, 라벨·이름은 600, 보조 설명은 400~500.
 */

import type { MeetingMemberEntry } from "@/db/schema";

/** 앱 공통 토큰(--diverz-*)과 같은 값 */
export const C = {
  ink:    "#191F28",   // 제목·숫자
  body:   "#333D4B",   // 본문
  muted:  "#6B7684",   // 라벨·보조 설명
  faint:  "#8B95A1",   // 비어 있음·부가 안내
  line:   "#E5E8EB",   // 경계선
  lineSoft: "#F0F2F4", // 표 안쪽 줄
  soft:   "#F7F8FA",   // 읽기 전용 영역 배경
  track:  "#EEF0F3",   // 막대 바탕
  accent: "#3182F6",
  accentSoft: "#EAF2FE",
  good:   "#2B8A3E", goodSoft: "#EBFBEE",
  warn:   "#E8590C", warnSoft: "#FFF4E6",
  bad:    "#E03131", badSoft:  "#FFF5F5",
};

/** 상태 색 한 쌍 — 글자색 + 옅은 배경 */
export type Tone = { fg: string; bg: string };
export const TONE = {
  good:   { fg: C.good,  bg: C.goodSoft },
  warn:   { fg: C.warn,  bg: C.warnSoft },
  bad:    { fg: C.bad,   bg: C.badSoft },
  accent: { fg: C.accent, bg: C.accentSoft },
  muted:  { fg: C.muted, bg: C.soft },
} satisfies Record<string, Tone>;

/**
 * 회의 맥락 — 섹션은 이것만 보고 무엇을 불러올지 정한다.
 *   asOf      — 회의일(없으면 오늘). 그 달 밖이면 월 경계로 맞춘 값
 *   weekStart — asOf가 속한 주의 월요일. "이번 주" = weekStart ~ weekStart+6
 */
export interface BoardContext {
  year: number;
  month: number;
  week: number | null;     // null = 월간회의
  asOf: string;            // YYYY-MM-DD
  weekStart: string;       // YYYY-MM-DD (월요일)
  criteria: string;        // 매출 기준 — "캠페인 시작날짜" | "계산서날짜" | "통장"
  userName: string;        // 지금 쓰는 사람 (저장 시 updated_by)
}

// ─── 날짜 ─────────────────────────────────────────────────────

export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

/** 그 날짜가 속한 주의 월요일 */
export function mondayOf(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return addDays(iso, -((d.getDay() + 6) % 7));
}

/** 두 날짜 사이 일수 (b - a) */
export function daysBetween(a: string, b: string) {
  return Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86400000);
}

/** "2026-11-02" → "11.2" */
export const md = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;

export const DOW = ["일", "월", "화", "수", "목", "금", "토"];

// ─── 숫자 ─────────────────────────────────────────────────────

export const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
export const num = (n: number) => Math.round(n).toLocaleString("ko-KR");
/** 큰 금액을 회의에서 읽기 좋게 — 1,447.6만 / 1.2억 */
export function man(n: number) {
  if (Math.abs(n) >= 100_000_000) return `${(n / 100_000_000).toFixed(1).replace(/\.0$/, "")}억`;
  return `${(n / 10_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}만`;
}

// ─── 사람 색 ──────────────────────────────────────────────────

const PERSON_PALETTE = ["#3182F6", "#0CA678", "#F08C00", "#D6336C", "#1098AD", "#7048E8", "#E8590C", "#5C940D"];

/** 이름마다 고정된 색 — 같은 사람은 어느 섹션에서나 같은 색 */
export function personColor(name?: string | null) {
  if (!name) return C.faint;
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PERSON_PALETTE[h % PERSON_PALETTE.length];
}

export function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <span className="inline-flex items-center justify-center rounded-full shrink-0 text-white font-semibold"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.46), background: personColor(name) }}>
      {name.slice(0, 1)}
    </span>
  );
}

// ─── 카드 ─────────────────────────────────────────────────────

/** 회의 순서 한 칸. id는 왼쪽 목차가 스크롤로 찾아오는 앵커다 */
export function SectionCard({ id, no, title, hint, right, children }: {
  id: string; no: number; title: string; hint?: string; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="rounded-2xl bg-white p-5 md:p-6 scroll-mt-4"
      style={{ border: `1px solid ${C.line}` }}>
      <div className="flex items-center gap-2.5 flex-wrap mb-4">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[12px] font-semibold text-white"
          style={{ background: C.ink }}>{no}</span>
        <h2 id={`${id}-h`} className="text-[18px] font-bold" style={{ color: C.ink }}>{title}</h2>
        {hint && <span className="text-[13px]" style={{ color: C.muted }}>{hint}</span>}
        {right && <span className="ml-auto">{right}</span>}
      </div>
      {children}
    </section>
  );
}

/** 카드 안의 테두리 상자 — 머리말(제목 + 설명) + 내용 */
export function Panel({ title, sub, right, children, className = "" }: {
  title?: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`rounded-xl overflow-hidden min-w-0 ${className}`} style={{ border: `1px solid ${C.line}` }}>
      {(title || sub || right) && (
        <div className="flex items-start gap-3 px-4 py-3" style={{ borderBottom: `1px solid ${C.line}` }}>
          <div className="min-w-0">
            {title && <p className="text-[14px] font-semibold" style={{ color: C.ink }}>{title}</p>}
            {sub && <p className="text-[12px] mt-0.5" style={{ color: C.muted }}>{sub}</p>}
          </div>
          {right && <div className="ml-auto shrink-0">{right}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export interface KpiItem { label: string; value: string; sub?: string; color?: string }

/** 섹션 머리의 숫자 타일 줄 */
export function KpiRow({ items }: { items: KpiItem[] }) {
  return (
    <div className="grid gap-px rounded-xl overflow-hidden" style={{
      gridTemplateColumns: `repeat(auto-fit, minmax(150px, 1fr))`, background: C.line, border: `1px solid ${C.line}`,
    }}>
      {items.map(k => (
        <div key={k.label} className="bg-white px-4 py-3 min-w-0">
          <p className="text-[12px] font-medium" style={{ color: C.muted }}>{k.label}</p>
          <p className="text-[20px] font-bold mt-0.5 tabular-nums" style={{ color: k.color ?? C.ink }}>{k.value}</p>
          {k.sub && <p className="text-[12px] mt-0.5" style={{ color: C.faint }}>{k.sub}</p>}
        </div>
      ))}
    </div>
  );
}

/** 작은 상태 배지 */
export function Flag({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center text-[11px] font-semibold rounded-md px-1.5 py-0.5 whitespace-nowrap"
      style={{ color: tone.fg, background: tone.bg }}>{children}</span>
  );
}

/** 불러오는 중 / 실패 / 비어 있음 한 줄 */
export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] px-4 py-6 text-center" style={{ color: C.faint }}>{children}</p>;
}

// ─── 입력 칸 ──────────────────────────────────────────────────

export function Field({ label, note, value, onChange, placeholder, rows = 6, action }: {
  label: string; note?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; rows?: number; action?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 mb-1.5 min-h-[22px]">
        <label className="text-[13px] font-semibold" style={{ color: C.body }}>
          {label}
          {note && <span className="font-normal ml-1.5" style={{ color: C.faint }}>{note}</span>}
        </label>
        {action && <span className="ml-auto shrink-0">{action}</span>}
      </div>
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} placeholder={placeholder}
        className="w-full px-3.5 py-2.5 text-sm rounded-lg outline-none border leading-relaxed transition-colors focus:border-[#3182F6] placeholder:text-[#8B95A1]"
        style={{ borderColor: C.line, color: C.ink, resize: "vertical" }} />
    </div>
  );
}

export function MiniButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="text-[12px] font-medium rounded-md px-2 py-0.5 transition-colors hover:bg-[#F2F4F6] disabled:opacity-40"
      style={{ color: C.accent }}>{children}</button>
  );
}

export const emptyEntry = (): MeetingMemberEntry => ({ done: "", todo: "", issue: "" });

/** 칸 이름 — 저장은 done·todo·issue 세 칸이지만 팀마다 부르는 이름이 다르다 */
export type EntryLabels = Partial<Record<keyof MeetingMemberEntry, { label: string; note?: string; placeholder?: string }>>;

/**
 * 팀·사람 한 명의 기록 칸 묶음.
 * prevTodo가 있으면 "지난 할 일 가져오기"로 직전 회의의 할 일을 한 일 칸에 붙인다.
 */
export function EntryFields({ value, onChange, labels, prevTodo, keys = ["done", "todo", "issue"] }: {
  value: MeetingMemberEntry; onChange: (v: MeetingMemberEntry) => void;
  labels?: EntryLabels; prevTodo?: string; keys?: (keyof MeetingMemberEntry)[];
}) {
  const base: Required<EntryLabels> = {
    done:  { label: "전주 한 일", note: "결과 점검" },
    todo:  { label: "금주 할 일" },
    issue: { label: "이슈 · 요청" },
  };
  const pull = () => {
    if (!prevTodo?.trim()) return;
    onChange({ ...value, done: value.done.trim() ? `${value.done.trim()}\n${prevTodo.trim()}` : prevTodo.trim() });
  };
  return (
    <div className="grid gap-3.5" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(240px, 1fr))` }}>
      {keys.map(k => {
        const l = { ...base[k], ...labels?.[k] };
        return (
          <Field key={k} label={l.label} note={l.note} placeholder={l.placeholder}
            value={value[k]} onChange={v => onChange({ ...value, [k]: v })}
            action={k === "done" && prevTodo?.trim() ? <MiniButton onClick={pull}>지난 할 일 가져오기</MiniButton> : undefined} />
        );
      })}
    </div>
  );
}
