"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * 년·월·일 캘린더 필터.
 * 값은 기간 접두어 — "2026"(년) | "2026-10"(월) | "2026-10-21"(일) | null(전체 기간).
 * 항목 날짜가 이 접두어로 시작하면 해당 기간에 포함된다.
 */

export type Period = string | null;

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (t: Date) => `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
const todayStr = () => ymd(new Date());

export function periodLabel(p: Period): string {
  if (!p) return "전체 기간";
  const [y, m, d] = p.split("-");
  if (d) {
    const w = WEEKDAYS[new Date(Number(y), Number(m) - 1, Number(d)).getDay()];
    return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일 (${w})`;
  }
  if (m) return `${y}년 ${parseInt(m)}월`;
  return `${y}년 전체`;
}

export function matchesPeriod(date: string | null | undefined, p: Period): boolean {
  return p === null || (date ?? "").startsWith(p);
}

/**
 * 처음 열 때 보여줄 월(yyyy-mm). 이번 달에 항목이 있으면 이번 달,
 * 없으면 오늘 이전 가장 최근 월, 그것도 없으면 가장 가까운 미래 월.
 */
export function pickDefaultMonth(dates: string[]): string | null {
  const months = Array.from(new Set(dates.filter(Boolean).map((d) => d.slice(0, 7)))).sort();
  if (!months.length) return null;
  const cur = todayStr().slice(0, 7);
  if (months.includes(cur)) return cur;
  return months.filter((m) => m < cur).at(-1) ?? months[0];
}

// 같은 단위(년/월/일)로 앞뒤 이동
function shiftPeriod(p: string, delta: number): string {
  const [y, m, d] = p.split("-").map(Number);
  if (d) return ymd(new Date(y, m - 1, d + delta));
  if (m) { const t = new Date(y, m - 1 + delta, 1); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}`; }
  return String(y + delta);
}

const Chevron = ({ dir }: { dir: "left" | "right" }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points={dir === "left" ? "15 18 9 12 15 6" : "9 18 15 12 9 6"} />
  </svg>
);

export default function CalendarPeriodFilter({
  dates, value, onChange, accent = "#3182F6",
}: {
  /** 항목별 날짜 목록(yyyy-mm-dd, 중복 포함) */
  dates: string[];
  value: Period;
  onChange: (next: Period) => void;
  accent?: string;
}) {
  const [open, setOpen]     = useState(false);
  const [view, setView]     = useState<"months" | "days">("days");
  const [cursor, setCursor] = useState({ y: new Date().getFullYear(), m: new Date().getMonth() + 1 });
  const ref = useRef<HTMLDivElement>(null);

  // 년·월·일 접두어별 건수
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const raw of dates) {
      const d = (raw ?? "").slice(0, 10);
      if (!d) continue;
      for (const k of [d.slice(0, 4), d.slice(0, 7), d]) map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [dates]);
  const cnt = (k: string) => counts.get(k) ?? 0;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  function togglePicker() {
    if (open) { setOpen(false); return; }
    const [y, m] = (value ?? todayStr()).split("-");
    setCursor({ y: Number(y), m: m ? Number(m) : 1 });
    setView(value && value.length === 4 ? "months" : "days");
    setOpen(true);
  }

  function select(p: Period, close = true) {
    onChange(p);
    if (close) setOpen(false);
  }

  function moveCursor(delta: number) {
    if (view === "months") { setCursor((c) => ({ ...c, y: c.y + delta })); return; }
    setCursor((c) => {
      const t = new Date(c.y, c.m - 1 + delta, 1);
      return { y: t.getFullYear(), m: t.getMonth() + 1 };
    });
  }

  const today = todayStr();
  const isSet = value !== null;
  const ymKey = `${cursor.y}-${pad(cursor.m)}`;

  // 달력 칸: 앞쪽 빈칸 + 1일~말일
  const firstDow = new Date(cursor.y, cursor.m - 1, 1).getDay();
  const lastDay  = new Date(cursor.y, cursor.m, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: lastDay }, (_, i) => i + 1),
  ];

  const navBtn = "p-1.5 rounded-lg hover:bg-slate-100 transition-colors";

  return (
    <div className="flex items-center gap-2 flex-wrap px-4 py-3 rounded-2xl"
      style={{ border: "1px solid #E9EBEF", background: "#fff" }}>
      <div className="flex items-center gap-1.5 mr-1">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <span className="text-xs font-bold" style={{ color: "#64748B" }}>기간</span>
      </div>

      <div className="flex items-center gap-1" ref={ref}>
        <button onClick={() => value && onChange(shiftPeriod(value, -1))} disabled={!isSet}
          className={`${navBtn} disabled:opacity-30`} style={{ color: "#64748B" }} aria-label="이전 기간">
          <Chevron dir="left" />
        </button>

        <div className="relative">
          <button
            onClick={togglePicker}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all hover:opacity-80"
            style={{
              minWidth: 170,
              background: isSet ? `${accent}14` : "#F1F5F9",
              color: isSet ? accent : "#475569",
              border: `1px solid ${isSet ? `${accent}40` : "#E9EBEF"}`,
            }}>
            <span className="flex-1 text-left whitespace-nowrap">{periodLabel(value)}</span>
            <span style={{ opacity: 0.55 }}>{value ? cnt(value) : dates.length}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
              style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s", opacity: 0.6 }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {open && (
            <div className="absolute left-0 top-full mt-1.5 rounded-xl p-3 z-30"
              style={{ width: 288, background: "#fff", border: "1px solid #E9EBEF", boxShadow: "0 8px 24px rgba(15,23,42,0.12)" }}>
              {/* 머리: ‹ 2026년 10월 › — 제목을 누르면 월 선택으로 */}
              <div className="flex items-center justify-between mb-2">
                <button onClick={() => moveCursor(-1)} className={navBtn} style={{ color: "#64748B" }} aria-label="이전">
                  <Chevron dir="left" />
                </button>
                <button
                  onClick={() => setView(view === "days" ? "months" : "days")}
                  className="px-2 py-1 rounded-lg text-sm font-bold hover:bg-slate-100"
                  style={{ color: "#191F28" }}>
                  {view === "months" ? `${cursor.y}년` : `${cursor.y}년 ${cursor.m}월`}
                </button>
                <button onClick={() => moveCursor(1)} className={navBtn} style={{ color: "#64748B" }} aria-label="다음">
                  <Chevron dir="right" />
                </button>
              </div>

              {/* 년/월 전체 선택 */}
              {(() => {
                const key = view === "months" ? String(cursor.y) : ymKey;
                const label = view === "months" ? `${cursor.y}년 전체` : `${cursor.m}월 전체`;
                const active = value === key;
                return (
                  <button onClick={() => select(key)}
                    className="w-full flex items-center justify-between px-3 py-2 mb-2 rounded-lg text-xs font-bold transition-colors"
                    style={{ background: active ? accent : `${accent}10`, color: active ? "#fff" : accent }}>
                    <span>{label}</span>
                    <span style={{ opacity: 0.75 }}>{cnt(key)}건</span>
                  </button>
                );
              })()}

              {view === "months" ? (
                <div className="grid grid-cols-3 gap-1.5">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                    const key = `${cursor.y}-${pad(m)}`;
                    const c = cnt(key);
                    const active = value === key;
                    const isNow = key === today.slice(0, 7);
                    return (
                      <button key={m}
                        onClick={() => { select(key, false); setCursor({ y: cursor.y, m }); setView("days"); }}
                        className="flex flex-col items-center py-2 rounded-lg text-xs font-semibold transition-colors hover:bg-slate-50"
                        style={{
                          background: active ? accent : "transparent",
                          color: active ? "#fff" : c ? "#334155" : "#CBD5E1",
                          boxShadow: isNow && !active ? `inset 0 0 0 1px ${accent}60` : "none",
                        }}>
                        <span>{m}월</span>
                        <span className="text-[10px] mt-0.5" style={{ color: active ? "#fff" : c ? accent : "transparent", opacity: active ? 0.8 : 1 }}>
                          {c || "·"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-7 gap-0.5">
                  {WEEKDAYS.map((w, i) => (
                    <div key={w} className="text-center text-[10px] font-bold py-1"
                      style={{ color: i === 0 ? "#EF4444" : i === 6 ? "#3182F6" : "#94A3B8" }}>{w}</div>
                  ))}
                  {cells.map((d, i) => {
                    if (d === null) return <div key={`b${i}`} />;
                    const key = `${ymKey}-${pad(d)}`;
                    const c = cnt(key);
                    const active = value === key;
                    const dow = (firstDow + d - 1) % 7;
                    return (
                      <button key={key} onClick={() => select(key)}
                        className="flex flex-col items-center justify-center h-10 rounded-lg text-xs font-semibold transition-colors hover:bg-slate-50"
                        style={{
                          background: active ? accent : "transparent",
                          color: active ? "#fff" : !c ? "#CBD5E1" : dow === 0 ? "#EF4444" : "#334155",
                          boxShadow: key === today && !active ? `inset 0 0 0 1px ${accent}60` : "none",
                        }}>
                        <span>{d}</span>
                        <span className="text-[9px] leading-none mt-0.5 font-bold"
                          style={{ color: active ? "#fff" : accent, visibility: c ? "visible" : "hidden" }}>
                          {c}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: "1px solid #F1F5F9" }}>
                <button onClick={() => {
                    const t = new Date();
                    setCursor({ y: t.getFullYear(), m: t.getMonth() + 1 });
                    setView("days");
                  }}
                  className="px-2 py-1 rounded-lg text-xs font-semibold hover:bg-slate-100" style={{ color: "#64748B" }}>
                  오늘로 이동
                </button>
                <button onClick={() => select(null)}
                  className="px-2 py-1 rounded-lg text-xs font-semibold hover:bg-slate-100"
                  style={{ color: value === null ? accent : "#64748B" }}>
                  전체 기간 · {dates.length}건
                </button>
              </div>
            </div>
          )}
        </div>

        <button onClick={() => value && onChange(shiftPeriod(value, 1))} disabled={!isSet}
          className={`${navBtn} disabled:opacity-30`} style={{ color: "#64748B" }} aria-label="다음 기간">
          <Chevron dir="right" />
        </button>
      </div>

      {isSet && (
        <button onClick={() => onChange(null)}
          className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-semibold transition-colors hover:opacity-70"
          style={{ color: "#94A3B8" }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          초기화
        </button>
      )}
    </div>
  );
}
