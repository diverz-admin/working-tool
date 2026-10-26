"use client";

/**
 * 정기 회의록 — 월간회의 / 주간회의.
 *
 * 프로젝트 리포트 안에 붙어 있던 화면을 독립 라우트로 뺐다.
 * 회의록은 리포트를 보다가 곁들여 적는 것이 아니라 회의 시간에 이 화면만 띄워놓고 쓰는 문서라,
 * 리포트의 팀·기간 필터와 상태를 공유할 이유가 없다. 필요한 필터(연·월·기준)만 여기서 직접 고른다.
 *
 * 화면 구성: 맨 위 매출현황(자동 집계) → 달력. 달력 칸에 회의록 카드가 놓이고, 누르면 오른쪽에 작성 패널이 열린다.
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

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "#191F28" }}>정기 회의록</h1>
          <p className="text-[13px] mt-1" style={{ color: "#6B7684" }}>
            달력에서 주간회의 · 월간회의를 골라 작성합니다. 직전 회의 내용이 자동으로 이어집니다
          </p>
        </div>

        {/* 매출현황 자동 집계가 어떤 날짜를 매출로 볼지 정한다 */}
        <select value={criteria} onChange={e => setCriteria(e.target.value)}
          className="h-8 pl-3 text-[13px] rounded-lg outline-none focus:border-[#3182F6]" style={SELECT_STYLE}>
          {CRITERIA.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {/* 월 이동은 달력 머리말에서 한다 — 저장 안 된 내용 확인을 회의록 쪽이 쥐고 있어서다.
          공유 이미지에 "무엇을 매출로 본 수치인지" 적어야 해서 라벨까지 함께 넘긴다 */}
      <MeetingSection year={year} month={month}
        onMonthChange={(y, m) => { setYear(y); setMonth(m); }}
        criteria={criteria}
        criteriaLabel={CRITERIA.find(c => c.value === criteria)?.label ?? criteria} />
    </div>
  );
}
