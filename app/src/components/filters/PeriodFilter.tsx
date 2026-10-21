"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * 월·날짜 필터 (드롭다운).
 * 날짜가 수십 개 쌓여도 칩이 늘어나지 않도록 목록을 드롭다운 안에 담는다.
 */

export type PeriodValue = { month: string | null; date: string | null };

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const pad = (n: number) => String(n).padStart(2, "0");
const todayStr = () => { const t = new Date(); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; };
const monthLabel = (m: string) => { const [y, mo] = m.split("-"); return `${y}년 ${parseInt(mo)}월`; };
const dayLabel = (d: string) => {
  const [y, m, day] = d.split("-");
  const w = WEEKDAYS[new Date(Number(y), Number(m) - 1, Number(day)).getDay()];
  return `${y}.${m}.${day} (${w})`;
};

type Option = { value: string | null; label: string; count: number; hint?: string };

function Dropdown({
  options, value, onSelect, accent, minWidth = 150, panelWidth = 210,
}: {
  options: Option[];
  value: string | null;
  onSelect: (v: string | null) => void;
  accent: string;
  minWidth?: number;
  panelWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value) ?? options[0];
  const isSet = value !== null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all hover:opacity-80"
        style={{
          minWidth,
          background: isSet ? `${accent}14` : "#F1F5F9",
          color: isSet ? accent : "#475569",
          border: `1px solid ${isSet ? `${accent}40` : "#E9EBEF"}`,
        }}>
        <span className="flex-1 text-left whitespace-nowrap">{current?.label}</span>
        <span style={{ opacity: 0.55 }}>{current?.count}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s", opacity: 0.6 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 rounded-xl overflow-y-auto py-1 z-30"
          style={{ width: panelWidth, maxHeight: 300, background: "#fff", border: "1px solid #E9EBEF", boxShadow: "0 8px 24px rgba(15,23,42,0.12)" }}>
          {options.map((o) => {
            const isActive = o.value === value;
            return (
              <button key={o.value ?? "all"}
                onClick={() => { onSelect(o.value); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-left transition-colors hover:bg-slate-50"
                style={{ background: isActive ? `${accent}12` : "transparent", color: isActive ? accent : "#334155" }}>
                <span className="flex-1 whitespace-nowrap">{o.label}</span>
                {o.hint && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{ background: `${accent}1A`, color: accent }}>{o.hint}</span>
                )}
                <span className="font-bold" style={{ color: isActive ? accent : "#94A3B8" }}>{o.count}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
  const countByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of dates) if (d) map.set(d, (map.get(d) ?? 0) + 1);
    return map;
  }, [dates]);

  const monthOptions = useMemo<Option[]>(() => {
    const map = new Map<string, number>();
    for (const [d, c] of countByDate) {
      const m = d.slice(0, 7);
      map.set(m, (map.get(m) ?? 0) + c);
    }
    return [
      { value: null, label: "전체 기간", count: dates.length },
      ...Array.from(map.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([m, count]) => ({ value: m, label: monthLabel(m), count })),
    ];
  }, [countByDate, dates.length]);

  const dateOptions = useMemo<Option[]>(() => {
    const today = todayStr();
    const scoped = Array.from(countByDate.entries())
      .filter(([d]) => month === null || d.startsWith(month))
      .sort((a, b) => b[0].localeCompare(a[0]));
    return [
      {
        value: null,
        label: month ? `${monthLabel(month)} 전체` : "전체 날짜",
        count: scoped.reduce((s, [, c]) => s + c, 0),
      },
      ...scoped.map(([d, count]) => ({
        value: d, label: dayLabel(d), count, hint: d === today ? "오늘" : undefined,
      })),
    ];
  }, [countByDate, month]);

  if (monthOptions.length <= 1) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap px-4 py-3 rounded-2xl"
      style={{ border: "1px solid #E9EBEF", background: "#fff" }}>
      <div className="flex items-center gap-1.5 mr-1">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <span className="text-xs font-bold" style={{ color: "#64748B" }}>기간</span>
      </div>

      <Dropdown
        options={monthOptions}
        value={month}
        onSelect={(m) => onChange({ month: m, date: null })}
        accent={accent}
      />
      <Dropdown
        options={dateOptions}
        value={date}
        onSelect={(d) => onChange({ month: d ? d.slice(0, 7) : month, date: d })}
        accent={accent}
        minWidth={170}
        panelWidth={230}
      />

      {(month !== null || date !== null) && (
        <button onClick={() => onChange({ month: null, date: null })}
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
