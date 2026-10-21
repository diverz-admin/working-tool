"use client";

import { useState } from "react";

/**
 * 내부지출 입금 정보(은행·예금주·계좌·입금기한).
 * 입금기한은 "yyyy-mm-ddThh:mm"(datetime-local 값) 문자열로 저장한다 — 시간대 변환 없이 적힌 그대로.
 */

export interface DepositFields {
  depositBank:     string | null;
  depositHolder:   string | null;
  depositAccount:  string | null;
  depositDeadline: string | null;
}

export interface ParsedDeposit {
  title?:    string;
  amount?:   string;
  bank?:     string;
  holder?:   string;
  account?:  string;
  deadline?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

// "10월 21일 오후 6시 20분", "2026년 10월 21일 18:20", "2026-10-21 18:20", "10/21 18:20" → "2026-10-21T18:20"
export function parseDeadline(raw: string): string | undefined {
  const s = raw.trim();
  const now = new Date();
  let y = now.getFullYear(), mo: number, d: number;

  const iso = s.match(/(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})/);
  const kor = s.match(/(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  const slash = s.match(/(?:^|\s)(\d{1,2})\/(\d{1,2})(?:\s|$)/);
  if (iso)        { y = +iso[1]; mo = +iso[2]; d = +iso[3]; }
  else if (kor)   { if (kor[1]) y = +kor[1]; mo = +kor[2]; d = +kor[3]; }
  else if (slash) { mo = +slash[1]; d = +slash[2]; }
  else return undefined;

  let h = 23, mi = 59;
  const korTime = s.match(/(오전|오후)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/);
  const colon   = s.match(/(오전|오후)?\s*(\d{1,2}):(\d{2})/);
  const t = colon ?? korTime;
  if (t) {
    h = +t[2]; mi = t[3] ? +t[3] : 0;
    if (t[1] === "오후" && h < 12) h += 12;
    if (t[1] === "오전" && h === 12) h = 0;
  }
  if (!mo || !d || mo > 12 || d > 31 || h > 23 || mi > 59) return undefined;
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}`;
}

const KEY_MAP: [RegExp, keyof ParsedDeposit][] = [
  [/^(상품명|품목|품명|주문명|주문상품)$/, "title"],
  [/^(은행|은행명|입금은행)$/,              "bank"],
  [/^(예금주|받는\s*분|수취인)$/,           "holder"],
  [/^(입금계좌|계좌|계좌번호|입금\s*계좌번호)$/, "account"],
  [/^(금액|입금금액|결제금액|입금액|총\s*금액)$/, "amount"],
  [/^(입금기한|입금\s*마감|기한|마감)$/,     "deadline"],
];

/** "키 : 값" 형식의 입금 안내 문구에서 항목을 뽑는다 */
export function parseDepositText(text: string): ParsedDeposit {
  const out: ParsedDeposit = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([^:：]+?)\s*[:：]\s*(.+?)\s*$/);
    if (!m) continue;
    const key = m[1].replace(/\s+/g, " ").trim();
    const val = m[2];
    const field = KEY_MAP.find(([re]) => re.test(key))?.[1];
    if (!field || out[field]) continue;
    if (field === "amount")        out.amount = val.replace(/[^0-9]/g, "") || undefined;
    else if (field === "account")  out.account = val.replace(/[^0-9-]/g, "") || undefined;
    else if (field === "deadline") out.deadline = parseDeadline(val);
    else                           out[field] = val;
  }
  return out;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function fmtDeadline(v: string | null): string {
  if (!v) return "—";
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return v;
  const [, y, mo, d, h, mi] = m;
  const w = WEEKDAYS[new Date(+y, +mo - 1, +d).getDay()];
  const hh = +h;
  const ampm = hh < 12 ? "오전" : "오후";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${+mo}월 ${+d}일 (${w}) ${ampm} ${h12}시${+mi ? ` ${+mi}분` : ""}`;
}

/** 입금기한까지 남은 시간 상태 — 목록 배지용 */
export function deadlineState(v: string | null): "over" | "soon" | "ok" | null {
  if (!v) return null;
  const t = new Date(v).getTime();   // 시간대 없는 값은 브라우저 로컬 시각으로 해석
  if (Number.isNaN(t)) return null;
  const diff = t - Date.now();
  if (diff < 0) return "over";
  if (diff < 24 * 3600 * 1000) return "soon";
  return "ok";
}

export function DeadlineBadge({ deadline }: { deadline: string | null }) {
  const st = deadlineState(deadline);
  if (!st || !deadline) return null;
  const m = deadline.match(/^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  const short = m ? `${+m[1]}/${+m[2]} ${m[3]}:${m[4]}` : deadline;
  const style = st === "over"
    ? { background: "rgba(239,68,68,0.1)", color: "#DC2626" }
    : st === "soon"
      ? { background: "rgba(234,179,8,0.12)", color: "#CA8A04" }
      : { background: "#F1F5F9", color: "#64748B" };
  return (
    <span className="text-xs px-1.5 py-0.5 rounded-md font-semibold whitespace-nowrap" style={style}>
      {st === "over" ? "기한 지남" : "입금기한"} {short}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* 무시 */ }
      }}
      className="text-xs font-semibold px-2 py-0.5 rounded-md hover:opacity-70"
      style={{ background: done ? "rgba(16,185,129,0.1)" : "rgba(49,130,246,0.1)", color: done ? "#059669" : "#3182F6" }}>
      {done ? "복사됨" : "복사"}
    </button>
  );
}

/** 상세 모달용 입금 정보 카드. 입력된 값이 하나도 없으면 렌더하지 않는다 */
export function DepositInfoCard({ item, amount }: { item: DepositFields; amount: number | null }) {
  const { depositBank, depositHolder, depositAccount, depositDeadline } = item;
  if (!depositBank && !depositHolder && !depositAccount && !depositDeadline) return null;
  const st = deadlineState(depositDeadline);

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs shrink-0" style={{ color: "#94A3B8" }}>{label}</span>
      <span className="text-sm font-semibold text-right flex items-center gap-2" style={{ color: "#191F28" }}>{value}</span>
    </div>
  );

  return (
    <div className="px-4 py-3 rounded-xl" style={{ background: "#F8FAFC", border: "1px solid #E9EBEF" }}>
      <p className="text-xs font-bold mb-1" style={{ color: "#64748B" }}>입금 정보</p>
      {depositBank   && row("은행", depositBank)}
      {depositHolder && row("예금주", depositHolder)}
      {depositAccount && row("계좌번호", <>{depositAccount}<CopyButton text={depositAccount.replace(/-/g, "")} /></>)}
      {amount != null && row("금액", <>₩{amount.toLocaleString()}<CopyButton text={String(amount)} /></>)}
      {depositDeadline && row("입금기한",
        <span style={{ color: st === "over" ? "#DC2626" : st === "soon" ? "#CA8A04" : "#191F28" }}>
          {fmtDeadline(depositDeadline)}{st === "over" && " · 지남"}
        </span>
      )}
    </div>
  );
}
