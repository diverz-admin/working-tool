"use client";

import { useState, useEffect, useCallback } from "react";

interface PeriodStats {
  achieved: number;
  contracted: number;
  contractCount: number;
}

type Criteria = "공급가" | "캠페인 시작날짜" | "계산서날짜";

interface BannerData {
  annualTarget: number;
  quarterlyTarget: number;
  monthlyTarget: number;
  quarter: number;
  criteria: Criteria;
  annual: PeriodStats;
  quarterly: PeriodStats;
  monthly: PeriodStats;
}

const CRITERIA_OPTIONS: { value: Criteria; label: string; desc: string }[] = [
  { value: "공급가",          label: "공급가 기준",          desc: "캠페인 시작날짜 기준으로 공급가(부가세 제외) 합산" },
  { value: "캠페인 시작날짜", label: "캠페인 시작날짜 기준", desc: "캠페인 시작날짜 기준으로 합계금액(공급가+세액) 합산" },
  { value: "계산서날짜", label: "계산서날짜 기준", desc: "계산서 발행일 기준으로 합계금액(공급가+세액) 합산" },
];

const MONTH_NAMES = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

function wonFmt(n: number) {
  return n.toLocaleString() + "원";
}

function parseWon(s: string) {
  const n = parseInt(s.replace(/,/g, ""), 10);
  return isNaN(n) ? null : n;
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const w = max === 0 ? 0 : Math.min(100, (value / max) * 100);
  return (
    <div className="w-full h-1.5 rounded-full my-3" style={{ background: "#E5E8EB" }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${w}%`, background: "linear-gradient(90deg, #3182F6 0%, #2462D8 100%)" }}
      />
    </div>
  );
}

function PeriodCard({
  label, sublabel, achieved, target, contracted, contractCount,
}: {
  label: string; sublabel: string;
  achieved: number; target: number;
  contracted: number; contractCount: number;
}) {
  const pct = target > 0 ? Math.min(999.9, (achieved / target) * 100) : null;

  return (
    <div className="flex-1 rounded-2xl p-5" style={{ background: "#F8FAFC", border: "1px solid #E5E8EB" }}>
      <p className="text-xs font-medium mb-2" style={{ color: "#8B95A1" }}>
        {label}&nbsp;
        <span className="font-semibold" style={{ color: "#B0B8C1" }}>{sublabel}</span>
      </p>

      {pct !== null ? (
        <p className="font-black" style={{ color: "#3182F6", fontSize: "1.6rem", lineHeight: 1 }}>
          {pct.toFixed(1)}<span className="text-base font-bold">% 달성</span>
        </p>
      ) : (
        <p className="text-base font-bold" style={{ color: "#B0B8C1" }}>목표 미설정</p>
      )}

      <ProgressBar value={achieved} max={target} />

      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2 py-0.5 rounded text-xs font-semibold" style={{ background: "rgba(49,130,246,0.09)", color: "#3182F6" }}>달성</span>
          <span style={{ color: "#4E5968" }}>{wonFmt(achieved)}</span>
          <span style={{ color: "#B0B8C1" }}>/</span>
          <span style={{ color: "#8B95A1" }}>목표 {wonFmt(target)}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2 py-0.5 rounded text-xs font-semibold" style={{ background: "rgba(49,130,246,0.05)", color: "#2462D8" }}>수주</span>
          <span style={{ color: "#4E5968" }}>{wonFmt(contracted)}</span>
          <span style={{ color: "#B0B8C1" }}>/</span>
          <span style={{ color: "#8B95A1" }}>{contractCount}건</span>
        </div>
      </div>
    </div>
  );
}

export default function SalesTargetBanner({ team }: { team: string }) {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data,  setData]  = useState<BannerData | null>(null);
  const [loading, setLoading] = useState(true);

  const [showModal,         setShowModal]         = useState(false);
  const [showCriteriaModal, setShowCriteriaModal] = useState(false);
  const [targetInput,       setTargetInput]       = useState("");
  const [criteria,          setCriteria]          = useState<Criteria>("캠페인 시작날짜");
  const [saving,            setSaving]            = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/sales-targets?team=${encodeURIComponent(team)}&year=${year}&month=${month}`)
      .then((r) => r.json())
      .then((d: BannerData) => {
        setData(d);
        setCriteria(d.criteria ?? "캠페인 시작날짜");
        setTargetInput(d.annualTarget ? d.annualTarget.toLocaleString() : "");
      })
      .finally(() => setLoading(false));
  }, [team, year, month]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  function prevMonth() {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  }

  async function saveTarget() {
    const amount = parseWon(targetInput);
    if (amount === null) return;
    setSaving(true);
    await fetch("/api/sales-targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team, year, annualTarget: amount, criteria }),
    });
    setSaving(false);
    setShowModal(false);
    load();
  }

  async function saveCriteria(next: Criteria) {
    setCriteria(next);
    await fetch("/api/sales-targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team, year, annualTarget: data?.annualTarget ?? 0, criteria: next }),
    });
    setShowCriteriaModal(false);
    load();
  }

  const remaining = data ? Math.max(0, data.monthlyTarget - data.monthly.achieved) : 0;
  const parsedInput = parseWon(targetInput);

  return (
    <>
      <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E5E8EB" }}>
        {/* 헤더 행 */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold mb-3" style={{ color: "#191F28" }}>
              {MONTH_NAMES[month - 1]}, 매출 목표까지&nbsp;
              <span style={{ color: "#EF4444" }}>{remaining.toLocaleString()}원</span>
              &nbsp;남았어요 💪
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors hover:bg-gray-50"
                style={{ borderColor: "#E5E8EB", color: "#4E5968" }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
                {year}년 목표 설정
              </button>
              <button
                onClick={() => setShowCriteriaModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors hover:bg-gray-50"
                style={{ borderColor: "#E5E8EB", color: "#4E5968" }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
                목표 기준 설정
                <span className="px-1.5 py-0.5 rounded text-xs font-bold" style={{ background: "rgba(49,130,246,0.09)", color: "#3182F6" }}>
                  {criteria}
                </span>
              </button>
            </div>
          </div>

          {/* 연도/월 네비게이션 */}
          <div className="flex items-center gap-1.5">
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="px-3 py-1.5 text-sm rounded-xl border outline-none cursor-pointer"
              style={{ borderColor: "#E5E8EB", color: "#4E5968", background: "#F8FAFC" }}
            >
              {[2024, 2025, 2026, 2027, 2028].map((y) => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="px-3 py-1.5 text-sm rounded-xl border outline-none cursor-pointer"
              style={{ borderColor: "#E5E8EB", color: "#4E5968", background: "#F8FAFC" }}
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
              ))}
            </select>
            <button
              onClick={prevMonth}
              className="p-1.5 rounded-xl border hover:bg-gray-50 transition-colors"
              style={{ borderColor: "#E5E8EB" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8B95A1" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button
              onClick={nextMonth}
              className="p-1.5 rounded-xl border hover:bg-gray-50 transition-colors"
              style={{ borderColor: "#E5E8EB" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8B95A1" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>

        {/* 카드 3개 */}
        {loading ? (
          <div className="h-28 flex items-center justify-center text-sm" style={{ color: "#B0B8C1" }}>
            로딩 중...
          </div>
        ) : data ? (
          <div className="flex gap-4">
            <PeriodCard
              label="연간"   sublabel={`${year}년`}
              achieved={data.annual.achieved}    target={data.annualTarget}
              contracted={data.annual.contracted}    contractCount={data.annual.contractCount}
            />
            <PeriodCard
              label="분기"   sublabel={`${data.quarter}/4 분기`}
              achieved={data.quarterly.achieved} target={data.quarterlyTarget}
              contracted={data.quarterly.contracted} contractCount={data.quarterly.contractCount}
            />
            <PeriodCard
              label="월간"   sublabel={MONTH_NAMES[month - 1]}
              achieved={data.monthly.achieved}   target={data.monthlyTarget}
              contracted={data.monthly.contracted}   contractCount={data.monthly.contractCount}
            />
          </div>
        ) : null}
      </div>

      {/* 목표 기준 설정 모달 */}
      {showCriteriaModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCriteriaModal(false); }}
        >
          <div className="rounded-2xl p-6 w-[420px]" style={{ background: "#FFFFFF", boxShadow: "0 20px 60px rgba(0,0,0,0.12)" }}>
            <h3 className="text-base font-bold mb-1" style={{ color: "#191F28" }}>목표 기준 설정</h3>
            <p className="text-xs mb-5" style={{ color: "#8B95A1" }}>달성 금액 집계 기준을 선택하세요.</p>

            <div className="space-y-2.5">
              {CRITERIA_OPTIONS.map((opt) => {
                const isSelected = criteria === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => saveCriteria(opt.value)}
                    className="w-full flex items-start gap-3 px-4 py-3.5 rounded-xl border-2 text-left transition-all"
                    style={{
                      borderColor: isSelected ? "#3182F6" : "#E5E8EB",
                      background:  isSelected ? "rgba(49,130,246,0.05)" : "#F8FAFC",
                    }}
                  >
                    <span
                      className="mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                      style={{ borderColor: isSelected ? "#3182F6" : "#B0B8C1" }}
                    >
                      {isSelected && <span className="w-2 h-2 rounded-full" style={{ background: "#3182F6" }} />}
                    </span>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: isSelected ? "#191F28" : "#4E5968" }}>{opt.label}</p>
                      <p className="text-xs mt-0.5" style={{ color: "#8B95A1" }}>{opt.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end mt-5">
              <button
                onClick={() => setShowCriteriaModal(false)}
                className="px-4 py-2 text-sm rounded-xl border hover:bg-gray-50 transition-colors"
                style={{ borderColor: "#E5E8EB", color: "#6B7684" }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 목표 설정 모달 */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="rounded-2xl p-6 w-96" style={{ background: "#FFFFFF", boxShadow: "0 20px 60px rgba(0,0,0,0.12)" }}>
            <h3 className="text-base font-bold mb-1" style={{ color: "#191F28" }}>
              {year}년 연간 목표 설정
            </h3>
            <p className="text-xs mb-4" style={{ color: "#8B95A1" }}>{team}</p>

            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#6B7684" }}>
              연간 목표 금액 (원)
            </label>
            <input
              type="text"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              placeholder="예: 120,000,000"
              className="w-full px-3 py-2 text-sm rounded-xl border outline-none mb-2 focus:border-[#3182F6] transition-colors"
              style={{ borderColor: "#E5E8EB", color: "#191F28", background: "#F8FAFC" }}
            />
            {parsedInput !== null && parsedInput > 0 && (
              <p className="text-xs mb-4" style={{ color: "#8B95A1" }}>
                분기 목표&nbsp;
                <span className="font-semibold" style={{ color: "#4E5968" }}>
                  {Math.round(parsedInput / 4).toLocaleString()}원
                </span>
                &nbsp;·&nbsp;월간 목표&nbsp;
                <span className="font-semibold" style={{ color: "#4E5968" }}>
                  {Math.round(parsedInput / 12).toLocaleString()}원
                </span>
              </p>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm rounded-xl border hover:bg-gray-50 transition-colors"
                style={{ borderColor: "#E5E8EB", color: "#6B7684" }}
              >
                취소
              </button>
              <button
                onClick={saveTarget}
                disabled={saving || parsedInput === null}
                className="px-4 py-2 text-sm font-semibold rounded-xl text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: "#3182F6" }}
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
