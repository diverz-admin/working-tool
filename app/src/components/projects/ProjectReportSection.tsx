"use client";

import { useState, useEffect, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

/* ── 타입 ── */
interface RankingEntry {
  id: string;
  rank: number | null;
  checkedAt: string;
}

interface Tracker {
  id: string;
  keyword: string;
  platform: string;
  targetType: string;
  targetValue: string;
  startDate: string | null;
  endDate: string | null;
  rankings: RankingEntry[];
  latestRanking: RankingEntry | null;
}

interface AddFormState {
  platform: "shopping" | "place";
  keyword: string;
  targetType: string;
  targetValue: string;
  startDate: string;
  endDate: string;
}

/* ── 상수 ── */
const KEYWORD_COLORS = ["#3182F6", "#8B5CF6", "#10B981", "#F97316", "#EF4444", "#EAB308"];

const TARGET_TYPE_LABELS: Record<string, string> = {
  mall:         "쇼핑몰명",
  product_id:   "카탈로그 ID",
  product_name: "상품명",
  nstore_id:    "스마트스토어 ID",
  place_name:   "업체명",
  place_id:     "플레이스 ID",
};

const PLATFORM_META: Record<string, { label: string; color: string; bg: string }> = {
  shopping: { label: "쇼핑",    color: "#3182F6", bg: "rgba(49,130,246,0.1)"   },
  place:    { label: "플레이스", color: "#8B5CF6", bg: "rgba(139,92,246,0.1)" },
};

/* ── 날짜 헬퍼 ── */
function toISO(d: Date) { return d.toISOString().slice(0, 10); }

function generateDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const s = new Date(start);
  const e = new Date(end);
  const cur = new Date(s);
  while (cur <= e) { dates.push(toISO(cur)); cur.setDate(cur.getDate() + 1); }
  return dates;
}

function last25(): string[] {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 24);
  return generateDateRange(toISO(start), toISO(today));
}

function fmtDate(iso: string) {
  const [, m, d] = iso.split("-");
  return `${parseInt(m)}/${parseInt(d)}`;
}

function daysLeft(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  return Math.ceil(diff / 86400000);
}

/** 모든 tracker의 날짜 범위를 합쳐서 전체 컬럼 목록 생성 */
function getTableDates(trackers: Tracker[]): string[] {
  const today = toISO(new Date());
  const withDates = trackers.filter((t) => t.startDate);
  if (withDates.length === 0) return last25();

  const starts = withDates.map((t) => t.startDate!);
  const ends   = withDates.map((t) => t.endDate ?? today);
  const minStart = starts.reduce((a, b) => (a < b ? a : b));
  const maxEnd   = ends.reduce((a, b) => (a > b ? a : b));
  const effectiveEnd = maxEnd > today ? today : maxEnd;
  return generateDateRange(minStart, effectiveEnd);
}

function getRankOnDate(tracker: Tracker, date: string): number | null | undefined {
  const onDate = tracker.rankings.filter((r) => r.checkedAt.slice(0, 10) === date);
  if (onDate.length === 0) return undefined;
  return onDate[onDate.length - 1].rank;
}

/** date가 tracker의 추적 기간 안에 있는지 */
function inRange(tracker: Tracker, date: string): boolean {
  const today = toISO(new Date());
  const start = tracker.startDate ?? null;
  const end   = tracker.endDate   ?? today;
  if (!start) return true; // 날짜 미설정이면 항상 범위 내
  return date >= start && date <= end;
}

/** 보장형: iterStart부터 오늘까지 5위 이내 달성일 25일 계산 */
function calcGuaranteeEndDate(
  iterStart: string,
  trackersData: Tracker[]
): { endDate: string | null; qualifyingDays: number } {
  const today = toISO(new Date());
  let count = 0;
  const cur = new Date(iterStart);
  while (true) {
    const dateStr = toISO(cur);
    if (dateStr > today) break;
    const qualified = trackersData.some((t) => {
      if (!inRange(t, dateStr)) return false;
      const rank = getRankOnDate(t, dateStr);
      return rank !== undefined && rank !== null && rank <= 5;
    });
    if (qualified) count++;
    if (count === 25) return { endDate: dateStr, qualifyingDays: 25 };
    cur.setDate(cur.getDate() + 1);
  }
  return { endDate: null, qualifyingDays: count };
}

/* ── 순위 셀 ── */
function RankCell({
  rank,
  inPeriod,
  projectType,
}: {
  rank: number | null | undefined;
  inPeriod: boolean;
  projectType?: string | null;
}) {
  const baseStyle: React.CSSProperties = {
    borderColor: "#E2E8F0",
    background: inPeriod ? "#FFFFFF" : "#F8FAFC",
  };

  if (!inPeriod || rank === undefined) {
    return <td className="border px-2 py-1.5 text-center text-xs" style={baseStyle} />;
  }

  if (rank === null) {
    return (
      <td className="border px-2 py-1.5 text-center text-xs font-medium"
        title="순위권 밖 (300위 초과) 또는 상품 ID를 확인해주세요."
        style={{ ...baseStyle, color: "#CBD5E1" }}>
        —
      </td>
    );
  }

  let color: string;
  if (projectType === "보장형") {
    color = rank <= 5 ? "#3182F6" : "#EF4444";
  } else {
    color = rank <= 3 ? "#10B981" : rank <= 10 ? "#3182F6" : rank <= 30 ? "#EAB308" : rank <= 100 ? "#F97316" : "#94A3B8";
  }

  return (
    <td
      className="border px-2 py-1.5 text-center text-xs font-bold"
      style={{ ...baseStyle, color, background: inPeriod ? `${color}12` : "#F8FAFC" }}
    >
      {rank}
    </td>
  );
}

/* ── 메인 컴포넌트 ── */
export default function ProjectReportSection({
  projectId,
  clientId,
  endDate,
  projectType,
  startDate,
  onGuaranteeEndDate,
}: {
  projectId: string | undefined;
  clientId: string | undefined;
  endDate?: string;
  projectType?: string | null;
  startDate?: string;
  onGuaranteeEndDate?: (date: string | null, qualifyingDays: number) => void;
}) {
  const [trackers,    setTrackers]    = useState<Tracker[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [guaranteeResult, setGuaranteeResult] = useState<{ endDate: string | null; qualifyingDays: number } | null>(null);
  const [checking,    setChecking]    = useState<string | null>(null);
  const [checkingAll, setCheckingAll] = useState(false);
  const [showAdd,     setShowAdd]     = useState(false);
  const [addForm,     setAddForm]     = useState<AddFormState>({
    platform: "place", keyword: "", targetType: "place_name", targetValue: "",
    startDate: "", endDate: "",
  });
  const [saving,    setSaving]   = useState(false);
  const [addError,  setAddError] = useState<string | null>(null);

  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editForm,    setEditForm]    = useState<AddFormState>({ platform: "place", keyword: "", targetType: "place_name", targetValue: "", startDate: "", endDate: "" });
  const [editSaving,  setEditSaving]  = useState(false);
  const [editError,   setEditError]   = useState<string | null>(null);

  const load = useCallback(() => {
    if (!projectId) return;
    setLoading(true);
    fetch(`/api/reports/trackers?projectId=${projectId}&withHistory=true`)
      .then((r) => r.json())
      .then((d) => setTrackers(d.trackers ?? []))
      .finally(() => setLoading(false));
  }, [projectId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // 보장형: 트래커 데이터 변경 시 25일 달성일 계산
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (projectType !== "보장형" || trackers.length === 0) {
      setGuaranteeResult(null);
      return;
    }
    const trackerStarts = trackers.filter((t) => t.startDate).map((t) => t.startDate!);
    const iterStart = startDate
      || (trackerStarts.length > 0 ? trackerStarts.reduce((a, b) => (a < b ? a : b)) : null);
    if (!iterStart) {
      const result = { endDate: null, qualifyingDays: 0 };
      setGuaranteeResult(result);
      onGuaranteeEndDate?.(null, 0);
      return;
    }
    const result = calcGuaranteeEndDate(iterStart, trackers);
    setGuaranteeResult(result);

    // 계약 종료일 연동:
    // - 25일 달성: 달성일(정확한 날짜)
    // - 미달성: 키워드 최대 종료 날짜(현재 추적 중인 기간의 끝)
    const trackerEndDates = trackers.filter((t) => t.endDate).map((t) => t.endDate!);
    const maxTrackerEndDate = trackerEndDates.length > 0
      ? trackerEndDates.reduce((a, b) => (a > b ? a : b))
      : null;
    const effectiveEndDate = result.endDate ?? maxTrackerEndDate;
    onGuaranteeEndDate?.(effectiveEndDate, result.qualifyingDays);

    // 25일 달성 시 키워드 종료 날짜 자동 동기화
    if (result.endDate && result.qualifyingDays >= 25) {
      const needsUpdate = trackers.filter((t) => t.endDate !== result.endDate);
      if (needsUpdate.length > 0) {
        Promise.all(
          needsUpdate.map((t) =>
            fetch(`/api/reports/trackers/${t.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ endDate: result.endDate }),
            })
          )
        ).then(() => load());
      }
    }
  }, [trackers, projectType, startDate, onGuaranteeEndDate, load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function checkOne(trackerId: string) {
    setChecking(trackerId);
    await fetch("/api/reports/rankings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackerId }),
    });
    setChecking(null);
    load();
  }

  async function checkAll() {
    setCheckingAll(true);
    await Promise.all(
      trackers.map((t) =>
        fetch("/api/reports/rankings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trackerId: t.id }),
        })
      )
    );
    setCheckingAll(false);
    load();
  }

  async function deleteTracker(id: string) {
    await fetch(`/api/reports/trackers/${id}`, { method: "DELETE" });
    load();
  }

  function openEdit(t: Tracker) {
    setEditingId(t.id);
    setEditForm({
      platform:    t.platform as "shopping" | "place",
      keyword:     t.keyword,
      targetType:  t.targetType,
      targetValue: t.targetValue,
      startDate:   t.startDate ?? "",
      endDate:     t.endDate   ?? "",
    });
    setEditError(null);
    setShowAdd(false);
  }

  function closeEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editForm.keyword.trim() || !editForm.targetValue.trim()) {
      setEditError("키워드와 추적값을 입력해주세요."); return;
    }
    setEditSaving(true); setEditError(null);
    const res = await fetch(`/api/reports/trackers/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform:    editForm.platform,
        keyword:     editForm.keyword,
        targetType:  editForm.targetType,
        targetValue: editForm.targetValue,
        startDate:   editForm.startDate || null,
        endDate:     editForm.endDate   || null,
      }),
    });
    setEditSaving(false);
    if (!res.ok) { setEditError("저장 실패"); return; }
    closeEdit();
    load();
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addForm.keyword.trim() || !addForm.targetValue.trim()) {
      setAddError("키워드와 추적값을 입력해주세요."); return;
    }
    setSaving(true); setAddError(null);
    const res = await fetch("/api/reports/trackers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        clientId,
        platform:    addForm.platform,
        keyword:     addForm.keyword,
        targetType:  addForm.targetType,
        targetValue: addForm.targetValue,
        startDate:   addForm.startDate || null,
        endDate:     addForm.endDate   || null,
      }),
    });
    setSaving(false);
    if (!res.ok) { setAddError("저장 실패"); return; }
    setShowAdd(false);
    setAddForm({ platform: "place", keyword: "", targetType: "place_name", targetValue: "", startDate: "", endDate: "" });
    load();
  }

  const DATES = getTableDates(trackers);

  /* 차트 데이터: 날짜 × 키워드 → rank */
  const chartData = DATES.map((date) => {
    const entry: Record<string, string | number> = { date: fmtDate(date) };
    trackers.forEach((t) => {
      if (!inRange(t, date)) return;
      const r = getRankOnDate(t, date);
      if (r !== undefined) entry[t.keyword] = r ?? 301;
    });
    return entry;
  });

  const remaining = daysLeft(endDate);
  const isGuarantee = projectType === "보장형";

  const inputCls  = "w-full px-2.5 py-1.5 text-xs rounded-lg outline-none border transition-colors focus:border-[#3182F6]";
  const inputStyle = { background: "#F8FAFC", borderColor: "#E9EBEF", color: "#191F28" };

  return (
    <div className="space-y-4">
      {/* 구분선 */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px" style={{ background: "#F1F5F9" }} />
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2" style={{ color: "#94A3B8" }}>키워드 순위 리포트</span>
          {isGuarantee && (
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(49,130,246,0.1)", color: "#3182F6" }}>
              보장형 · 1~5위 보장
            </span>
          )}
          {isGuarantee && guaranteeResult && (
            <span className="text-xs px-2.5 py-0.5 rounded-full font-bold" style={{
              background: guaranteeResult.qualifyingDays >= 25 ? "rgba(5,150,105,0.12)" : "rgba(234,179,8,0.1)",
              color: guaranteeResult.qualifyingDays >= 25 ? "#059669" : "#CA8A04",
              border: `1px solid ${guaranteeResult.qualifyingDays >= 25 ? "rgba(5,150,105,0.25)" : "rgba(234,179,8,0.25)"}`,
            }}>
              {guaranteeResult.qualifyingDays >= 25
                ? `달성 완료 (${guaranteeResult.endDate})`
                : `${guaranteeResult.qualifyingDays}/25일`}
            </span>
          )}
        </div>
        <div className="flex-1 h-px" style={{ background: "#F1F5F9" }} />
      </div>

      {!projectId ? (
        <div className="py-6 text-center rounded-xl" style={{ background: "#F8FAFC" }}>
          <p className="text-xs" style={{ color: "#94A3B8" }}>프로젝트를 저장한 후 키워드를 추가할 수 있습니다.</p>
        </div>
      ) : (
        <>
          {/* 액션 */}
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: "#94A3B8" }}>
              키워드 {trackers.length}개
              {isGuarantee && (
                <span className="ml-2">
                  · <span style={{ color: "#3182F6" }}>■</span> 1~5위 (카운트)
                  <span className="ml-1" style={{ color: "#EF4444" }}>■</span> 6위+ (미카운트)
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={checkAll}
                disabled={checkingAll || trackers.length === 0}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all hover:bg-slate-50 disabled:opacity-40"
                style={{ borderColor: "#E9EBEF", color: "#475569" }}
              >
                {checkingAll
                  ? <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                  : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-.08-4" /></svg>
                }
                전체 조회
              </button>
              <button
                onClick={() => setShowAdd((v) => !v)}
                className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl text-white transition-opacity hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                키워드 추가
              </button>
            </div>
          </div>

          {/* 추가 폼 */}
          {showAdd && (
            <form onSubmit={handleAdd} className="p-4 rounded-xl space-y-3" style={{ background: "#F8FAFC", border: "1px solid #E9EBEF" }}>
              {/* 플랫폼 */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>플랫폼</label>
                <div className="flex gap-2">
                  {(["place", "shopping"] as const).map((p) => {
                    const meta = PLATFORM_META[p];
                    const isActive = addForm.platform === p;
                    return (
                      <button key={p} type="button"
                        onClick={() => setAddForm((prev) => ({
                          ...prev, platform: p,
                          targetType: p === "place" ? "place_name" : "mall",
                          targetValue: "",
                        }))}
                        className="flex-1 py-1.5 text-xs font-bold rounded-xl border transition-all"
                        style={{
                          background:  isActive ? meta.bg    : "#FFFFFF",
                          borderColor: isActive ? meta.color : "#E9EBEF",
                          color:       isActive ? meta.color : "#94A3B8",
                        }}>
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 키워드 + 추적 방식 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>검색 키워드</label>
                  <input type="text" value={addForm.keyword}
                    onChange={(e) => setAddForm((p) => ({ ...p, keyword: e.target.value }))}
                    placeholder={addForm.platform === "place" ? "예: 중문마사지" : "예: 에어컨 청소"}
                    className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>추적 방식</label>
                  <div className="flex gap-1">
                    {addForm.platform === "place"
                      ? (["place_name", "place_id"] as const).map((t) => (
                          <button key={t} type="button" onClick={() => setAddForm((p) => ({ ...p, targetType: t }))}
                            className="flex-1 py-1 text-xs font-semibold rounded-lg border transition-all"
                            style={{
                              background:  addForm.targetType === t ? "rgba(139,92,246,0.12)" : "#FFFFFF",
                              borderColor: addForm.targetType === t ? "#8B5CF6" : "#E9EBEF",
                              color:       addForm.targetType === t ? "#8B5CF6" : "#94A3B8",
                            }}>
                            {t === "place_name" ? "업체명" : "ID"}
                          </button>
                        ))
                      : (["mall", "product_name", "nstore_id", "product_id"] as const).map((t) => (
                          <button key={t} type="button" onClick={() => setAddForm((p) => ({ ...p, targetType: t }))}
                            className="flex-1 py-1 text-xs font-semibold rounded-lg border transition-all"
                            style={{
                              background:  addForm.targetType === t ? "rgba(49,130,246,0.12)" : "#FFFFFF",
                              borderColor: addForm.targetType === t ? "#3182F6" : "#E9EBEF",
                              color:       addForm.targetType === t ? "#3182F6" : "#94A3B8",
                            }}>
                            {t === "mall" ? "몰명" : t === "product_name" ? "상품명" : t === "nstore_id" ? "스마트스토어" : "카탈로그ID"}
                          </button>
                        ))
                    }
                  </div>
                </div>
              </div>

              {/* 추적값 */}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>{TARGET_TYPE_LABELS[addForm.targetType]}</label>
                <input type="text" value={addForm.targetValue}
                  onChange={(e) => setAddForm((p) => ({ ...p, targetValue: e.target.value }))}
                  placeholder={
                    addForm.targetType === "place_name"   ? "예: 중문더타이 중문점" :
                    addForm.targetType === "place_id"     ? "예: 1234567890" :
                    addForm.targetType === "mall"         ? "예: 중문더타이" :
                    addForm.targetType === "nstore_id"    ? "예: 6506046581 (스마트스토어 URL의 숫자)" :
                    addForm.targetType === "product_id"   ? "예: 84431678761 (11자리 카탈로그 ID)" : "예: 마사지"
                  }
                  className={inputCls} style={inputStyle} />
              </div>

              {/* 시작/종료 날짜 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>시작 날짜</label>
                  <input type="date" value={addForm.startDate}
                    onChange={(e) => setAddForm((p) => ({ ...p, startDate: e.target.value }))}
                    className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>종료 날짜</label>
                  <input type="date" value={addForm.endDate}
                    onChange={(e) => setAddForm((p) => ({ ...p, endDate: e.target.value }))}
                    className={inputCls} style={inputStyle} />
                </div>
              </div>

              {addError && <p className="text-xs" style={{ color: "#EF4444" }}>{addError}</p>}
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowAdd(false)} className="text-xs px-3 py-1.5 rounded-lg border" style={{ borderColor: "#E9EBEF", color: "#64748B" }}>취소</button>
                <button type="submit" disabled={saving} className="text-xs px-3 py-1.5 rounded-lg text-white font-semibold disabled:opacity-50" style={{ background: "#3182F6" }}>
                  {saving ? "추가 중..." : "추가"}
                </button>
              </div>
            </form>
          )}

          {/* 수정 폼 */}
          {editingId && (
            <form onSubmit={handleEditSave} className="p-4 rounded-xl space-y-3" style={{ background: "#F0F7FF", border: "1px solid #BFDBFE" }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold" style={{ color: "#3182F6" }}>키워드 수정</span>
                <button type="button" onClick={closeEdit} className="p-1 rounded-lg hover:bg-blue-100 transition-colors">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>

              {/* 플랫폼 */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>플랫폼</label>
                <div className="flex gap-2">
                  {(["place", "shopping"] as const).map((p) => {
                    const meta = PLATFORM_META[p];
                    const isActive = editForm.platform === p;
                    return (
                      <button key={p} type="button"
                        onClick={() => setEditForm((prev) => ({ ...prev, platform: p, targetType: p === "place" ? "place_name" : "mall", targetValue: "" }))}
                        className="flex-1 py-1.5 text-xs font-bold rounded-xl border transition-all"
                        style={{ background: isActive ? meta.bg : "#FFFFFF", borderColor: isActive ? meta.color : "#E9EBEF", color: isActive ? meta.color : "#94A3B8" }}>
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 키워드 + 추적 방식 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>검색 키워드</label>
                  <input type="text" value={editForm.keyword}
                    onChange={(e) => setEditForm((p) => ({ ...p, keyword: e.target.value }))}
                    className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>추적 방식</label>
                  <div className="flex gap-1">
                    {editForm.platform === "place"
                      ? (["place_name", "place_id"] as const).map((t) => (
                          <button key={t} type="button" onClick={() => setEditForm((p) => ({ ...p, targetType: t }))}
                            className="flex-1 py-1 text-xs font-semibold rounded-lg border transition-all"
                            style={{ background: editForm.targetType === t ? "rgba(139,92,246,0.12)" : "#FFFFFF", borderColor: editForm.targetType === t ? "#8B5CF6" : "#E9EBEF", color: editForm.targetType === t ? "#8B5CF6" : "#94A3B8" }}>
                            {t === "place_name" ? "업체명" : "ID"}
                          </button>
                        ))
                      : (["mall", "product_name", "nstore_id", "product_id"] as const).map((t) => (
                          <button key={t} type="button" onClick={() => setEditForm((p) => ({ ...p, targetType: t }))}
                            className="flex-1 py-1 text-xs font-semibold rounded-lg border transition-all"
                            style={{ background: editForm.targetType === t ? "rgba(49,130,246,0.12)" : "#FFFFFF", borderColor: editForm.targetType === t ? "#3182F6" : "#E9EBEF", color: editForm.targetType === t ? "#3182F6" : "#94A3B8" }}>
                            {t === "mall" ? "몰명" : t === "product_name" ? "상품명" : t === "nstore_id" ? "스마트스토어" : "카탈로그ID"}
                          </button>
                        ))
                    }
                  </div>
                </div>
              </div>

              {/* 추적값 */}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>{TARGET_TYPE_LABELS[editForm.targetType]}</label>
                <input type="text" value={editForm.targetValue}
                  onChange={(e) => setEditForm((p) => ({ ...p, targetValue: e.target.value }))}
                  className={inputCls} style={inputStyle} />
              </div>

              {/* 시작/종료 날짜 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>시작 날짜</label>
                  <input type="date" value={editForm.startDate}
                    onChange={(e) => setEditForm((p) => ({ ...p, startDate: e.target.value }))}
                    className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>종료 날짜</label>
                  <input type="date" value={editForm.endDate}
                    onChange={(e) => setEditForm((p) => ({ ...p, endDate: e.target.value }))}
                    className={inputCls} style={inputStyle} />
                </div>
              </div>

              {editError && <p className="text-xs" style={{ color: "#EF4444" }}>{editError}</p>}
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={closeEdit} className="text-xs px-3 py-1.5 rounded-lg border" style={{ borderColor: "#E9EBEF", color: "#64748B" }}>취소</button>
                <button type="submit" disabled={editSaving} className="text-xs px-3 py-1.5 rounded-lg text-white font-semibold disabled:opacity-50" style={{ background: "#3182F6" }}>
                  {editSaving ? "저장 중..." : "저장"}
                </button>
              </div>
            </form>
          )}

          {loading ? (
            <div className="py-8 text-center text-xs" style={{ color: "#94A3B8" }}>불러오는 중...</div>
          ) : trackers.length === 0 ? (
            <div className="py-8 text-center rounded-xl" style={{ background: "#F8FAFC" }}>
              <p className="text-xs mb-1" style={{ color: "#94A3B8" }}>추적 중인 키워드가 없습니다.</p>
              <button onClick={() => setShowAdd(true)} className="text-xs font-semibold" style={{ color: "#3182F6" }}>+ 키워드 추가</button>
            </div>
          ) : (
            <>
              {/* 날짜별 순위 테이블 */}
              <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "#E2E8F0" }}>
                <table className="text-xs border-collapse" style={{ minWidth: "max-content", width: "100%" }}>
                  <thead>
                    <tr style={{ background: "#191F28", color: "#FFFFFF" }}>
                      <th className="border px-3 py-2 text-left font-bold whitespace-nowrap sticky left-0 z-10"
                        style={{ borderColor: "#334155", background: "#191F28", minWidth: 90 }}>잔여일</th>
                      <th className="border px-3 py-2 text-left font-semibold whitespace-nowrap sticky left-[90px] z-10"
                        style={{ borderColor: "#334155", background: "#191F28", minWidth: 160 }}>
                        {remaining === null ? "—" : remaining < 0 ? `${Math.abs(remaining)}일 초과` : `${remaining}일`}
                      </th>
                      {DATES.map((d) => (
                        <th key={d} className="border px-2 py-2 font-medium whitespace-nowrap text-center"
                          style={{ borderColor: "#334155", color: "#94A3B8", minWidth: 44 }}>
                          {fmtDate(d)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {trackers.map((t, idx) => (
                      <tr key={t.id} style={{ background: idx % 2 === 0 ? "#FFFFFF" : "#FAFBFC" }}>
                        {/* 레이블 */}
                        <td className="border px-3 py-2 font-bold whitespace-nowrap sticky left-0 z-10"
                          style={{ borderColor: "#E2E8F0", background: idx % 2 === 0 ? "#FFFFFF" : "#FAFBFC", color: "#191F28", minWidth: 90 }}>
                          {idx === 0 ? "메인 키워드" : `서브 키워드 ${idx}`}
                        </td>
                        {/* 키워드명 + 버튼 */}
                        <td className="border px-3 py-2 whitespace-nowrap sticky left-[90px] z-10"
                          style={{ borderColor: "#E2E8F0", background: idx % 2 === 0 ? "#FFFFFF" : "#FAFBFC", minWidth: 160 }}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                {(() => {
                                  const meta = PLATFORM_META[t.platform] ?? PLATFORM_META.shopping;
                                  return (
                                    <span className="text-xs px-1.5 py-0.5 rounded font-bold flex-shrink-0"
                                      style={{ background: meta.bg, color: meta.color }}>
                                      {meta.label}
                                    </span>
                                  );
                                })()}
                                <span className="font-semibold text-xs truncate" style={{ color: "#191F28" }}>{t.keyword}</span>
                              </div>
                              <div className="text-xs truncate" style={{ color: "#94A3B8" }}>
                                {t.targetValue}
                                {(t.startDate || t.endDate) && (
                                  <span className="ml-1">
                                    · {t.startDate ? fmtDate(t.startDate) : "?"}~{t.endDate ? fmtDate(t.endDate) : "?"}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button onClick={() => checkOne(t.id)} disabled={checking === t.id}
                                title="지금 조회"
                                className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 transition-colors">
                                {checking === t.id
                                  ? <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3182F6" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                                  : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-.08-4" /></svg>
                                }
                              </button>
                              <button onClick={() => openEdit(t)} title="수정"
                                className="p-1.5 rounded-lg transition-colors"
                                style={{ background: editingId === t.id ? "rgba(49,130,246,0.15)" : "rgba(49,130,246,0.08)" }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(49,130,246,0.18)")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = editingId === t.id ? "rgba(49,130,246,0.15)" : "rgba(49,130,246,0.08)")}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3182F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                              </button>
                              <button onClick={() => { if (window.confirm("정말 삭제하시겠습니까?")) deleteTracker(t.id); }} title="삭제"
                                className="p-1.5 rounded-lg transition-colors"
                                style={{ background: "rgba(239,68,68,0.08)" }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.18)")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.08)")}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round">
                                  <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </td>
                        {/* 날짜별 순위 셀 */}
                        {DATES.map((d) => (
                          <RankCell
                            key={d}
                            rank={getRankOnDate(t, d)}
                            inPeriod={inRange(t, d)}
                            projectType={projectType}
                          />
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 추이 차트 */}
              <div className="pt-1">
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#94A3B8" }} axisLine={false} tickLine={false} interval={1} />
                    <YAxis reversed domain={["dataMin - 2", "dataMax + 2"]}
                      tick={{ fontSize: 9, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={32}
                      tickFormatter={(v: number) => v >= 301 ? "—" : String(v)} />
                    <Tooltip
                      contentStyle={{ background: "#191F28", border: "none", borderRadius: 8, fontSize: 11, color: "#fff" }}
                      formatter={(v: unknown, name: unknown) => {
                        const n = Number(v);
                        return [n >= 301 ? "100위 밖" : `${n}위`, String(name)] as [string, string];
                      }}
                    />
                    {trackers.length > 1 && <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />}
                    {trackers.map((t, idx) => (
                      <Line key={t.id} type="monotone" dataKey={t.keyword}
                        stroke={KEYWORD_COLORS[idx % KEYWORD_COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 3, fill: KEYWORD_COLORS[idx % KEYWORD_COLORS.length] }}
                        activeDot={{ r: 5 }}
                        connectNulls={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
