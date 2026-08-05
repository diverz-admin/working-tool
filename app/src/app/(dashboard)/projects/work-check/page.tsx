"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { fetchJson } from "@/lib/fetch-json";
import { teamBadgeStyle, teamColor } from "@/lib/teams";

interface WorkRow {
  id: string;
  projectId: string;
  assignee: string | null;
  productName: string | null;
  quantity: number | null;
  workCompleted: boolean | null;
  workStartDate: string | null;
  workEndDate: string | null;
  settingDate: string | null;
  total: number | null;
  campaignName: string;
  assignedTeam: string | null;
  groupName: string;
  groupId: string;
}

type FilterTab = "전체" | "미완료" | "완료";

const TAB_COLORS: Record<FilterTab, string> = { 완료: "#059669", 미완료: "#F97316", 전체: "#191F28" };

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
  const d = r.workStartDate;
  return d ? d.slice(0, 7) : null;
}

export default function WorkCheckPage() {
  const thisMonth = new Date().toISOString().slice(0, 7);

  const [rows, setRows]           = useState<WorkRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [filterTab, setTab]       = useState<FilterTab>("미완료");
  const [filterTeam, setTeam]     = useState<string>("전체");
  const [filterAssignee, setAssignee] = useState<string>("전체");
  const [selectedMonth, setMonth] = useState<string>(thisMonth);

  // 실패를 빈 목록으로 바꾸지 않는다 — "확인할 작업 없음"으로 오인되면 안 되므로 오류로 표시
  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchJson<{ rows?: WorkRow[] }>("/api/work-check")
      .then(({ rows: r }) => { setRows(r ?? []); })
      .catch((e: Error) => { setError(e.message); setRows([]); })
      .finally(() => setLoading(false));
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const { months, teams, assignees } = useMemo(() => {
    const ms = new Set<string>();
    const ts = new Set<string>();
    const as = new Set<string>();
    for (const r of rows) {
      const m = rowMonth(r);
      if (m) ms.add(m);
      if (r.assignedTeam) ts.add(r.assignedTeam);
      if (r.assignee) as.add(r.assignee);
    }
    return {
      months:    Array.from(ms).sort((a, b) => b.localeCompare(a)),
      teams:     Array.from(ts).sort(),
      assignees: Array.from(as).sort(),
    };
  }, [rows]);

  const incompleteByMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const m = rowMonth(r);
      if (m && !r.workCompleted) map.set(m, (map.get(m) ?? 0) + 1);
    }
    return map;
  }, [rows]);

  const monthRows = useMemo(() => rows.filter((r) => rowMonth(r) === selectedMonth), [rows, selectedMonth]);

  const filtered = useMemo(() => monthRows.filter((r) => {
    const teamOk     = filterTeam === "전체" || r.assignedTeam === filterTeam;
    const assigneeOk = filterAssignee === "전체" || r.assignee === filterAssignee;
    const tabOk      =
      filterTab === "전체"   ? true :
      filterTab === "미완료"  ? !r.workCompleted :
      Boolean(r.workCompleted);
    return teamOk && assigneeOk && tabOk;
  }), [monthRows, filterTab, filterTeam, filterAssignee]);

  const totals = useMemo(() => {
    const t = { 전체: monthRows.length, 미완료: 0, 완료: 0 };
    for (const r of monthRows) r.workCompleted ? t.완료++ : t.미완료++;
    return t;
  }, [monthRows]);

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
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, workCompleted: next } : r));
    try {
      const res = await fetch(`/api/work-check/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workCompleted: next }),
      });
      if (!res.ok) {
        setRows(prev => prev.map(r => r.id === row.id ? { ...r, workCompleted: row.workCompleted } : r));
        console.error("[work-check] PATCH 실패", res.status, await res.text().catch(() => ""));
      }
    } catch (err) {
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, workCompleted: row.workCompleted } : r));
      console.error("[work-check] PATCH 오류", err);
    }
  }

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "#191F28" }}>작업확인</h1>
          <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>
            매입(구매) 작업 진행 현황을 관리합니다.
            {totals["미완료"] > 0 && (
              <span style={{ color: "#F97316" }}> · 미완료 {totals["미완료"]}건</span>
            )}
          </p>
        </div>
      </div>

      {/* 월 선택 (오류 시 0건 뱃지가 남지 않도록 숨김) */}
      {!error && (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold shrink-0" style={{ color: "#94A3B8" }}>월</span>
        {months.length === 0 ? (
          <span className="text-xs" style={{ color: "#CBD5E1" }}>—</span>
        ) : (
          months.map((m) => {
            const [y, mo] = m.split("-");
            const label = `${y}.${mo}`;
            const isActive = selectedMonth === m;
            const incompleteInMonth = incompleteByMonth.get(m) ?? 0;
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
      )}

      {/* 필터 바 (오류 시 0건 카운트가 남지 않도록 숨김) */}
      {!error && (
      <div className="flex items-center gap-3 flex-wrap">
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
                  color: isActive ? TAB_COLORS[tab] : "#94A3B8",
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

        {teams.length > 0 && (
          <div className="flex items-center gap-1.5">
            {(["전체", ...teams]).map((t) => (
              <button
                key={t}
                onClick={() => setTeam(t)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                style={{
                  background: filterTeam === t
                    ? (t === "전체" ? "#191F28" : teamBadgeStyle(t, 0.12).background)
                    : "#F1F5F9",
                  color: filterTeam === t
                    ? (t === "전체" ? "#fff" : teamColor(t))
                    : "#94A3B8",
                }}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {assignees.length > 0 && (
          <div className="relative flex items-center gap-1.5">
            <span className="text-xs font-semibold shrink-0" style={{ color: "#94A3B8" }}>작업담당자</span>
            <div className="relative">
              <select
                value={filterAssignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="appearance-none text-xs font-semibold pl-3 pr-7 py-1.5 rounded-lg cursor-pointer outline-none transition-all"
                style={{
                  background: filterAssignee === "전체" ? "#F1F5F9" : "rgba(249,115,22,0.1)",
                  color:      filterAssignee === "전체" ? "#94A3B8"  : "#F97316",
                  border:     filterAssignee === "전체" ? "1px solid transparent" : "1px solid rgba(249,115,22,0.3)",
                }}
              >
                <option value="전체">전체</option>
                {assignees.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <svg
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
                width="10" height="10" viewBox="0 0 24 24" fill="none"
                stroke={filterAssignee === "전체" ? "#94A3B8" : "#F97316"}
                strokeWidth="2.5" strokeLinecap="round"
              >
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
          </div>
        )}
      </div>
      )}

      {/* 콘텐츠 */}
      {loading ? (
        <div className="rounded-2xl py-20 flex items-center justify-center" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
          <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        </div>
      ) : error ? (
        <div className="rounded-2xl py-20 flex flex-col items-center gap-3" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
          <p className="text-sm font-semibold" style={{ color: "#EF4444" }}>{error}</p>
          <p className="text-xs" style={{ color: "#94A3B8" }}>데이터가 없는 것으로 잘못 보이지 않도록 표시를 중단했습니다.</p>
          <button onClick={load} className="px-4 py-1.5 text-sm font-semibold rounded-lg" style={{ background: "#F97316", color: "#fff" }}>다시 시도</button>
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl py-20 text-center" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: "rgba(249,115,22,0.08)" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2" strokeLinecap="round">
              <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
          </div>
          <p className="text-sm font-medium" style={{ color: "#475569" }}>
            {filterTab === "완료" ? "완료된 작업이 없습니다." : "확인할 작업이 없습니다."}
          </p>
          <p className="text-xs mt-1" style={{ color: "#94A3B8" }}>
            {filterTab !== "완료" && "매입(구매) 데이터 입력 후 자동으로 표시됩니다."}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(({ groupName, campaigns }) => (
            <div key={groupName}>
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
                      <div className="flex items-center gap-3 px-5 py-3" style={{ background: allDone ? "rgba(16,185,129,0.04)" : "#FFF7ED", borderBottom: "1px solid #FED7AA" }}>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {allDone ? (
                            <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "rgba(16,185,129,0.15)" }}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                            </span>
                          ) : (
                            <span className="shrink-0 w-5 h-5 rounded-full border-2" style={{ borderColor: "#FED7AA" }} />
                          )}
                          <span className="text-sm font-bold truncate" style={{ color: allDone ? "#059669" : "#191F28" }}>{campaignName}</span>
                          <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full" style={{
                            background: allDone ? "rgba(16,185,129,0.1)" : "rgba(249,115,22,0.1)",
                            color: allDone ? "#059669" : "#F97316",
                          }}>
                            {doneCnt}/{campRows.length} 완료
                          </span>
                        </div>
                        <Link
                          href={`/projects?open=${projectId}`}
                          className="shrink-0 flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors hover:bg-orange-50"
                          style={{ color: "#F97316", border: "1px solid rgba(249,115,22,0.2)" }}
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                            <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                          </svg>
                          프로젝트
                        </Link>
                      </div>

                      {/* 매입 행 목록 */}
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ background: "#FAFBFC" }}>
                            {["담당자", "품명", "수량", "금액", "작업기간", "잔여일", "완료"].map((h, i) => (
                              <th key={i} className="px-4 py-2.5 text-left font-semibold whitespace-nowrap" style={{ color: "#94A3B8" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {campRows.map((row) => {
                            const isDone = Boolean(row.workCompleted);
                            const days = daysLeft(row.workEndDate);

                            return (
                              <tr key={row.id} className="border-t" style={{ borderColor: "#F1F5F9", opacity: isDone ? 0.65 : 1 }}>
                                <td className="px-4 py-3 text-xs font-medium" style={{ color: "#475569" }}>{row.assignee || "—"}</td>
                                <td className="px-4 py-3 text-xs font-semibold" style={{ color: isDone ? "#94A3B8" : "#191F28", textDecoration: isDone ? "line-through" : "none" }}>
                                  {row.productName || "—"}
                                </td>
                                <td className="px-4 py-3 text-xs" style={{ color: "#475569" }}>{row.quantity ?? "—"}</td>
                                <td className="px-4 py-3 text-xs font-bold" style={{ color: "#F97316" }}>
                                  {row.total ? `₩${row.total.toLocaleString()}` : "—"}
                                </td>
                                <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "#94A3B8" }}>
                                  {row.workStartDate || row.workEndDate ? `${fmtDate(row.workStartDate)} ~ ${fmtDate(row.workEndDate)}` : "—"}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  {isDone ? (
                                    <span className="text-xs font-semibold" style={{ color: "#059669" }}>완료</span>
                                  ) : days === null ? (
                                    <span style={{ color: "#CBD5E1" }}>—</span>
                                  ) : (
                                    <span className="font-bold text-xs" style={{ color: days < 0 ? "#EF4444" : days <= 3 ? "#F97316" : days <= 7 ? "#EAB308" : "#64748B" }}>
                                      {days < 0 ? `+${Math.abs(days)}일 초과` : days === 0 ? "D-0" : `D-${days}`}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={isDone}
                                      onChange={() => toggleComplete(row)}
                                      className="w-4 h-4 rounded accent-orange-500"
                                    />
                                    <span className="text-xs font-semibold" style={{ color: isDone ? "#059669" : "#94A3B8" }}>
                                      {isDone ? "완료" : "미완료"}
                                    </span>
                                  </label>
                                </td>
                              </tr>
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
