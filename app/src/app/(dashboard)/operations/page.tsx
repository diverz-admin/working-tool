"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
  PieChart, Pie, Cell,
} from "recharts";

// ─── 상수 ────────────────────────────────────────────────

const MONTHS_SHORT = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

const SGA_CATEGORIES = [
  "급여","복리후생비","지급수수료","광고선전비",
  "도서인쇄비","임차료","통신비","직접매입(상품)",
  "판매수수료","외주용역비","기타 영업비용",
] as const;

const TEAM_COLORS: Record<string, string> = {
  "영업 1팀": "#6366F1",
  "영업 2팀": "#10B981",
};

// ─── 유틸 ────────────────────────────────────────────────

function sumN(arr: (number | null | undefined)[]) {
  return arr.reduce<number>((a, b) => a + (b ?? 0), 0);
}
function wonFmt(n: number) {
  if (n === 0) return "₩0";
  return "₩" + n.toLocaleString();
}
function wonFull(n: number) {
  return n === 0 ? "₩0" : "₩" + n.toLocaleString();
}

// ─── 링크 카드 래퍼 ──────────────────────────────────────

function SectionCard({
  title, href, children, accentColor = "#3182F6",
}: {
  title: string; href: string; children: React.ReactNode; accentColor?: string;
}) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E9EBEF" }}>
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #F1F5F9" }}>
        <h2 className="text-sm font-bold" style={{ color: "#191F28" }}>{title}</h2>
        <Link href={href}
          className="flex items-center gap-1 text-xs font-semibold transition-opacity hover:opacity-70"
          style={{ color: accentColor }}>
          자세히 보기
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </Link>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function MetricBlock({
  label, value, sub, color = "#191F28",
}: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div>
      <p className="text-xs font-semibold mb-1" style={{ color: "#94A3B8" }}>{label}</p>
      <p className="text-xl font-black" style={{ color }}>{value}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: "#B0B8C1" }}>{sub}</p>}
    </div>
  );
}

// ─── 커스텀 툴팁 ─────────────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: { value: number; name: string }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: "#191F28", border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.25)" }}>
      <p className="text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.6)" }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-sm font-bold" style={{ color: "#FFFFFF" }}>
          {wonFull(p.value)}
        </p>
      ))}
    </div>
  );
}

// ─── 메인 ────────────────────────────────────────────────

export default function OperationsDashboard() {
  const now   = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const curMonth = now.getMonth() + 1;

  // ── 데이터 ──
  interface TeamRevenue { team: string; persons: { person: string; monthly: number[] }[] }
  const [annualTeams,  setAnnualTeams]  = useState<TeamRevenue[]>([]);
  const [annualOther,  setAnnualOther]  = useState<number[]>(new Array(12).fill(0));
  const [annualCosts,  setAnnualCosts]  = useState<{ category: string; item: string; month: number; amount: number }[]>([]);
  const [monthRevRows,  setMonthRevRows]  = useState<{ total: number | null; supplyPrice: number | null; tax: number | null; assignedTeam: string | null }[]>([]);
  const [monthCostRows, setMonthCostRows] = useState<{ total: number | null; supplyPrice: number | null; assignedTeam: string | null }[]>([]);
  const [loading,      setLoading]      = useState(true);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setLoading(true);
    fetch(`/api/operations/dashboard?year=${year}&month=${curMonth}`)
      .then(r => r.json())
      .then(({ annualTeams, annualOther, annualCosts: costs, monthRevRows, monthCostRows }) => {
        setAnnualTeams(annualTeams ?? []);
        setAnnualOther(annualOther ?? new Array(12).fill(0));
        setAnnualCosts(costs ?? []);
        setMonthRevRows(monthRevRows ?? []);
        setMonthCostRows(monthCostRows ?? []);
      })
      .finally(() => setLoading(false));
  }, [year, curMonth]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── 연간 집계 ──
  function annualRevByMonth(m: number) {
    return annualTeams.reduce((s, t) => s + t.persons.reduce((ps, p) => ps + (p.monthly[m] ?? 0), 0), 0)
      + (annualOther[m] ?? 0);
  }
  function annualSgaByMonth(m: number) {
    return sumN(SGA_CATEGORIES
      .filter(c => c !== "직접매입(상품)")
      .map(cat => annualCosts.find(r => r.month === m+1 && r.category === cat && r.item === "합계")?.amount ?? 0)
    );
  }
  function annualDirectByMonth(m: number) {
    return annualCosts.find(r => r.month === m+1 && r.category === "직접매입(상품)" && r.item === "합계")?.amount ?? 0;
  }
  function annualExpenseByMonth(m: number) {
    return annualSgaByMonth(m) + annualDirectByMonth(m);
  }

  const annualRevTotal     = sumN(Array.from({length:12}, (_,m) => annualRevByMonth(m)));
  const annualSgaTotal     = sumN(Array.from({length:12}, (_,m) => annualSgaByMonth(m)));
  const annualExpenseTotal = sumN(Array.from({length:12}, (_,m) => annualExpenseByMonth(m)));
  const annualProfit       = annualRevTotal - annualExpenseTotal;
  const ytdMonth        = Math.min(curMonth, 12);
  const ytdRev          = sumN(Array.from({length: ytdMonth}, (_,m) => annualRevByMonth(m)));

  // ── 월간 집계 ──
  const monthRevTotal  = sumN(monthRevRows.map(r => r.total));
  const monthRevTax    = sumN(monthRevRows.map(r => r.tax));
  const monthDirect    = sumN(monthCostRows.map(r => r.total));
  const monthSga       = sumN(SGA_CATEGORIES
    .filter(c => c !== "직접매입(상품)")
    .map(cat => annualCosts.find(r => r.month === curMonth && r.category === cat && r.item === "합계")?.amount ?? 0)
  );
  const monthExpense   = monthDirect + monthSga;
  const monthProfit    = monthRevTotal - monthExpense;

  // ── 월간 파이차트 데이터 (가장 최근 데이터 있는 달 기준) ──
  const PIE_PALETTE = ["#6366F1","#8B5CF6","#A78BFA","#EC4899","#F97316","#EAB308","#84CC16","#14B8A6","#06B6D4","#60A5FA","#94A3B8"];
  const pieMonthIdx = (() => {
    for (let m = Math.min(curMonth, 12) - 1; m >= 0; m--) {
      if (annualRevByMonth(m) > 0) return m;
    }
    return -1;
  })();
  const pieMonth = pieMonthIdx + 1;
  const pieMonthRev = pieMonthIdx >= 0 ? annualRevByMonth(pieMonthIdx) : 0;
  const monthlyPieData: { name: string; value: number; color: string }[] = [];
  if (pieMonthIdx >= 0) {
    let _pieColorIdx = 0;
    for (const cat of SGA_CATEGORIES) {
      const val = annualCosts.find(r => r.month === pieMonth && r.category === cat && r.item === "합계")?.amount ?? 0;
      if (val > 0) monthlyPieData.push({ name: cat, value: val, color: PIE_PALETTE[_pieColorIdx++ % PIE_PALETTE.length] });
    }
    const expenseForMonth = sumN(SGA_CATEGORIES
      .map(cat => annualCosts.find(r => r.month === pieMonth && r.category === cat && r.item === "합계")?.amount ?? 0)
    );
    const profitForMonth = pieMonthRev - expenseForMonth;
    if (profitForMonth > 0) monthlyPieData.push({ name: "이익", value: profitForMonth, color: "#10B981" });
  }
  const monthlyPieTotal = monthlyPieData.reduce((s, d) => s + d.value, 0);

  // ── 팀별 이번달 ──
  const TEAMS_LIST = ["영업 1팀", "영업 2팀"];

  interface TeamStats { rev: number; cost: number; profit: number }

  const teamStats = new Map<string, TeamStats>();
  for (const t of TEAMS_LIST) {
    const rev  = sumN(monthRevRows .filter(r => r.assignedTeam === t).map(r => r.total));
    const cost = sumN(monthCostRows.filter(r => r.assignedTeam === t).map(r => r.total));
    teamStats.set(t, { rev, cost, profit: rev - cost });
  }

  // ── 차트 데이터 ──
  const barData = MONTHS_SHORT.map((label, m) => ({
    label,
    매출: annualRevByMonth(m),
    지출: annualExpenseByMonth(m),
  }));
  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "#191F28" }}>경영관리 대시보드</h1>
          <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>연간·월간·팀별 손익 현황을 한눈에 확인합니다.</p>
        </div>
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="px-3 py-1.5 text-sm rounded-lg border outline-none"
          style={{ borderColor:"#E9EBEF", color:"#475569", background:"#F8FAFC" }}>
          {[2023,2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}년</option>)}
        </select>
      </div>

      {loading ? (
        <div className="py-40 text-center text-sm" style={{ color:"#CBD5E1" }}>불러오는 중...</div>
      ) : (
        <>
          {/* ── 연간 손익관리 ── */}
          <SectionCard title={`${year}년 연간 손익관리`} href="/operations/annual">
            <div className="space-y-6">
              {/* 핵심 지표 */}
              <div className="grid grid-cols-4 gap-5">
                <MetricBlock
                  label="연간 매출"
                  value={wonFmt(annualRevTotal)}
                  sub={wonFull(annualRevTotal)}
                  color="#3182F6"
                />
                <MetricBlock
                  label="연간 지출"
                  value={wonFmt(annualExpenseTotal)}
                  sub={wonFull(annualExpenseTotal)}
                  color="#6366F1"
                />
                <MetricBlock
                  label="연간 영업이익"
                  value={wonFmt(annualProfit)}
                  sub={wonFull(annualProfit)}
                  color={annualProfit >= 0 ? "#10B981" : "#EF4444"}
                />
                <div>
                  <p className="text-xs font-semibold mb-1" style={{ color:"#94A3B8" }}>연초 대비 진행률</p>
                  <p className="text-xl font-black" style={{ color:"#F59E0B" }}>
                    {annualRevTotal > 0 ? `${Math.round((ytdRev / annualRevTotal) * 100)}%` : "—"}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color:"#B0B8C1" }}>
                    {ytdMonth}개월 / 12개월
                  </p>
                </div>
              </div>

              {/* 월별 바 차트 */}
              <div>
                <p className="text-xs font-semibold mb-3" style={{ color:"#64748B" }}>월별 매출 / 지출 현황</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={barData} barGap={2} barCategoryGap="25%">
                    <XAxis dataKey="label" tick={{ fontSize:10, fill:"#94A3B8" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize:9, fill:"#94A3B8" }} axisLine={false} tickLine={false} width={48}
                      tickFormatter={v => `₩${Number(v).toLocaleString()}`} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill:"rgba(49,130,246,0.04)" }} />
                    <ReferenceLine y={0} stroke="#E9EBEF" />
                    <Bar dataKey="매출" fill="#3182F6" radius={[3,3,0,0]} maxBarSize={28} />
                    <Bar dataKey="지출" fill="#6366F1" radius={[3,3,0,0]} maxBarSize={28} opacity={0.7} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-4 mt-1">
                  {[["매출","#3182F6"],["지출","#6366F1"]].map(([label, color]) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
                      <span className="text-xs" style={{ color:"#94A3B8" }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>

          {/* ── 월간 손익 구성 파이차트 ── */}
          {monthlyPieData.length > 0 && (
            <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E9EBEF" }}>
              <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #F1F5F9" }}>
                <div>
                  <h2 className="text-sm font-bold" style={{ color: "#191F28" }}>
                    {year}년 {pieMonth}월 손익 구성 비율
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>
                    {pieMonth}월 매출 {wonFmt(pieMonthRev)} 기준 · 지출 세부 항목별 비율
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1.5" style={{ color: "#64748B" }}>
                    <span className="w-3 h-3 rounded-sm" style={{ background: "#10B981" }} />
                    이익 {monthlyPieTotal > 0 ? `${(((monthlyPieData.find(d=>d.name==="이익")?.value??0) / monthlyPieTotal) * 100).toFixed(1)}%` : "—"}
                  </span>
                  <span className="flex items-center gap-1.5" style={{ color: "#64748B" }}>
                    <span className="w-3 h-3 rounded-sm" style={{ background: "#6366F1" }} />
                    지출 {monthlyPieTotal > 0 ? `${(((monthlyPieTotal - (monthlyPieData.find(d=>d.name==="이익")?.value??0)) / monthlyPieTotal) * 100).toFixed(1)}%` : "—"}
                  </span>
                </div>
              </div>
              <div className="p-6 flex gap-10 items-center">
                {/* 도넛 차트 */}
                <div className="shrink-0">
                  <ResponsiveContainer width={220} height={220}>
                    <PieChart>
                      <Pie
                        data={monthlyPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={62}
                        outerRadius={100}
                        dataKey="value"
                        startAngle={90}
                        endAngle={-270}
                        strokeWidth={2}
                        stroke="#FFFFFF"
                      >
                        {monthlyPieData.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: unknown, name: unknown) => [
                          `${monthlyPieTotal > 0 ? (((value as number) / monthlyPieTotal) * 100).toFixed(1) : 0}%  (${wonFmt(value as number)})`,
                          name as string,
                        ]}
                        contentStyle={{
                          background: "#191F28",
                          border: "none",
                          borderRadius: "10px",
                          fontSize: "12px",
                          color: "#fff",
                          boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
                        }}
                        itemStyle={{ color: "#fff" }}
                        labelStyle={{ color: "rgba(255,255,255,0.6)", marginBottom: 4 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* 세부 항목 범례 */}
                <div className="flex-1 grid grid-cols-2 gap-x-8 gap-y-3">
                  {monthlyPieData.map((item) => {
                    const pct = monthlyPieTotal > 0 ? ((item.value / monthlyPieTotal) * 100) : 0;
                    const isProfit = item.name === "이익";
                    return (
                      <div key={item.name}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: item.color }} />
                            <span className="text-xs font-medium" style={{ color: "#475569" }}>{item.name}</span>
                          </span>
                          <span className="text-xs font-bold ml-2" style={{ color: isProfit ? "#10B981" : "#191F28" }}>
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full" style={{ background: "#F1F5F9" }}>
                          <div
                            className="h-1.5 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(pct, 100)}%`, background: item.color }}
                          />
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>{wonFmt(item.value)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── 하단 두 카드 ── */}
          <div className="grid grid-cols-2 gap-5">

            {/* 이번달 손익 */}
            <SectionCard
              title={`${year}년 ${curMonth}월 손익관리`}
              href="/operations/monthly"
              accentColor="#6366F1"
            >
              <div className="space-y-5">
                {/* 매출/지출/이익 */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl p-3.5" style={{ background:"rgba(49,130,246,0.06)", border:"1px solid rgba(49,130,246,0.15)" }}>
                    <p className="text-xs font-semibold mb-1" style={{ color:"#3182F6" }}>총 매출</p>
                    <p className="text-base font-black" style={{ color:"#3182F6" }}>{wonFmt(monthRevTotal)}</p>
                    <p className="text-xs mt-0.5" style={{ color:"rgba(49,130,246,0.6)" }}>부가세 {wonFmt(monthRevTax)}</p>
                  </div>
                  <div className="rounded-xl p-3.5" style={{ background:"rgba(99,102,241,0.06)", border:"1px solid rgba(99,102,241,0.15)" }}>
                    <p className="text-xs font-semibold mb-1" style={{ color:"#6366F1" }}>총 지출</p>
                    <p className="text-base font-black" style={{ color:"#6366F1" }}>{wonFmt(monthExpense)}</p>
                    <p className="text-xs mt-0.5" style={{ color:"rgba(99,102,241,0.6)" }}>판관비 {wonFmt(monthSga)}</p>
                  </div>
                  <div className="rounded-xl p-3.5" style={{
                    background: monthProfit >= 0 ? "rgba(16,185,129,0.06)" : "rgba(239,68,68,0.06)",
                    border: `1px solid ${monthProfit >= 0 ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)"}`,
                  }}>
                    <p className="text-xs font-semibold mb-1" style={{ color: monthProfit >= 0 ? "#10B981" : "#EF4444" }}>영업이익</p>
                    <p className="text-base font-black" style={{ color: monthProfit >= 0 ? "#10B981" : "#EF4444" }}>{wonFmt(monthProfit)}</p>
                    <p className="text-xs mt-0.5" style={{ color: monthProfit >= 0 ? "rgba(16,185,129,0.6)" : "rgba(239,68,68,0.6)" }}>
                      {monthRevTotal > 0 ? `이익률 ${Math.round((monthProfit / monthRevTotal) * 100)}%` : "데이터 없음"}
                    </p>
                  </div>
                </div>

                {/* 지출 구성 바 */}
                {monthExpense > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-semibold" style={{ color:"#64748B" }}>지출 구성</p>
                      <p className="text-xs" style={{ color:"#94A3B8" }}>{wonFull(monthExpense)}</p>
                    </div>
                    <div className="h-2.5 rounded-full overflow-hidden flex" style={{ background:"#F1F5F9" }}>
                      {monthExpense > 0 && (
                        <>
                          <div style={{ width:`${(monthDirect/monthExpense)*100}%`, background:"#6366F1", transition:"width 0.5s" }} />
                          <div style={{ width:`${(monthSga/monthExpense)*100}%`, background:"#8B5CF6", transition:"width 0.5s" }} />
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1.5">
                      {[["직접매입", monthDirect, "#6366F1"], ["판관비", monthSga, "#8B5CF6"]].map(([label, val, color]) => (
                        <div key={String(label)} className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ background: String(color) }} />
                          <span className="text-xs" style={{ color:"#94A3B8" }}>{label}</span>
                          <span className="text-xs font-semibold" style={{ color:"#64748B" }}>{wonFmt(Number(val))}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 매출 건수 */}
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background:"#F8FAFC", border:"1px solid #E9EBEF" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <span className="text-xs" style={{ color:"#64748B" }}>이번달 매출 건수</span>
                  <span className="text-xs font-bold ml-auto" style={{ color:"#191F28" }}>{monthRevRows.length}건</span>
                </div>
              </div>
            </SectionCard>

            {/* 팀별 손익현황 */}
            <SectionCard
              title={`${year}년 ${curMonth}월 팀별 손익현황`}
              href="/operations/team"
              accentColor="#10B981"
            >
              <div className="space-y-4">
                {/* 팀별 매출·매입·손익 그리드 */}
                <div className="grid grid-cols-2 gap-3">
                  {TEAMS_LIST.map(team => {
                    const stats = teamStats.get(team) ?? { rev: 0, cost: 0, profit: 0 };
                    const color = TEAM_COLORS[team] ?? "#94A3B8";
                    const profitColor = stats.profit >= 0 ? "#10B981" : "#EF4444";
                    return (
                      <div key={team} className="rounded-2xl overflow-hidden"
                        style={{ border: `1px solid ${color}30` }}>
                        {/* 팀 헤더 */}
                        <div className="px-4 py-3 flex items-center gap-2"
                          style={{ background: `${color}10`, borderBottom: `1px solid ${color}20` }}>
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                          <span className="text-sm font-bold" style={{ color }}>{team}</span>
                        </div>

                        {/* 매출·매입·손익 행 */}
                        <div className="divide-y" style={{ borderColor: "#F1F5F9" }}>
                          {[
                            { label: "매출", value: stats.rev,    labelColor: "#3182F6", bgKey: "rev" },
                            { label: "매입", value: stats.cost,   labelColor: "#64748B", bgKey: "cost" },
                            { label: "손익", value: stats.profit, labelColor: profitColor, bgKey: "profit" },
                          ].map(({ label, value, labelColor }) => (
                            <div key={label} className="flex items-center justify-between px-4 py-2.5">
                              <span className="text-xs font-semibold w-8" style={{ color: "#94A3B8" }}>{label}</span>
                              <span className="text-sm font-bold tabular-nums"
                                style={{ color: label === "손익" ? profitColor : value > 0 ? "#191F28" : "#CBD5E1" }}>
                                {value !== 0 ? wonFull(value) : "—"}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* 이익률 */}
                        <div className="px-4 py-2.5" style={{ borderTop: `1px solid ${color}15`, background: `${color}06` }}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs" style={{ color: "#94A3B8" }}>손익률</span>
                            <span className="text-xs font-bold" style={{ color: profitColor }}>
                              {stats.rev > 0 ? `${((stats.profit / stats.rev) * 100).toFixed(1)}%` : "—"}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#E9EBEF" }}>
                            {stats.rev > 0 && (
                              <div style={{
                                width: `${Math.min(Math.abs((stats.profit / stats.rev) * 100), 100)}%`,
                                height: "100%",
                                background: profitColor,
                                borderRadius: "9999px",
                                transition: "width 0.5s ease",
                              }} />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 전체 합계 행 */}
                {(() => {
                  const totalRev    = sumN(TEAMS_LIST.map(t => teamStats.get(t)?.rev    ?? 0));
                  const totalCost   = sumN(TEAMS_LIST.map(t => teamStats.get(t)?.cost   ?? 0));
                  const totalProfit = sumN(TEAMS_LIST.map(t => teamStats.get(t)?.profit ?? 0));
                  const profitColor = totalProfit >= 0 ? "#10B981" : "#EF4444";
                  return (
                    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E9EBEF" }}>
                      <div className="grid grid-cols-4 divide-x" style={{ borderColor: "#E9EBEF" }}>
                        {[
                          { label: "구분",  value: "전체 합계",       color: "#191F28",  isLabel: true },
                          { label: "매출",  value: wonFull(totalRev),  color: "#3182F6",  isLabel: false },
                          { label: "매입",  value: wonFull(totalCost), color: "#64748B",  isLabel: false },
                          { label: "손익",  value: wonFull(totalProfit), color: profitColor, isLabel: false },
                        ].map(({ label, value, color }) => (
                          <div key={label} className="px-4 py-3 text-center">
                            <p className="text-xs font-semibold mb-1" style={{ color: "#94A3B8" }}>{label}</p>
                            <p className="text-sm font-bold" style={{ color }}>{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}
