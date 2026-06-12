"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const MONTHS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
const CHART_COLORS = { 매출: "#3182F6", 영업이익: "#10B981" };

function wonFmt(n: number) {
  if (n === 0) return "₩0";
  if (n >= 100_000_000) return `₩${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000)      return `₩${(n / 10_000).toFixed(0)}만`;
  return "₩" + n.toLocaleString();
}
function wonFull(n: number) { return "₩" + n.toLocaleString(); }

interface MonthlyItem { month: number; total: number; supplyPrice: number; tax: number; count: number; }
interface AggregateData { year: number; monthly: MonthlyItem[]; yearTotal: number; yearSupplyPrice: number; }
interface Project {
  id: string; campaignName: string; advertiser: string | null;
  assignedPerson: string | null; startDate: string | null; endDate: string | null;
  status: string; contractAmount: number | null; projectGroupId: string | null;
}
interface Notice { id: string; title: string; content: string; isPinned: boolean; }

function daysLeft(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000);
}
function urgencyColor(days: number | null) {
  if (days === null) return "#94A3B8";
  if (days <= 1) return "#EF4444";
  if (days <= 3) return "#F97316";
  if (days <= 7) return "#EAB308";
  return "#64748B";
}

export default function DashboardPage() {
  const now = new Date();
  const thisMonth = now.getMonth();   // 0-indexed
  const prevMonth = thisMonth === 0 ? 11 : thisMonth - 1;
  const year = now.getFullYear();

  const [agg,      setAgg]      = useState<AggregateData | null>(null);
  const [costAgg,  setCostAgg]  = useState<{ monthly: { total: number }[]; yearTotal: number } | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [notices,  setNotices]  = useState<Notice[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [openNotice, setOpenNotice] = useState<Notice | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/revenue/aggregate?year=${year}`).then(r => r.json()),
      fetch(`/api/costs/aggregate?year=${year}`).then(r => r.json()),
      fetch("/api/projects").then(r => r.json()),
      fetch("/api/notices?pinned=true").then(r => r.json()),
    ]).then(([aggData, costData, projData, noticeData]) => {
      setAgg(aggData);
      setCostAgg(costData);
      setProjects((projData.projects ?? []).filter((p: Project) => p.status === "진행"));
      setNotices(noticeData.notices ?? []);
    }).finally(() => setLoading(false));
  }, [year]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const thisM      = agg?.monthly?.[thisMonth];
  const prevM      = agg?.monthly?.[prevMonth];
  const thisTot    = thisM?.total ?? 0;
  const prevTot    = prevM?.total ?? 0;
  const diff       = prevTot > 0 ? ((thisTot - prevTot) / prevTot * 100) : 0;
  const thisCost   = costAgg?.monthly?.[thisMonth]?.total ?? 0;
  const profit     = thisTot - thisCost;
  const yearProfit = (agg?.yearTotal ?? 0) - (costAgg?.yearTotal ?? 0);

  // 차트: 올해 1~현재월 데이터
  const chartData = (agg?.monthly ?? []).slice(0, thisMonth + 1).map((m, i) => ({
    month: MONTHS[i],
    매출:  m.total,
    공급가: m.supplyPrice,
  }));

  const activeProjects = projects.filter(p => {
    const d = daysLeft(p.endDate);
    return d === null || d >= 0;
  });
  const urgentProjects = activeProjects.filter(p => {
    const d = daysLeft(p.endDate);
    return d !== null && d <= 7;
  });

  return (
    <div className="space-y-6">

      {/* 공지사항 모달 */}
      {openNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(25,31,40,0.45)" }} onClick={() => setOpenNotice(null)}>
          <div className="rounded-2xl w-full max-w-lg mx-4 overflow-hidden" style={{ background: "#fff", boxShadow: "0 20px 60px rgba(22,31,51,0.18)" }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4" style={{ background: "linear-gradient(135deg,#FEF9C3,#FEF3C7)", borderBottom: "1px solid #FDE68A" }}>
              <h2 className="text-base font-bold" style={{ color: "#92400E" }}>{openNotice.title}</h2>
              <button onClick={() => setOpenNotice(null)} className="p-1.5 rounded-lg hover:bg-yellow-200">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="px-6 py-5"><p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "#374151" }}>{openNotice.content || "내용이 없습니다."}</p></div>
          </div>
        </div>
      )}

      {/* 공지 배너 */}
      {notices.map(n => (
        <div key={n.id} onClick={() => setOpenNotice(n)} className="flex items-center gap-3 px-4 py-3 rounded-2xl cursor-pointer" style={{ background: "linear-gradient(135deg,#FEF9C3,#FEF3C7)", border: "1px solid #FDE68A" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="#F59E0B" stroke="none" style={{ flexShrink: 0 }}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          <p className="flex-1 text-sm font-semibold truncate" style={{ color: "#92400E" }}>{n.title}</p>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      ))}

      {/* 종료 임박 알림 */}
      {!loading && (() => {
        const d1 = activeProjects.filter(p => { const d = daysLeft(p.endDate); return d !== null && d <= 1; });
        const d3 = activeProjects.filter(p => { const d = daysLeft(p.endDate); return d !== null && d >= 2 && d <= 3; });
        const d7 = activeProjects.filter(p => { const d = daysLeft(p.endDate); return d !== null && d >= 4 && d <= 7; });
        if (d1.length === 0 && d3.length === 0 && d7.length === 0) return null;
        const alerts = [
          { items: d1, label: "종료 1일전", color: "#EF4444", bg: "rgba(239,68,68,0.06)", border: "rgba(239,68,68,0.2)" },
          { items: d3, label: "종료 3일전", color: "#F97316", bg: "rgba(249,115,22,0.06)", border: "rgba(249,115,22,0.2)" },
          { items: d7, label: "종료 7일전", color: "#EAB308", bg: "rgba(234,179,8,0.06)",  border: "rgba(234,179,8,0.2)" },
        ].filter(a => a.items.length > 0);
        return (
          <div className="space-y-2">
            {alerts.map(({ items, label, color, bg, border }) => (
              <div key={label} className="flex items-start gap-3 px-4 py-3 rounded-2xl" style={{ background: bg, border: `1px solid ${border}` }}>
                <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: color }} />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-bold mr-2" style={{ color }}>{label}</span>
                  <span className="text-xs" style={{ color: "#475569" }}>
                    {items.map((p, i) => (
                      <span key={p.id}>
                        {i > 0 && <span style={{ color: "#CBD5E1" }}> · </span>}
                        <Link href={p.projectGroupId ? `/projects?open=${p.id}` : "/projects"} className="font-medium hover:underline" style={{ color: "#475569" }}>
                          {p.campaignName}
                        </Link>
                        {p.endDate && <span className="ml-1 font-semibold" style={{ color }}>{p.endDate}</span>}
                      </span>
                    ))}
                  </span>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: `${color}18`, color }}>{items.length}건</span>
              </div>
            ))}
          </div>
        );
      })()}

      {/* KPI 카드 — 계산서날짜(매출) / 승인 매입 기준 */}
      <div className="grid grid-cols-4 gap-4">
        {/* 이번달 매출 */}
        <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: "#94A3B8" }}>이번달 매출<br/><span style={{ color: "#CBD5E1", fontWeight: 400 }}>결재완료 + 계산서발급</span></span>
            <span className="p-2 rounded-xl" style={{ background: "rgba(49,130,246,0.1)", color: "#3182F6" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
            </span>
          </div>
          <p className="text-xl font-black" style={{ color: "#191F28" }}>{loading ? "—" : wonFmt(thisTot)}</p>
          {!loading && prevTot > 0 && (
            <p className="text-xs" style={{ color: "#94A3B8" }}>
              <span style={{ color: diff >= 0 ? "#22C55E" : "#EF4444", fontWeight: 700 }}>{diff >= 0 ? "▲" : "▼"} {Math.abs(diff).toFixed(1)}%</span> 전월 대비
            </p>
          )}
        </div>

        {/* 이번달 승인 매입 */}
        <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: "#94A3B8" }}>이번달 매입<br/><span style={{ color: "#CBD5E1", fontWeight: 400 }}>입금요청 승인</span></span>
            <span className="p-2 rounded-xl" style={{ background: "rgba(239,68,68,0.08)", color: "#EF4444" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            </span>
          </div>
          <p className="text-xl font-black" style={{ color: "#191F28" }}>{loading ? "—" : wonFmt(thisCost)}</p>
          <p className="text-xs" style={{ color: "#94A3B8" }}>연간 {wonFmt(costAgg?.yearTotal ?? 0)}</p>
        </div>

        {/* 이번달 영업이익 */}
        <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: "linear-gradient(135deg,#3182F6,#2462D8)" }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.7)" }}>이번달 영업이익<br/><span style={{ fontWeight: 400, opacity: 0.6 }}>확정매출 - 승인매입</span></span>
            <span className="p-2 rounded-xl" style={{ background: "rgba(255,255,255,0.2)", color: "#fff" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </span>
          </div>
          <p className="text-xl font-black" style={{ color: "#fff" }}>{loading ? "—" : wonFmt(profit)}</p>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>연간 {wonFmt(yearProfit)}</p>
        </div>

        {/* 진행 프로젝트 */}
        <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: "#94A3B8" }}>진행중 프로젝트</span>
            <span className="p-2 rounded-xl" style={{ background: "rgba(16,185,129,0.1)", color: "#10B981" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            </span>
          </div>
          <p className="text-xl font-black" style={{ color: "#191F28" }}>{activeProjects.length}건</p>
          {urgentProjects.length > 0 && (
            <p className="text-xs" style={{ color: "#F97316", fontWeight: 600 }}>종료임박 {urgentProjects.length}건</p>
          )}
        </div>
      </div>

      {/* 차트 + 월별 상세 */}
      <div className="grid grid-cols-3 gap-5">
        {/* 월별 매출 차트 */}
        <div className="col-span-2 rounded-2xl p-6" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-bold text-base" style={{ color: "#191F28" }}>월별 매출 추이</h2>
              <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>결재완료 + 계산서발급 기준 · {year}년</p>
            </div>
            <div className="flex items-center gap-4 text-xs" style={{ color: "#64748B" }}>
              {Object.entries(CHART_COLORS).map(([k, c]) => (
                <span key={k} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: c, display: "inline-block" }} />{k}
                </span>
              ))}
            </div>
          </div>
          {loading ? (
            <div className="h-56 flex items-center justify-center text-sm" style={{ color: "#CBD5E1" }}>불러오는 중...</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} barGap={4} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} tickFormatter={v => wonFmt(v)} width={60} />
                <Tooltip formatter={(v: unknown) => [wonFull(v as number)]} contentStyle={{ background: "#fff", border: "1px solid #E9EBEF", borderRadius: 10, fontSize: 12 }} />
                <Bar dataKey="매출" fill={CHART_COLORS.매출} radius={[4,4,0,0]} />
                <Bar dataKey="공급가" fill={CHART_COLORS.영업이익} radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* 월별 합계 테이블 */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #F1F5F9", background: "#F8FAFC" }}>
            <p className="text-sm font-bold" style={{ color: "#191F28" }}>월별 합계</p>
            <p className="text-xs" style={{ color: "#94A3B8" }}>결재완료 + 계산서발급 기준</p>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
            {loading ? (
              <p className="text-center py-8 text-sm" style={{ color: "#CBD5E1" }}>불러오는 중...</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: "#FAFAFA" }}>
                    <th className="px-4 py-2 text-left font-semibold" style={{ color: "#64748B" }}>월</th>
                    <th className="px-4 py-2 text-right font-semibold" style={{ color: "#64748B" }}>합계</th>
                    <th className="px-4 py-2 text-right font-semibold" style={{ color: "#64748B" }}>건수</th>
                  </tr>
                </thead>
                <tbody>
                  {(agg?.monthly ?? []).map((m, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: "#F1F5F9", background: i === thisMonth ? "rgba(49,130,246,0.04)" : "transparent" }}>
                      <td className="px-4 py-2 font-medium" style={{ color: i === thisMonth ? "#3182F6" : "#475569" }}>
                        {MONTHS[i]}{i === thisMonth && <span className="ml-1 text-xs" style={{ color: "#3182F6" }}>●</span>}
                      </td>
                      <td className="px-4 py-2 text-right font-bold" style={{ color: m.total > 0 ? "#191F28" : "#CBD5E1" }}>
                        {m.total > 0 ? wonFmt(m.total) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right" style={{ color: "#94A3B8" }}>{m.count > 0 ? `${m.count}건` : "—"}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: "2px solid #E9EBEF", background: "rgba(49,130,246,0.06)" }}>
                    <td className="px-4 py-2.5 font-bold" style={{ color: "#3182F6" }}>합계</td>
                    <td className="px-4 py-2.5 text-right font-black" style={{ color: "#3182F6" }}>{wonFmt(agg?.yearTotal ?? 0)}</td>
                    <td className="px-4 py-2.5 text-right font-bold" style={{ color: "#3182F6" }}>
                      {(agg?.monthly ?? []).reduce((s, m) => s + m.count, 0)}건
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* 진행중 프로젝트 테이블 */}
      <div className="rounded-2xl" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid #F1F5F9" }}>
          <div>
            <h2 className="font-bold text-base" style={{ color: "#191F28" }}>진행중인 프로젝트</h2>
            <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>
              총 {activeProjects.length}건
              {urgentProjects.length > 0 && <span style={{ color: "#F97316", fontWeight: 600 }}> · 종료임박 {urgentProjects.length}건</span>}
            </p>
          </div>
          <Link href="/projects" className="text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors" style={{ color: "#3182F6", border: "1px solid rgba(49,130,246,0.25)", background: "rgba(49,130,246,0.04)" }}>
            전체 보기 →
          </Link>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <p className="text-center py-12 text-sm" style={{ color: "#CBD5E1" }}>불러오는 중...</p>
          ) : activeProjects.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: "#94A3B8" }}>진행중인 프로젝트가 없습니다.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "#F8FAFC" }}>
                  {["캠페인명","광고주","담당자","시작일","종료일","잔여일","계약금액"].map(h => (
                    <th key={h} className="px-5 py-3 text-left font-semibold text-xs" style={{ color: "#64748B" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...activeProjects]
                  .sort((a, b) => (daysLeft(a.endDate) ?? 999) - (daysLeft(b.endDate) ?? 999))
                  .map(p => {
                    const d = daysLeft(p.endDate);
                    const color = urgencyColor(d);
                    const isUrgent = d !== null && d <= 7;
                    return (
                      <tr key={p.id} className="border-t" style={{ borderColor: "#F1F5F9", background: isUrgent ? `${color}08` : "transparent" }}>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            {isUrgent && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />}
                            <Link href={p.projectGroupId ? `/projects/${p.projectGroupId}?campaign=${p.id}` : "/projects"} className="font-medium hover:underline" style={{ color: "#191F28" }}>{p.campaignName}</Link>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>{p.advertiser || "—"}</td>
                        <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>{p.assignedPerson || "—"}</td>
                        <td className="px-5 py-3.5 text-xs" style={{ color: "#94A3B8" }}>{p.startDate || "—"}</td>
                        <td className="px-5 py-3.5 text-xs font-medium" style={{ color: isUrgent ? color : "#94A3B8" }}>{p.endDate || "—"}</td>
                        <td className="px-5 py-3.5">
                          {d === null ? <span style={{ color: "#CBD5E1" }}>—</span> : (
                            <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: `${color}18`, color }}>
                              {d === 0 ? "D-Day" : d < 0 ? `+${Math.abs(d)}` : `D-${d}`}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-xs font-medium" style={{ color: "#191F28" }}>
                          {p.contractAmount ? wonFmt(p.contractAmount) : "—"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
