"use client";

import { useMemo, useState } from "react";

/**
 * 월·날짜 필터.
 * 날짜는 칩을 전부 늘어놓지 않고 "최근 몇 개 + 달력"으로 보여준다 —
 * 날짜가 수십 개 쌓이면 칩 벽이 되어 원하는 날을 찾기 어렵기 때문.
 */

export type PeriodValue = { month: string | null; date: string | null };

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const RECENT_LIMIT = 5;

const pad = (n: number) => String(n).padStart(2, "0");
const toMonth = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const toDay   = (d: Date) => `${toMonth(d)}-${pad(d.getDate())}`;
const monthLabel = (m: string) => { const [y, mo] = m.split("-"); return `${y}년 ${parseInt(mo)}월`; };
const dayLabel   = (d: string) => {
  const [y, m, day] = d.split("-");
  const w = WEEKDAYS[new Date(Number(y), Number(m) - 1, Number(day)).getDay()];
  return `${m}.${day}(${w})`;
};
const shiftMonth = (m: string, delta: number) => {
  const [y, mo] = m.split("-").map(Number);
  return toMonth(new Date(y, mo - 1 + delta, 1));
};

export default function PeriodFilter({
  dates, month, date, onChange, accent = "#3182F6",
}: {
  /** 항목별 날짜 목록(yyyy-mm-dd, 중복 포함) */
  dates: string[];
  month: string | null;
  date: string | null;
  onChange: (next: PeriodValue) => void;
  accent?: string;
}) {
  const [open, setOpen] = useState(false);
  // 달력이 보고 있는 월. null이면 선택된 월 → 최신 데이터 월 순으로 따라간다.
  const [viewOverride, setViewOverride] = useState<string | null>(null);

  const countByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of dates) if (d) map.set(d, (map.get(d) ?? 0) + 1);
    return map;
  }, [dates]);

  const months = useMemo(() => {
    const map = new Map<string, number>();
    for (const [d, c] of countByDate) {
      const m = d.slice(0, 7);
      map.set(m, (map.get(m) ?? 0) + c);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [countByDate]);

  const scopedDates = useMemo(() =>
    Array.from(countByDate.keys())
      .filter((d) => month === null || d.startsWith(month))
      .sort((a, b) => b.localeCompare(a)),
    [countByDate, month]);

  const total = dates.length;
  const today = toDay(new Date());
  const currentMonth = today.slice(0, 7);

  const view = viewOverride ?? month ?? months[0]?.[0] ?? currentMonth;
  const minMonth = months.length ? months[months.length - 1][0] : currentMonth;
  const maxMonth = months.length && months[0][0] > currentMonth ? months[0][0] : currentMonth;

  const recent = scopedDates.slice(0, RECENT_LIMIT);
  const selectedOutsideRecent = date !== null && !recent.includes(date);

  const pickMonth = (m: string | null) => { setViewOverride(m); onChange({ month: m, date: null }); };
  const pickDate  = (d: string | null) => {
    if (d === null) { onChange({ month, date: null }); return; }
    setViewOverride(d.slice(0, 7));
    onChange({ month: d.slice(0, 7), date: d });
  };

  if (months.length === 0) return null;

  /* 달력 셀 */
  const [vy, vm] = view.split("-").map(Number);
  const leading = new Date(vy, vm - 1, 1).getDay();
  const daysInMonth = new Date(vy, vm, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const chip = (active: boolean) => ({
    background: active ? accent : "transparent",
    color: active ? "#fff" : "#64748B",
    border: `1px solid ${active ? accent : "#E9EBEF"}`,
  });

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #E9EBEF", background: "#fff" }}>
      {/* 월 */}
      <div className="flex items-center gap-2 flex-wrap px-4 py-3" style={{ background: "#F8FAFC" }}>
        <div className="flex items-center gap-1.5 mr-1">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <span className="text-xs font-bold" style={{ color: "#64748B" }}>월</span>
        </div>
        <button
          onClick={() => pickMonth(null)}
          className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
          style={{ background: month === null ? "#191F28" : "#ECEEF2", color: month === null ? "#fff" : "#475569" }}>
          전체 <span style={{ opacity: 0.55 }}>{total}</span>
        </button>
        {months.map(([m, count]) => {
          const isActive = month === m;
          return (
            <button key={m}
              onClick={() => pickMonth(isActive ? null : m)}
              className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
              style={{ background: isActive ? "#191F28" : "#ECEEF2", color: isActive ? "#fff" : "#475569" }}>
              {monthLabel(m)} <span style={{ opacity: 0.55 }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* 날짜 */}
      <div className="px-4 py-2.5" style={{ borderTop: "1px solid #F1F5F9" }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold mr-1" style={{ color: "#94A3B8" }}>날짜</span>

          <button onClick={() => pickDate(null)}
            className="text-xs font-semibold px-2.5 py-1 rounded-full transition-all"
            style={date === null
              ? { background: `${accent}1F`, color: accent, border: `1px solid ${accent}4D` }
              : { background: "transparent", color: "#94A3B8", border: "1px solid #E9EBEF" }}>
            전체
          </button>

          {recent.map((d) => (
            <button key={d} onClick={() => pickDate(date === d ? null : d)}
              className="text-xs font-semibold px-2.5 py-1 rounded-full transition-all hover:opacity-80"
              style={chip(date === d)}>
              {dayLabel(d)} <span style={{ opacity: 0.65 }}>{countByDate.get(d)}</span>
            </button>
          ))}

          {selectedOutsideRecent && (
            <button onClick={() => pickDate(null)}
              className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full transition-all hover:opacity-80"
              style={chip(true)}>
              {dayLabel(date)} <span style={{ opacity: 0.65 }}>{countByDate.get(date) ?? 0}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}

          <div className="flex items-center gap-1.5 ml-auto">
            {countByDate.has(today) && (
              <button onClick={() => pickDate(date === today ? null : today)}
                className="text-xs font-semibold px-2.5 py-1 rounded-full transition-all hover:opacity-80"
                style={chip(date === today)}>
                오늘 <span style={{ opacity: 0.65 }}>{countByDate.get(today)}</span>
              </button>
            )}
            <button onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full transition-all hover:opacity-80"
              style={{ background: open ? "#191F28" : "#ECEEF2", color: open ? "#fff" : "#475569" }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              달력
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
                style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
          </div>
        </div>

        {open && (
          <div className="mt-3 pt-3" style={{ borderTop: "1px dashed #EEF1F5" }}>
            <div className="flex items-center gap-2 mb-2" style={{ maxWidth: 336 }}>
              <button onClick={() => setViewOverride(shiftMonth(view, -1))} disabled={view <= minMonth}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                style={{ background: "#F1F5F9", color: view <= minMonth ? "#CBD5E1" : "#475569", cursor: view <= minMonth ? "default" : "pointer" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <span className="flex-1 text-center text-sm font-bold" style={{ color: "#191F28" }}>{monthLabel(view)}</span>
              <button onClick={() => setViewOverride(shiftMonth(view, 1))} disabled={view >= maxMonth}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                style={{ background: "#F1F5F9", color: view >= maxMonth ? "#CBD5E1" : "#475569", cursor: view >= maxMonth ? "default" : "pointer" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1" style={{ maxWidth: 336 }}>
              {WEEKDAYS.map((w, i) => (
                <div key={w} className="text-center text-[11px] font-bold py-1"
                  style={{ color: i === 0 ? "#F87171" : i === 6 ? "#60A5FA" : "#94A3B8" }}>{w}</div>
              ))}
              {cells.map((day, idx) => {
                if (day === null) return <div key={`e${idx}`} />;
                const iso = `${view}-${pad(day)}`;
                const count = countByDate.get(iso) ?? 0;
                const isSel = date === iso;
                const isToday = iso === today;
                return (
                  <button key={iso} disabled={count === 0}
                    onClick={() => pickDate(isSel ? null : iso)}
                    className="h-11 rounded-lg flex flex-col items-center justify-center transition-all"
                    style={{
                      background: isSel ? accent : count ? "#F8FAFC" : "transparent",
                      color: isSel ? "#fff" : count ? "#191F28" : "#D8DEE6",
                      border: `1px solid ${isSel ? accent : count ? "#E9EBEF" : "transparent"}`,
                      boxShadow: isToday && !isSel ? `inset 0 0 0 1.5px ${accent}66` : "none",
                      cursor: count ? "pointer" : "default",
                    }}>
                    <span className="text-xs font-bold leading-none">{day}</span>
                    {count > 0 && (
                      <span className="text-[10px] font-semibold leading-none mt-0.5"
                        style={{ color: isSel ? "#fff" : accent, opacity: isSel ? 0.85 : 0.7 }}>{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
