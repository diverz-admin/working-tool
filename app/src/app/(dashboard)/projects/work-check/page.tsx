"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";

interface DailyLog {
  id: string;
  revenueId: string;
  date: string;
  qty: number;
  note: string | null;
  createdAt: string;
}

interface WorkRow {
  id: string;
  projectId: string;
  revenueRowId: string | null;
  assignee: string | null;
  productName: string | null;
  quantity: number | null;
  completedQty: number | null;
  workCompleted: boolean | null;
  workStartDate: string | null;
  workEndDate: string | null;
  paymentDate: string | null;
  total: number | null;
  completedAt: string | null;
  campaignName: string;
  assignedTeam: string | null;
  groupName: string;
  groupId: string;
  dailyLogs: DailyLog[];
}

type FilterTab = "전체" | "미완료" | "완료";

function daysLeft(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  return Math.ceil(diff / 86400000);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${y}.${m}.${day}`;
}

function rowMonth(r: WorkRow) {
  const d = r.workStartDate ?? r.paymentDate;
  return d ? d.slice(0, 7) : null;
}

export default function WorkCheckPage() {
  const thisMonth = new Date().toISOString().slice(0, 7);

  const [rows, setRows]         = useState<WorkRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filterTab, setTab]     = useState<FilterTab>("미완료");
  const [filterTeam, setTeam]   = useState<string>("전체");
  const [selectedMonth, setMonth] = useState<string>(thisMonth);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addForm, setAddForm]   = useState<Record<string, { date: string; qty: string; note: string }>>({});
  const [saving, setSaving]     = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/work-check")
      .then((r) => r.json())
      .then(({ rows: r }) => { setRows(r ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // 데이터에 존재하는 월 목록 (내림차순)
  const months = useMemo(() => {
    const s = new Set(rows.map(rowMonth).filter(Boolean) as string[]);
    return Array.from(s).sort((a, b) => b.localeCompare(a));
  }, [rows]);

  const teams = useMemo(() => {
    const s = new Set(rows.map((r) => r.assignedTeam).filter(Boolean) as string[]);
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => rows.filter((r) => {
    const monthOk = rowMonth(r) === selectedMonth;
    const teamOk  = filterTeam === "전체" || r.assignedTeam === filterTeam;
    const tabOk   =
      filterTab === "전체"  ? true :
      filterTab === "미완료" ? !r.workCompleted :
      Boolean(r.workCompleted);
    return monthOk && teamOk && tabOk;
  }), [rows, selectedMonth, filterTab, filterTeam]);

  // 선택된 월 기준 카운트
  const monthRows = useMemo(() => rows.filter((r) => rowMonth(r) === selectedMonth), [rows, selectedMonth]);
  const totals = {
    전체:  monthRows.length,
    미완료: monthRows.filter((r) => !r.workCompleted).length,
    완료:  monthRows.filter((r) =>  r.workCompleted).length,
  };

  // group → campaign → rows
  const grouped = useMemo(() => {
    const map = new Map<string, { groupName: string; campaigns: Map<string, { campaignName: string; projectId: string; rows: WorkRow[] }> }>();
    for (const row of filtered) {
      if (!map.has(row.groupId)) map.set(row.groupId, { groupName: row.groupName, campaigns: new Map() });
      const group = map.get(row.groupId)!;
      if (!group.campaigns.has(row.projectId)) {
        group.campaigns.set(row.projectId, { campaignName: row.campaignName, projectId: row.projectId, rows: [] });
      }
      group.campaigns.get(row.projectId)!.rows.push(row);
    }
    return Array.from(map.values());
  }, [filtered]);

  async function toggleComplete(row: WorkRow) {
    const next = !row.workCompleted;
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, workCompleted: next, completedAt: next ? new Date().toISOString() : null } : r));
    await fetch(`/api/project-revenues/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workCompleted: next }),
    });
  }

  async function addLog(revenueId: string) {
    const form = addForm[revenueId];
    if (!form?.date || !form?.qty) return;
    setSaving(revenueId);
    const res = await fetch("/api/work-daily-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revenueId, date: form.date, qty: parseInt(form.qty), note: form.note }),
    });
    const data = await res.json();
    setRows(prev => prev.map(r => r.id === revenueId ? {
      ...r,
      completedQty: data.completedQty,
      dailyLogs: [...r.dailyLogs, data.log].sort((a, b) => a.date.localeCompare(b.date)),
    } : r));
    setAddForm(prev => ({ ...prev, [revenueId]: { date: new Date().toISOString().slice(0, 10), qty: "", note: "" } }));
    setSaving(null);
  }

  async function deleteLog(logId: string, revenueId: string) {
    const res = await fetch(`/api/work-daily-logs/${logId}`, { method: "DELETE" });
    const data = await res.json();
    setRows(prev => prev.map(r => r.id === revenueId ? {
      ...r,
      completedQty: data.completedQty,
      dailyLogs: r.dailyLogs.filter(l => l.id !== logId),
    } : r));
  }

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "#191F28" }}>작업확인</h1>
          <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>
            입금 확인된 캠페인의 작업 진행 현황을 관리합니다.
            {totals["미완료"] > 0 && (
              <span style={{ color: "#F97316" }}> · 미완료 {totals["미완료"]}건</span>
            )}
          </p>
        </div>
        <Link
          href="/approval/confirm"
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors hover:bg-slate-50"
          style={{ borderColor: "#E9EBEF", color: "#64748B" }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/><polyline points="9 15 11 17 15 13"/>
          </svg>
          입금확인요청
        </Link>
      </div>

      {/* 월 선택 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold shrink-0" style={{ color: "#94A3B8" }}>월</span>
        {months.length === 0 ? (
          <span className="text-xs" style={{ color: "#CBD5E1" }}>—</span>
        ) : (
          months.map((m) => {
            const [y, mo] = m.split("-");
            const label = `${y}.${mo}`;
            const isActive = selectedMonth === m;
            const incompleteInMonth = rows.filter((r) => rowMonth(r) === m && !r.workCompleted).length;
            return (
              <button key={m} onClick={() => setMonth(m)}
                className="relative flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                style={{
                  background: isActive ? "#191F28" : "#F1F5F9",
                  color:      isActive ? "#fff"     : "#64748B",
                }}>
                {label}
                {incompleteInMonth > 0 && (
                  <span className="flex items-center justify-center text-white font-bold rounded-full"
                    style={{ background: isActive ? "rgba(255,255,255,0.3)" : "#EF4444", fontSize: 9, minWidth: 14, height: 14,
                      paddingLeft: incompleteInMonth > 9 ? 3 : 0, paddingRight: incompleteInMonth > 9 ? 3 : 0 }}>
                    {incompleteInMonth > 99 ? "99+" : incompleteInMonth}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* 필터 바 */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* 탭 */}
        <div className="flex items-center gap-1 p-0.5 rounded-xl" style={{ background: "#F1F5F9" }}>
          {(["미완료", "전체", "완료"] as FilterTab[]).map((tab) => {
            const isActive = filterTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setTab(tab)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: isActive ? "#fff" : "transparent",
                  color: isActive
                    ? tab === "완료" ? "#059669" : tab === "미완료" ? "#F97316" : "#191F28"
                    : "#94A3B8",
                  boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                }}
              >
                {tab}
                <span className="font-bold" style={{ color: isActive ? "inherit" : "#CBD5E1" }}>
                  {totals[tab] ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        {/* 팀 필터 */}
        {teams.length > 0 && (
          <div className="flex items-center gap-1.5">
            {(["전체", ...teams]).map((t) => (
              <button
                key={t}
                onClick={() => setTeam(t)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                style={{
                  background: filterTeam === t
                    ? (t === "영업 1팀" ? "rgba(99,102,241,0.12)" : t === "영업 2팀" ? "rgba(16,185,129,0.12)" : "#191F28")
                    : "#F1F5F9",
                  color: filterTeam === t
                    ? (t === "영업 1팀" ? "#6366F1" : t === "영업 2팀" ? "#10B981" : "#fff")
                    : "#94A3B8",
                }}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 콘텐츠 */}
      {loading ? (
        <div className="rounded-2xl py-20 flex items-center justify-center" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
          <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3182F6" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl py-20 text-center" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: "rgba(49,130,246,0.08)" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3182F6" strokeWidth="2" strokeLinecap="round">
              <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
          </div>
          <p className="text-sm font-medium" style={{ color: "#475569" }}>
            {filterTab === "완료" ? "완료된 작업이 없습니다." : "확인할 작업이 없습니다."}
          </p>
          <p className="text-xs mt-1" style={{ color: "#94A3B8" }}>
            {filterTab !== "완료" && "입금확인 승인 후 자동으로 표시됩니다."}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(({ groupName, campaigns }) => (
            <div key={groupName}>
              {/* 그룹 헤더 */}
              <div className="flex items-center gap-2 mb-2.5">
                <h2 className="text-sm font-bold" style={{ color: "#191F28" }}>{groupName}</h2>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "#F1F5F9", color: "#64748B" }}>
                  {Array.from(campaigns.values()).reduce((s, c) => s + c.rows.length, 0)}건
                </span>
              </div>

              <div className="space-y-3">
                {Array.from(campaigns.values()).map(({ campaignName, projectId, rows: campRows }) => {
                  const allDone = campRows.every((r) => r.workCompleted);
                  const doneCnt = campRows.filter((r) => r.workCompleted).length;
                  return (
                    <div key={projectId} className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: `1px solid ${allDone ? "rgba(16,185,129,0.25)" : "#E9EBEF"}` }}>
                      {/* 캠페인 헤더 */}
                      <div className="flex items-center gap-3 px-5 py-3" style={{ background: allDone ? "rgba(16,185,129,0.04)" : "#F8FAFC", borderBottom: "1px solid #F1F5F9" }}>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {allDone ? (
                            <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "rgba(16,185,129,0.15)" }}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                            </span>
                          ) : (
                            <span className="shrink-0 w-5 h-5 rounded-full border-2" style={{ borderColor: "#E9EBEF" }} />
                          )}
                          <span className="text-sm font-bold truncate" style={{ color: allDone ? "#059669" : "#191F28" }}>{campaignName}</span>
                          <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full" style={{
                            background: allDone ? "rgba(16,185,129,0.1)" : "rgba(234,179,8,0.1)",
                            color: allDone ? "#059669" : "#CA8A04",
                          }}>
                            {doneCnt}/{campRows.length} 완료
                          </span>
                        </div>
                        <Link
                          href={`/projects?open=${projectId}`}
                          className="shrink-0 flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors hover:bg-blue-50"
                          style={{ color: "#3182F6", border: "1px solid rgba(49,130,246,0.2)" }}
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                            <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                          </svg>
                          프로젝트
                        </Link>
                      </div>

                      {/* 매출 행 목록 */}
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ background: "#FAFBFC" }}>
                            {["담당자", "품명", "완료/전체", "금액", "작업기간", "잔여일", "완료", ""].map((h, i) => (
                              <th key={i} className="px-4 py-2.5 text-left font-semibold whitespace-nowrap" style={{ color: "#94A3B8" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {campRows.map((row) => {
                            const isDone = Boolean(row.workCompleted);
                            const isExpanded = expandedId === row.id;
                            const days = daysLeft(row.workEndDate);
                            const completedQty = row.completedQty ?? 0;
                            const totalQty = row.quantity ?? 0;
                            const pct = totalQty > 0 ? Math.min(100, Math.round(completedQty / totalQty * 100)) : 0;

                            return (
                              <React.Fragment key={row.id}>
                                <tr
                                  className="border-t cursor-pointer hover:bg-slate-50/50"
                                  style={{ borderColor: "#F1F5F9", opacity: isDone ? 0.65 : 1 }}
                                  onClick={() => setExpandedId(isExpanded ? null : row.id)}
                                >
                                  {/* 담당자 */}
                                  <td className="px-4 py-3 text-xs font-medium" style={{ color: "#475569" }}>{row.assignee || "—"}</td>
                                  {/* 품명 */}
                                  <td className="px-4 py-3 text-xs font-semibold" style={{ color: isDone ? "#94A3B8" : "#191F28", textDecoration: isDone ? "line-through" : "none" }}>
                                    {row.productName || "—"}
                                  </td>
                                  {/* 완료/전체 + 진행률 */}
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-semibold" style={{ color: "#191F28", minWidth: 55 }}>
                                        {completedQty}<span style={{ color: "#CBD5E1" }}>/{totalQty || "—"}</span>
                                      </span>
                                      {totalQty > 0 && (
                                        <div className="h-1.5 rounded-full overflow-hidden" style={{ width: 60, background: "#F1F5F9" }}>
                                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: isDone ? "#10B981" : pct >= 70 ? "#3182F6" : pct >= 30 ? "#F59E0B" : "#E2E8F0" }} />
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  {/* 금액 */}
                                  <td className="px-4 py-3 text-xs font-bold" style={{ color: "#3182F6" }}>
                                    {row.total ? `₩${row.total.toLocaleString()}` : "—"}
                                  </td>
                                  {/* 작업기간 */}
                                  <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "#94A3B8" }}>
                                    {row.workStartDate || row.workEndDate ? `${fmtDate(row.workStartDate)} ~ ${fmtDate(row.workEndDate)}` : "—"}
                                  </td>
                                  {/* 잔여일 */}
                                  <td className="px-4 py-3 whitespace-nowrap">
                                    {isDone ? (
                                      <span className="text-xs font-semibold" style={{ color: "#059669" }}>
                                        {row.completedAt ? fmtDate(row.completedAt.slice(0, 10)) : "완료"}
                                      </span>
                                    ) : days === null ? (
                                      <span style={{ color: "#CBD5E1" }}>—</span>
                                    ) : (
                                      <span className="font-bold text-xs" style={{ color: days < 0 ? "#EF4444" : days <= 3 ? "#F97316" : days <= 7 ? "#EAB308" : "#64748B" }}>
                                        {days < 0 ? `+${Math.abs(days)}일 초과` : days === 0 ? "D-0" : `D-${days}`}
                                      </span>
                                    )}
                                  </td>
                                  {/* 완료 체크박스 */}
                                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                    <label className="flex items-center gap-1.5 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={isDone}
                                        onChange={() => toggleComplete(row)}
                                        className="w-4 h-4 rounded accent-emerald-500"
                                      />
                                      <span className="text-xs font-semibold" style={{ color: isDone ? "#059669" : "#94A3B8" }}>
                                        {isDone ? "완료" : "미완료"}
                                      </span>
                                    </label>
                                  </td>
                                  {/* 펼치기 아이콘 */}
                                  <td className="px-4 py-3">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round"
                                      style={{ transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>
                                      <polyline points="6 9 12 15 18 9"/>
                                    </svg>
                                  </td>
                                </tr>

                                {/* 데일리 로그 패널 */}
                                {isExpanded && (
                                  <tr style={{ borderColor: "#F1F5F9" }}>
                                    <td colSpan={8} className="px-0 pb-0">
                                      <div style={{ background: "#F8FAFC", borderTop: "1px solid #E9EBEF", borderBottom: "1px solid #E9EBEF" }}>
                                        <div className="px-5 py-3">
                                          <p className="text-xs font-bold mb-2.5" style={{ color: "#475569" }}>데일리 작업 기록</p>

                                          {/* 기존 로그 목록 */}
                                          {row.dailyLogs.length > 0 ? (
                                            <table className="w-full text-xs mb-3">
                                              <thead>
                                                <tr>
                                                  {["날짜", "수량", "메모", ""].map((h, i) => (
                                                    <th key={i} className="text-left pb-1.5 pr-4 font-semibold" style={{ color: "#94A3B8" }}>{h}</th>
                                                  ))}
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {row.dailyLogs.map((log) => (
                                                  <tr key={log.id} className="border-t" style={{ borderColor: "#F1F5F9" }}>
                                                    <td className="py-1.5 pr-4 font-semibold whitespace-nowrap" style={{ color: "#475569" }}>{fmtDate(log.date)}</td>
                                                    <td className="py-1.5 pr-4 font-bold" style={{ color: "#3182F6" }}>{log.qty.toLocaleString()}</td>
                                                    <td className="py-1.5 pr-4" style={{ color: "#94A3B8" }}>{log.note || "—"}</td>
                                                    <td className="py-1.5">
                                                      <button
                                                        onClick={() => deleteLog(log.id, row.id)}
                                                        className="text-xs px-2 py-0.5 rounded-lg transition-colors hover:bg-red-50"
                                                        style={{ color: "#EF4444" }}
                                                      >
                                                        삭제
                                                      </button>
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          ) : (
                                            <p className="text-xs mb-3" style={{ color: "#CBD5E1" }}>아직 기록된 작업이 없습니다.</p>
                                          )}

                                          {/* 합계 */}
                                          {totalQty > 0 && (
                                            <p className="text-xs font-bold mb-3" style={{ color: completedQty >= totalQty ? "#059669" : "#3182F6" }}>
                                              합계: {completedQty.toLocaleString()} / {totalQty.toLocaleString()}
                                              {completedQty >= totalQty && " ✓ 완료"}
                                            </p>
                                          )}

                                          {/* 새 로그 추가 폼 */}
                                          {!isDone && (
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <input
                                                type="date"
                                                value={addForm[row.id]?.date ?? new Date().toISOString().slice(0, 10)}
                                                onChange={(e) => setAddForm(prev => ({ ...prev, [row.id]: { ...prev[row.id] ?? { date: "", qty: "", note: "" }, date: e.target.value } }))}
                                                className="text-xs px-2.5 py-1.5 rounded-lg outline-none border"
                                                style={{ background: "#fff", borderColor: "#E9EBEF", color: "#191F28" }}
                                              />
                                              <input
                                                type="number"
                                                min={0}
                                                placeholder="수량"
                                                value={addForm[row.id]?.qty ?? ""}
                                                onChange={(e) => setAddForm(prev => ({ ...prev, [row.id]: { ...prev[row.id] ?? { date: new Date().toISOString().slice(0, 10), qty: "", note: "" }, qty: e.target.value } }))}
                                                className="text-xs px-2.5 py-1.5 rounded-lg outline-none border w-20 text-center"
                                                style={{ background: "#fff", borderColor: "#E9EBEF", color: "#191F28" }}
                                              />
                                              <input
                                                type="text"
                                                placeholder="메모 (선택)"
                                                value={addForm[row.id]?.note ?? ""}
                                                onChange={(e) => setAddForm(prev => ({ ...prev, [row.id]: { ...prev[row.id] ?? { date: new Date().toISOString().slice(0, 10), qty: "", note: "" }, note: e.target.value } }))}
                                                className="text-xs px-2.5 py-1.5 rounded-lg outline-none border flex-1 min-w-24"
                                                style={{ background: "#fff", borderColor: "#E9EBEF", color: "#191F28" }}
                                              />
                                              <button
                                                disabled={saving === row.id || !addForm[row.id]?.qty}
                                                onClick={() => addLog(row.id)}
                                                className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40 transition-all"
                                                style={{ background: "rgba(49,130,246,0.12)", color: "#3182F6", border: "1px solid rgba(49,130,246,0.2)" }}
                                              >
                                                {saving === row.id ? "..." : "+ 추가"}
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
