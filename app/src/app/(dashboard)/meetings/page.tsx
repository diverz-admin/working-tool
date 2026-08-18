"use client";

/**
 * 정기 회의록 — 월간회의 / 주간회의.
 *
 * 프로젝트 리포트 안에 붙어 있던 화면을 독립 라우트로 뺐다.
 * 회의록은 리포트를 보다가 곁들여 적는 것이 아니라 회의 시간에 이 화면만 띄워놓고 쓰는 문서라,
 * 리포트의 팀·기간 필터와 상태를 공유할 이유가 없다. 필요한 필터(연·월·기준)만 여기서 직접 고른다.
 *
 * 필터는 칩을 늘어놓지 않고 드롭다운으로 둔다 — 월 12개를 칩으로 깔면 필터가 본문보다 커진다.
 */

import { useState } from "react";
import MeetingSection from "./MeetingSection";

const CRITERIA = [
  { value: "캠페인 시작날짜", label: "캠페인 시작일 기준" },
  { value: "계산서날짜",     label: "계산서 발행일 기준" },
  { value: "통장",           label: "입금 승인일 기준" },
];

const SELECT_STYLE: React.CSSProperties = {
  border: "1px solid #E5E8EB",
  color: "#191F28",
  background: "#fff",
  // 기본 화살표를 지우고 직접 그린다 — 브라우저마다 다른 화살표가 나오면 정렬이 깨진다
  appearance: "none",
  backgroundImage:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238B95A1' stroke-width='2.5' stroke-linecap='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 10px center",
  paddingRight: 30,
};

export default function MeetingsPage() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [criteria, setCriteria] = useState<string>("캠페인 시작날짜");

  const isThisMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 3 + i);

  /** 월 이동 — 연말·연초를 넘어가도 연도가 같이 따라간다 */
  function shift(delta: number) {
    const m = month + delta;
    if (m < 1)  { setYear(y => y - 1); setMonth(12); return; }
    if (m > 12) { setYear(y => y + 1); setMonth(1);  return; }
    setMonth(m);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "#191F28" }}>정기 회의록</h1>
        <p className="text-[13px] mt-1" style={{ color: "#6B7684" }}>
          매출 · 관리운영 · 영업 · 마케팅 네 축을 직전 회의와 비교해 다음 계획을 세웁니다
        </p>
      </div>

      {/* 필터 — 한 줄 */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => shift(-1)} aria-label="이전 달"
          className="w-8 h-8 flex items-center justify-center rounded-lg border transition-colors hover:bg-slate-50"
          style={{ borderColor: "#E5E8EB" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7684" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>

        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="h-8 pl-3 text-[13px] font-semibold rounded-lg outline-none focus:border-[#3182F6]" style={SELECT_STYLE}>
          {years.map(y => <option key={y} value={y}>{y}년</option>)}
        </select>

        <select value={month} onChange={e => setMonth(Number(e.target.value))}
          className="h-8 pl-3 text-[13px] font-semibold rounded-lg outline-none focus:border-[#3182F6]" style={SELECT_STYLE}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
        </select>

        <button onClick={() => shift(1)} aria-label="다음 달"
          className="w-8 h-8 flex items-center justify-center rounded-lg border transition-colors hover:bg-slate-50"
          style={{ borderColor: "#E5E8EB" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7684" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>

        {!isThisMonth && (
          <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth() + 1); }}
            className="h-8 px-3 rounded-lg text-[13px] font-semibold border transition-colors hover:bg-slate-50"
            style={{ borderColor: "#E5E8EB", color: "#6B7684" }}>
            이번 달
          </button>
        )}

        <span className="w-px h-5 mx-1" style={{ background: "#E5E8EB" }} />

        {/* 매출현황 자동 집계가 어떤 날짜를 매출로 볼지 정한다 */}
        <select value={criteria} onChange={e => setCriteria(e.target.value)}
          className="h-8 pl-3 text-[13px] rounded-lg outline-none focus:border-[#3182F6]" style={SELECT_STYLE}>
          {CRITERIA.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {/* 공유 이미지에 "무엇을 매출로 본 수치인지" 적어야 해서 라벨까지 함께 넘긴다 */}
      <MeetingSection year={year} month={month} criteria={criteria}
        criteriaLabel={CRITERIA.find(c => c.value === criteria)?.label ?? criteria} />
    </div>
  );
}
