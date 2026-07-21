"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProjectModal, { ProjectFormData, preloadModalInit, prefetchProject, invalidateProjectCache } from "@/components/projects/ProjectModal";
import ClientModal, { ClientFormData } from "@/components/clients/ClientModal";
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, ReferenceLine,
} from "recharts";

// ── 타입 ──────────────────────────────────────────────────────────────────────

interface WorkCheckRow {
  id: string;
  projectId: string;
  revenueRowId: string | null;
  assignee: string | null;
  productName: string | null;
  quantity: number | null;
  completedQty: number | null;
  supplyPrice: number | null;
  tax: number | null;
  total: number | null;
  workCompleted: boolean | null;
  workStartDate: string | null;
  workEndDate: string | null;
  settingDate: string | null;
  campaignName: string | null;
  groupName: string;
  groupId: string;
  assignedTeam: string | null;
}

interface RevenueStats {
  monthly: Array<Record<string, string | number>>;
  yearTotal: Record<string, number>;
  yearKpi: Record<string, number>;
  currentMonth: Record<string, number>;
  currentKpi: Record<string, number>;
  prevMonth: Record<string, number>;
  monthlyCosts: number[];
  teams: string[];
  year: number;
}

interface ProjectGroup {
  id: string;
  name: string;
  clientId: string | null;
  assignedTeam: string | null;
  assignedPerson: string | null;
  status: string;
  notes: string | null;
  campaignCount: number;
  activeCampaignCount: number;
  createdAt: string;
  // 진행중 캠페인 집계
  activeProjectType: string | null;
  activeProduct: string | null;
  activeStartDate: string | null;
  activeEndDate: string | null;
  activeContractAmount: number | null;
  totalContractAmount:  number | null;
  activeDaysRemaining: number | null;
  activeWorkDaysRemaining: number | null;
  revenueTotal: number;
  revenueInvoiced: number;
  revenueConfirmed: number;
  revenuePending: number;
  costTotal: number;
  costApproved: number;
  costPending: number;
  campaigns?: Campaign[];
}

interface Campaign {
  id: string;
  campaignName: string;
  projectType: string | null;
  product: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  contractAmount: number | null;
  kpiSupply: number | null;
  kpiTax: number | null;
  isExtended: boolean | null;
  placeLink: string | null;
  assignedTeam: string | null;
  assignedPerson: string | null;
  clientId: string | null;
  advertiser: string | null;
  projectGroupId: string | null;
  daysRemaining: number | null;
  revenueTotal: number;
  revenueInvoiced: number;
  revenueConfirmed: number;
  revenuePending: number;
  costTotal: number;
  costApproved: number;
  costPending: number;
  notes: string | null;
}

interface GroupFormData {
  name: string;
  assignedTeam: string;
  assignedPerson: string;
  status: "진행" | "종료";
  notes: string;
}

// ── 유틸 ──────────────────────────────────────────────────────────────────────

function wonFmt(n: number | null | undefined) {
  if (!n) return "—";
  return `₩${n.toLocaleString()}`;
}

function toCampaignFormData(c: Campaign): ProjectFormData {
  return {
    id:             c.id,
    status:         (c.status === "리드" ? "진행" : c.status) as "진행" | "종료",
    campaignName:   c.campaignName,
    clientId:       c.clientId ?? undefined,
    projectType:    c.projectType ?? "",
    advertiser:     c.advertiser ?? "",
    product:        c.product ?? "",
    assignedTeam:   c.assignedTeam ?? "",
    assignedPerson: c.assignedPerson ?? "",
    contractAmount: c.contractAmount != null ? String(c.contractAmount) : "",
    kpiSupply:      c.kpiSupply != null ? String(c.kpiSupply) : "",
    kpiTax:         c.kpiTax    != null ? String(c.kpiTax)    : "",
    startDate:      c.startDate ?? "",
    endDate:        c.endDate ?? "",
    placeLink:      c.placeLink ?? "",
    notes:          c.notes ?? "",
    isExtended:     c.isExtended ?? false,
  };
}

// ── 소형 배지 컴포넌트 ──────────────────────────────────────────────────────

function DaysBadge({ days }: { days: number | null }) {
  if (days === null) return <span style={{ color: "#CBD5E1" }}>—</span>;
  const color = days < 0 ? "#94A3B8" : days <= 1 ? "#EF4444" : days <= 3 ? "#F97316" : days <= 7 ? "#EAB308" : "#3182F6";
  const label = days < 0 ? "종료됨" : days === 0 ? "D-0" : `D-${days}`;
  return <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: `${color}18`, color }}>{label}</span>;
}

function RevenueSalesBadge({ total, confirmed, pending, invoiced }: { total: number; confirmed: number; pending: number; invoiced: number }) {
  if (total === 0) return <span className="text-xs" style={{ color: "#CBD5E1" }}>—</span>;
  if (confirmed === 0 && pending === 0 && invoiced === 0) {
    return (
      <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{ background: "#F1F5F9", color: "#94A3B8" }}>
        미요청 {total}
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {confirmed > 0 && (
        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{ background: "rgba(16,185,129,0.12)", color: "#10B981" }}>
          입금확인 {confirmed}
        </span>
      )}
      {pending > 0 && (
        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{ background: "rgba(234,179,8,0.12)", color: "#CA8A04" }}>
          대기 {pending}
        </span>
      )}
    </div>
  );
}

function TaxInvoiceBadge({ invoiced }: { invoiced: number }) {
  if (invoiced === 0) return <span className="text-xs" style={{ color: "#CBD5E1" }}>—</span>;
  return (
    <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{ background: "rgba(5,150,105,0.12)", color: "#059669" }}>
      계산서발행 {invoiced}
    </span>
  );
}

function CostBadge({ total, approved, pending }: { total: number; approved: number; pending: number }) {
  if (total === 0) return <span className="text-xs" style={{ color: "#CBD5E1" }}>—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {approved > 0 && (
        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{ background: "rgba(49,130,246,0.12)", color: "#3182F6" }}>
          입금완료 {approved}
        </span>
      )}
      {pending > 0 && (
        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{ background: "rgba(234,179,8,0.12)", color: "#CA8A04" }}>
          대기 {pending}
        </span>
      )}
      {approved === 0 && pending === 0 && (
        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{ background: "#F1F5F9", color: "#94A3B8" }}>
          미요청 {total}
        </span>
      )}
    </div>
  );
}

// ── 프로젝트 그룹 생성/수정 모달 ──────────────────────────────────────────────

function GroupModal({ initial, onClose, onSaved }: {
  initial: (ProjectGroup & { id?: string }) | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(initial?.id);
  const [form, setForm] = useState<GroupFormData>({
    name:           initial?.name ?? "",
    assignedTeam:   initial?.assignedTeam ?? "",
    assignedPerson: initial?.assignedPerson ?? "",
    status:         (initial?.status as "진행" | "종료") ?? "진행",
    notes:          initial?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("프로젝트명은 필수입니다."); return; }
    setSaving(true); setError(null);
    const res = await fetch(
      isEdit ? `/api/project-groups/${initial!.id}` : "/api/project-groups",
      { method: isEdit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }
    );
    if (!res.ok) { setSaving(false); setError("저장에 실패했습니다."); return; }
    onSaved();
  }

  const inp = "w-full px-2.5 py-1.5 text-xs rounded-lg outline-none border transition-colors focus:border-[#3182F6]";
  const ist = { background: "#F8FAFC", borderColor: "#E9EBEF", color: "#191F28" };
  const lbl = "block text-xs font-semibold mb-1";
  const lst = { color: "#64748B" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(22,31,51,0.5)", backdropFilter: "blur(2px)" }}
>
      <div className="w-full max-w-md rounded-2xl p-6 space-y-4" style={{ background: "#FFFFFF", border: "1px solid #E9EBEF" }}>
        <h2 className="text-base font-bold" style={{ color: "#191F28" }}>{isEdit ? "프로젝트 수정" : "새 프로젝트 추가"}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className={lbl} style={lst}>프로젝트명 (광고주명) *</label>
            <input type="text" value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="예) 한알 피부과" className={inp} style={ist} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl} style={lst}>담당팀</label>
              <input type="text" value={form.assignedTeam} onChange={(e) => setForm(p => ({ ...p, assignedTeam: e.target.value }))}
                placeholder="영업 1팀" className={inp} style={ist} />
            </div>
            <div>
              <label className={lbl} style={lst}>담당자</label>
              <input type="text" value={form.assignedPerson} onChange={(e) => setForm(p => ({ ...p, assignedPerson: e.target.value }))}
                placeholder="홍길동" className={inp} style={ist} />
            </div>
          </div>
          <div>
            <label className={lbl} style={lst}>상태</label>
            <select value={form.status} onChange={(e) => setForm(p => ({ ...p, status: e.target.value as "진행" | "종료" }))}
              className={inp} style={ist}>
              <option value="진행">진행</option>
              <option value="종료">종료</option>
            </select>
          </div>
          <div>
            <label className={lbl} style={lst}>메모</label>
            <textarea value={form.notes} onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))}
              rows={2} className={`${inp} resize-none`} style={ist} placeholder="특이사항 등" />
          </div>
          {error && <p className="text-xs" style={{ color: "#EF4444" }}>{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-xl border" style={{ borderColor: "#E9EBEF", color: "#64748B" }}>취소</button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 text-xs font-semibold rounded-xl text-white disabled:opacity-50" style={{ background: "#3182F6" }}>
              {saving ? "저장 중..." : isEdit ? "수정" : "추가"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── 캠페인 행 ──────────────────────────────────────────────────────────────────

function CampaignRow({ c, index, onEdit, onDelete, onCopy, deleting, copying }: {
  c: Campaign;
  index: number;
  onEdit: (c: Campaign) => void;
  onDelete: (id: string) => void;
  onCopy: (id: string) => void;
  deleting: string | null;
  copying: string | null;
}) {
  return (
    <tr
      className="border-t group cursor-pointer"
      style={{ borderColor: "#F1F5F9", background: "rgba(49,130,246,0.015)" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(49,130,246,0.05)"; prefetchProject(c.id); }}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(49,130,246,0.015)")}
      onClick={() => onEdit(c)}
    >
      {/* 인덴트 + 캠페인 번호 */}
      <td className="pl-12 pr-4 py-3" style={{ color: "#191F28" }}>
        <div className="flex items-center gap-2">
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ flexShrink: 0, color: "#CBD5E1" }}>
            <path d="M1 1 L1 7 L7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <span className="text-sm font-medium" style={{ color: "#64748B" }}>{c.campaignName || `캠페인 ${index + 1}`}</span>
          {c.isExtended && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-md"
              style={{ background: "rgba(99,102,241,0.1)", color: "#6366F1" }}>연장</span>
          )}
          {c.placeLink && (
            <a href={c.placeLink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
              className="opacity-0 group-hover:opacity-100 transition-opacity" title="플레이스 링크">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#3182F6" strokeWidth="2" strokeLinecap="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </a>
          )}
        </div>
      </td>
      {/* 유형 */}
      <td className="px-4 py-3">
        {c.projectType ? (
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap inline-block" style={{
            background: c.projectType === "관리형" ? "rgba(49,130,246,0.1)" : "rgba(139,92,246,0.1)",
            color:      c.projectType === "관리형" ? "#3182F6" : "#8B5CF6",
          }}>{c.projectType}</span>
        ) : <span style={{ color: "#CBD5E1" }}>—</span>}
      </td>
      {/* 상품 */}
      <td className="px-4 py-3">
        {c.product ? (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap inline-block"
            style={{ background: "rgba(49,130,246,0.08)", color: "#3182F6" }}>{c.product}</span>
        ) : <span style={{ color: "#CBD5E1" }}>—</span>}
      </td>
      {/* 계약기간 */}
      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "#94A3B8" }}>
        {c.startDate || c.endDate ? `${c.startDate ?? "?"} ~ ${c.endDate ?? "?"}` : "—"}
      </td>
      {/* 잔여일 */}
      <td className="px-4 py-3"><DaysBadge days={c.daysRemaining} /></td>
      {/* 계약금액 */}
      <td className="px-4 py-3 text-xs font-semibold" style={{ color: "#10B981" }}>{wonFmt(c.contractAmount)}</td>
      {/* 매출 */}
      <td className="px-4 py-3"><RevenueSalesBadge total={c.revenueTotal} confirmed={c.revenueConfirmed} pending={c.revenuePending} invoiced={c.revenueInvoiced} /></td>
      {/* 세금계산서 */}
      <td className="px-4 py-3"><TaxInvoiceBadge invoiced={c.revenueInvoiced} /></td>
      {/* 매입 */}
      <td className="px-4 py-3"><CostBadge total={c.costTotal} approved={c.costApproved} pending={c.costPending} /></td>
      {/* 상태 */}
      <td className="px-4 py-3">
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap inline-block" style={{
          background: c.status === "종료" ? "#F1F5F9" : "rgba(49,130,246,0.1)",
          color:      c.status === "종료" ? "#64748B" : "#3182F6",
        }}>{c.status === "종료" ? "종료" : "진행중"}</span>
      </td>
      {/* 복사 + 삭제 */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onCopy(c.id); }}
            disabled={copying === c.id}
            className="whitespace-nowrap px-2.5 py-1 rounded-lg text-xs font-semibold disabled:opacity-40 transition-colors"
            style={{ background: "rgba(49,130,246,0.12)", color: "#3182F6" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#3182F6"; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(49,130,246,0.12)"; (e.currentTarget as HTMLElement).style.color = "#3182F6"; }}
          >
            복사
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
            disabled={deleting === c.id}
            className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-40"
            style={{ background: "rgba(239,68,68,0.08)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.18)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.08)")}
            title="캠페인 삭제"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── 팀별 색상 ────────────────────────────────────────────────────────────────

const TEAM_COLORS: Record<string, string> = {
  "경영":    "#F59E0B",
  "영업 1팀": "#3182F6",
  "영업 2팀": "#10B981",
};
function teamColor(t: string) { return TEAM_COLORS[t] ?? "#8B5CF6"; }

function wonShort(n: number) {
  return `₩${n.toLocaleString()}`;
}

// ── 달성률 링 ────────────────────────────────────────────────────────────────

function AchievementRing({ rate, color, size = 72 }: { rate: number; color: string; size?: number }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(rate / 100, 1);
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F1F5F9" strokeWidth={7} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={rate >= 100 ? "#10B981" : rate >= 70 ? color : rate >= 40 ? "#EAB308" : "#EF4444"}
        strokeWidth={7} strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - pct)}
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
    </svg>
  );
}

// ── 월별 매출 KPI 섹션 ────────────────────────────────────────────────────────

const MONTHS_KO = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

function RevenueKpiSection({
  stats, teamFilter, onReload, criteria, onCriteriaChange,
}: {
  stats: RevenueStats;
  teamFilter: string | null;
  onReload: () => void;
  criteria: "캠페인 시작날짜" | "계산서날짜" | "통장";
  onCriteriaChange: (c: "캠페인 시작날짜" | "계산서날짜" | "통장") => void;
}) {
  const year = stats.year;
  const thisMonthNum = new Date().getMonth() + 1;

  const displayTeams = teamFilter
    ? stats.teams.filter((t) => t === teamFilter)
    : stats.teams;

  // KPI 편집 모달 상태
  const [editingKpi, setEditingKpi] = useState(false);
  // draft: { [team_month]: value }  예) "영업 1팀_3": "5000000"
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  // 상단 카드 기준 월 (기본: 이번 달) — 지나간 달만 선택 가능
  const [selectedMonth, setSelectedMonth] = useState(thisMonthNum);

  function openKpiEdit() {
    const d: Record<string, string> = {};
    for (const team of (displayTeams.length > 0 ? displayTeams : ["전체"])) {
      for (let m = 1; m <= 12; m++) {
        const key = `${team}_${m}`;
        const existing = stats.monthly[m - 1]?.[`kpi_${team}`];
        d[key] = existing ? Number(existing).toLocaleString("ko-KR") : "";
      }
    }
    setDraft(d);
    setEditingKpi(true);
  }

  async function saveKpi() {
    setSaving(true);
    const entries: { year: number; month: number; team: string; target: number }[] = [];
    for (const [key, val] of Object.entries(draft)) {
      const [team, monthStr] = key.split(/_(?=\d+$)/);
      const month = parseInt(monthStr);
      const target = parseInt(val.replace(/,/g, "")) || 0;
      if (team && month) entries.push({ year, month, team, target });
    }
    await fetch("/api/kpi", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });
    setSaving(false);
    setEditingKpi(false);
    // 캐시 무효화 후 재로드 — 캐시가 살아있으면 새 KPI가 반영되지 않음
    _statsCacheMap.clear();
    onReload();
  }

  // 차트 데이터 (이번 달까지)
  const chartData = stats.monthly
    .filter((_, i) => i < thisMonthNum)
    .map((row, i) => {
      const entry: Record<string, string | number> = { label: MONTHS_KO[i] };
      for (const team of displayTeams) {
        entry[team] = (row[team] as number) ?? 0;
        entry[`kpi_${team}`] = (row[`kpi_${team}`] as number) ?? 0;
      }
      entry.total    = (row.total  as number) ?? 0;
      entry.kpiTotal = (row.kpiTotal as number) ?? 0;
      entry.profit   = (row.profit as number) ?? 0;
      return entry;
    });

  // 선택한 월(및 직전 월)의 데이터 행
  const selRow  = stats.monthly[selectedMonth - 1] ?? {};
  const prevRow = selectedMonth >= 2 ? stats.monthly[selectedMonth - 2] : null;

  const totalCurrentMonth = displayTeams.reduce((s, t) => s + ((selRow[t] as number) ?? 0), 0);
  const totalKpiMonth = displayTeams.reduce((s, t) => s + ((selRow[`kpi_${t}`] as number) ?? 0), 0) || ((selRow.kpiTotal as number) ?? 0);
  // 누적 카드는 연간 목표 대비 진척률 (월 선택과 무관)
  const totalYearRevenue = displayTeams.reduce((s, t) => s + (stats.yearTotal[t] ?? 0), 0);
  const totalYearKpi = displayTeams.reduce((s, t) => s + (stats.yearKpi[t] ?? 0), 0);
  const totalPrevMonth = prevRow ? displayTeams.reduce((s, t) => s + ((prevRow[t] as number) ?? 0), 0) : 0;

  const monthRate = totalKpiMonth > 0 ? (totalCurrentMonth / totalKpiMonth) * 100 : null;
  const yearRate  = totalYearKpi  > 0 ? (totalYearRevenue  / totalYearKpi)  * 100 : null;
  const mom = totalPrevMonth > 0 ? ((totalCurrentMonth - totalPrevMonth) / totalPrevMonth) * 100 : null;

  const rateColor = (r: number | null) => r === null ? "#94A3B8" : r >= 100 ? "#10B981" : r >= 70 ? "#3182F6" : r >= 40 ? "#EAB308" : "#EF4444";

  return (
    <>
      <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E9EBEF" }}>
        {/* 헤더 */}
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: "#F1F5F9" }}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold" style={{ color: "#191F28" }}>
              {teamFilter ? `${teamFilter} ` : ""}매출 KPI
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(49,130,246,0.1)", color: "#3182F6" }}>
              {year}년
            </span>
            {/* 월 선택 (상단 카드 기준) */}
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="text-xs font-semibold rounded-full px-2.5 py-0.5 border cursor-pointer outline-none"
              style={{ borderColor: "#E9EBEF", color: "#3182F6", background: "#fff" }}
              title="상단 카드 기준 월"
            >
              {MONTHS_KO.slice(0, thisMonthNum).map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
            {/* 기준 토글 */}
            <div className="flex gap-0.5 p-0.5 rounded-xl ml-2" style={{ background: "#F1F5F9" }}>
              {([
                { value: "캠페인 시작날짜", label: "캠페인 시작일" },
                { value: "계산서날짜",     label: "계산서 발행일" },
                { value: "통장",           label: "통장 기준" },
              ] as const).map(({ value, label }) => (
                <button key={value} onClick={() => onCriteriaChange(value)}
                  className="px-3 py-1 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: criteria === value ? "#fff" : "transparent",
                    color:      criteria === value ? "#191F28" : "#94A3B8",
                    boxShadow:  criteria === value ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  }}>
                  {label}
                </button>
              ))}
            </div>
            <span className="text-xs ml-1" style={{ color: "#94A3B8" }}>
              {criteria === "통장" ? "매출: 입금 승인일 · 매입: 승인일" : criteria === "계산서날짜" ? "매출: 계산서 발행일 · 매입: 계산서 발행일" : "매출: 캠페인 시작일 · 매입: 작업시작일"}
            </span>
          </div>
          <button
            onClick={openKpiEdit}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all hover:bg-slate-50"
            style={{ borderColor: "#E9EBEF", color: "#64748B" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            KPI 설정
          </button>
        </div>

        <div className="px-6 py-5">
          <div className="flex gap-6 items-start">

            {/* 왼쪽: KPI 달성 카드들 */}
            <div className="flex flex-col gap-3 shrink-0" style={{ minWidth: 260 }}>

              {/* 이번 달 달성률 */}
              <div className="rounded-xl p-4" style={{ background: "#F8FAFC", border: "1px solid #E9EBEF" }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium mb-0.5" style={{ color: "#94A3B8" }}>{year}년 {selectedMonth}월 매출</p>
                    <p className="text-2xl font-bold" style={{ color: "#191F28" }}>₩{totalCurrentMonth.toLocaleString()}</p>
                    {totalKpiMonth > 0 && (
                      <p className="text-xs mt-0.5" style={{ color: "#64748B" }}>
                        목표 ₩{totalKpiMonth.toLocaleString()}
                      </p>
                    )}
                    {mom !== null && (
                      <p className="text-xs mt-1 font-semibold" style={{ color: mom >= 0 ? "#10B981" : "#EF4444" }}>
                        {mom >= 0 ? "▲" : "▼"} 전월 대비 {Math.abs(Math.round(mom))}%
                      </p>
                    )}
                  </div>
                  {monthRate !== null && (
                    <div className="relative flex items-center justify-center" style={{ width: 72, height: 72 }}>
                      <AchievementRing rate={monthRate} color={teamFilter ? teamColor(teamFilter) : "#3182F6"} />
                      <span className="absolute text-xs font-bold" style={{ color: rateColor(monthRate) }}>
                        {Math.round(monthRate)}%
                      </span>
                    </div>
                  )}
                </div>
                {monthRate !== null && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs mb-1" style={{ color: "#94A3B8" }}>
                      <span>달성률</span>
                      <span style={{ color: rateColor(monthRate), fontWeight: 700 }}>{Math.round(monthRate)}%</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: "#E9EBEF" }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(monthRate, 100)}%`, background: rateColor(monthRate) }} />
                    </div>
                  </div>
                )}
              </div>

              {/* 연 누적 달성률 */}
              <div className="rounded-xl p-4" style={{ background: "#F8FAFC", border: "1px solid #E9EBEF" }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium mb-0.5" style={{ color: "#94A3B8" }}>{year}년 누적 매출</p>
                    <p className="text-xl font-bold" style={{ color: "#3182F6" }}>₩{totalYearRevenue.toLocaleString()}</p>
                    {totalYearKpi > 0 && (
                      <p className="text-xs mt-0.5" style={{ color: "#64748B" }}>목표 ₩{totalYearKpi.toLocaleString()}</p>
                    )}
                  </div>
                  {yearRate !== null && (
                    <div className="relative flex items-center justify-center" style={{ width: 64, height: 64 }}>
                      <AchievementRing rate={yearRate} color="#3182F6" size={64} />
                      <span className="absolute text-xs font-bold" style={{ color: rateColor(yearRate) }}>
                        {Math.round(yearRate)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 팀별 이번 달 달성률 */}
              {displayTeams.length > 1 && (
                <div className="rounded-xl p-4 space-y-3" style={{ background: "#F8FAFC", border: "1px solid #E9EBEF" }}>
                  <p className="text-xs font-semibold" style={{ color: "#94A3B8" }}>팀별 달성률</p>
                  {displayTeams.map((team) => {
                    const actual = (selRow[team] as number) ?? 0;
                    const kpi = (selRow[`kpi_${team}`] as number) ?? 0;
                    const rate = kpi > 0 ? (actual / kpi) * 100 : null;
                    return (
                      <div key={team}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold" style={{ color: teamColor(team) }}>{team}</span>
                          <div className="text-right">
                            <span className="text-xs font-bold" style={{ color: "#191F28" }}>₩{actual.toLocaleString()}</span>
                            {rate !== null && (
                              <span className="text-xs font-bold ml-2" style={{ color: rateColor(rate) }}>{Math.round(rate)}%</span>
                            )}
                          </div>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden" style={{ background: "#E9EBEF" }}>
                          <div className="h-full rounded-full transition-all" style={{
                            width: `${rate !== null ? Math.min(rate, 100) : (totalCurrentMonth > 0 ? (actual / totalCurrentMonth) * 100 : 0)}%`,
                            background: rate !== null ? rateColor(rate) : teamColor(team),
                          }} />
                        </div>
                        {kpi > 0 && (
                          <p className="text-xs mt-0.5" style={{ color: "#CBD5E1" }}>목표 ₩{kpi.toLocaleString()}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 오른쪽: 월별 바 차트 */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold mb-3" style={{ color: "#94A3B8" }}>월별 매출 / 이익 추이</p>
              <ResponsiveContainer width="100%" height={210}>
                <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%"
                  onClick={(e) => {
                    const label = (e as { activeLabel?: string })?.activeLabel;
                    const idx = label ? MONTHS_KO.indexOf(label) : -1;
                    if (idx >= 0 && idx < thisMonthNum) setSelectedMonth(idx + 1);
                  }}
                  style={{ cursor: "pointer" }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => wonShort(v)} />
                  <Tooltip
                    cursor={{ fill: "rgba(49,130,246,0.04)" }}
                    content={({ active, payload, label: tooltipLabel }) => {
                      if (!active || !payload?.length) return null;
                      const kpiItems   = payload.filter((p) => String(p.name).startsWith("kpi_") || p.name === "kpiTotal");
                      const revItems   = payload.filter((p) => !String(p.name).startsWith("kpi_") && p.name !== "profit" && p.name !== "kpiTotal");
                      const profItems  = payload.filter((p) => p.name === "profit");
                      const ordered = [...kpiItems, ...revItems, ...profItems];
                      const labelFn = (key: string) => {
                        if (key === "total")    return "매출";
                        if (key === "profit")   return "영업이익";
                        if (key === "kpiTotal") return "매출 KPI";
                        if (key.startsWith("kpi_")) return `매출 KPI (${key.replace("kpi_", "")})`;
                        return key;
                      };
                      return (
                        <div style={{ background: "#191F28", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#fff", minWidth: 180 }}>
                          <p style={{ color: "rgba(255,255,255,0.55)", fontWeight: 600, marginBottom: 8 }}>{tooltipLabel}</p>
                          {ordered.map((p, i) => (
                            <p key={i} style={{ color: String(p.color) ?? "#fff", marginBottom: 4 }}>
                              {labelFn(String(p.name))} : ₩{Number(p.value).toLocaleString()}
                            </p>
                          ))}
                        </div>
                      );
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                    formatter={(v) => {
                      if (v === "total")  return "매출";
                      if (v === "profit") return "이익";
                      if (String(v).startsWith("kpi_")) return `KPI 목표 (${String(v).replace("kpi_", "")})`;
                      return v;
                    }}
                  />
                  <ReferenceLine y={0} stroke="#E2E8F0" />
                  {/* 선택한 월 표시 */}
                  <ReferenceLine x={MONTHS_KO[selectedMonth - 1]} stroke="#3182F6" strokeDasharray="2 3" strokeOpacity={0.45} />

                  {/* 매출 — 팀별 스택 또는 전체 */}
                  {displayTeams.length > 0
                    ? displayTeams.map((team, ti) => (
                        <Bar key={`rev_${team}`} dataKey={team} stackId="rev"
                          fill={teamColor(team)} name={team}
                          radius={ti === displayTeams.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
                      ))
                    : <Bar dataKey="total" fill="#3182F6" radius={[3, 3, 0, 0]} name="total" />
                  }

                  {/* 이익 바 */}
                  <Bar dataKey="profit" fill="#10B981" fillOpacity={0.85} radius={[3, 3, 0, 0]} name="profit" barSize={10} />

                  {/* KPI 목표 라인 */}
                  {displayTeams.length > 0
                    ? displayTeams.map((team) =>
                        chartData.some((d) => (d[`kpi_${team}`] as number) > 0) ? (
                          <Line key={`kpi_${team}`} type="monotone" dataKey={`kpi_${team}`}
                            stroke={teamColor(team)} strokeWidth={1.5} strokeDasharray="4 3"
                            dot={false} name={`kpi_${team}`} />
                        ) : null
                      )
                    : chartData.some((d) => (d.kpiTotal as number) > 0)
                        ? <Line type="monotone" dataKey="kpiTotal" stroke="#3182F6" strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="kpiTotal" />
                        : null
                  }
                </ComposedChart>
              </ResponsiveContainer>

              {/* 연간 팀별 요약 */}
              {displayTeams.length > 1 && (
                <div className="mt-3 flex flex-wrap gap-3">
                  {displayTeams.map((team) => {
                    const actual = stats.yearTotal[team] ?? 0;
                    const kpi = stats.yearKpi[team] ?? 0;
                    const rate = kpi > 0 ? Math.round((actual / kpi) * 100) : null;
                    return (
                      <div key={team} className="flex items-center gap-3 px-4 py-2.5 rounded-xl" style={{ background: `${teamColor(team)}10`, border: `1px solid ${teamColor(team)}30` }}>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: teamColor(team) }} />
                        <div>
                          <p className="text-xs font-semibold" style={{ color: teamColor(team) }}>{team}</p>
                          <p className="text-sm font-bold" style={{ color: "#191F28" }}>₩{actual.toLocaleString()}</p>
                          {kpi > 0 && (
                            <p className="text-xs" style={{ color: "#94A3B8" }}>목표 ₩{kpi.toLocaleString()}</p>
                          )}
                        </div>
                        {rate !== null && (
                          <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: `${rateColor(rate)}18`, color: rateColor(rate) }}>
                            {rate}%
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* KPI 설정 모달 */}
      {editingKpi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(22,31,51,0.5)", backdropFilter: "blur(2px)" }}>
          <div className="w-full rounded-2xl overflow-hidden" style={{ maxWidth: 700, background: "#FFFFFF", boxShadow: "0 20px 60px rgba(22,31,51,0.2)" }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "#F1F5F9" }}>
              <h2 className="text-sm font-bold" style={{ color: "#191F28" }}>KPI 목표 설정 — {year}년</h2>
              <button onClick={() => setEditingKpi(false)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="px-6 py-5 overflow-y-auto" style={{ maxHeight: "70vh" }}>
              {(displayTeams.length > 0 ? displayTeams : ["전체"]).map((team) => (
                <div key={team} className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: teamColor(team) }} />
                    <span className="text-sm font-bold" style={{ color: "#191F28" }}>{team}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {MONTHS_KO.map((mo, i) => {
                      const m = i + 1;
                      const key = `${team}_${m}`;
                      const isCurrentMonth = m === thisMonthNum;
                      return (
                        <div key={m}>
                          <label className="block text-xs font-semibold mb-1" style={{ color: isCurrentMonth ? teamColor(team) : "#64748B" }}>
                            {mo}{isCurrentMonth ? " ★" : ""}
                          </label>
                          <input
                            type="text"
                            value={draft[key] ?? ""}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^0-9]/g, "");
                              const formatted = raw ? Number(raw).toLocaleString("ko-KR") : "";
                              setDraft((p) => ({ ...p, [key]: formatted }));
                            }}
                            placeholder="0"
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg outline-none border transition-colors focus:border-[#3182F6]"
                            style={{
                              background: isCurrentMonth ? `${teamColor(team)}08` : "#F8FAFC",
                              borderColor: isCurrentMonth ? `${teamColor(team)}40` : "#E9EBEF",
                              color: "#191F28",
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t" style={{ borderColor: "#F1F5F9" }}>
              <button onClick={() => setEditingKpi(false)}
                className="px-4 py-2 text-sm font-medium rounded-xl border" style={{ borderColor: "#E9EBEF", color: "#64748B" }}>
                취소
              </button>
              <button onClick={saveKpi} disabled={saving}
                className="px-5 py-2 text-sm font-semibold rounded-xl text-white disabled:opacity-50"
                style={{ background: "#3182F6" }}>
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── 메인 ──────────────────────────────────────────────────────────────────────

const TEAM_ORDER = ["경영", "영업 1팀", "영업 2팀"];

/* ── 모듈 레벨 캐시 ── */
type GroupsData = { groups: ProjectGroup[]; workIncompleteCount: number };
let _groupsCache: { data: GroupsData; ts: number } | null = null;
let _groupsPending: Promise<GroupsData> | null = null;
const GROUPS_TTL = 30_000;

function fetchGroups(): Promise<GroupsData> {
  if (_groupsPending) return _groupsPending;
  _groupsPending = fetch("/api/projects-page")
    .then((r) => r.json())
    .then((d) => {
      const data: GroupsData = { groups: d.groups ?? [], workIncompleteCount: d.workIncompleteCount ?? 0 };
      _groupsCache = { data, ts: Date.now() };
      _groupsPending = null;
      return data;
    })
    .catch(() => { _groupsPending = null; return { groups: [], workIncompleteCount: 0 }; });
  return _groupsPending;
}

/* ── 전체 캠페인 배치 fetch (N개 개별 요청 → 1개 통합 요청) ── */
let _allCampaignsPending: Promise<void> | null = null;

function fetchAllCampaigns(): Promise<void> {
  if (_allCampaignsPending) return _allCampaignsPending;
  _allCampaignsPending = fetch("/api/projects-page/campaigns")
    .then((r) => r.json())
    .then((d: { campaignsByGroup?: Record<string, Campaign[]> }) => {
      const byGroup = d.campaignsByGroup ?? {};
      const now = Date.now();
      for (const [groupId, campaigns] of Object.entries(byGroup)) {
        _campaignCacheMap.set(groupId, { data: campaigns as Campaign[], ts: now });
        _campaignErrorMap.delete(groupId);
      }
      _allCampaignsPending = null;
    })
    .catch(() => { _allCampaignsPending = null; });
  return _allCampaignsPending;
}

// 모듈 로드 즉시 그룹·캠페인 병렬 선행 fetch
fetchGroups();
fetchAllCampaigns();

const _statsCacheMap = new Map<string, { data: RevenueStats; ts: number }>();
const STATS_TTL = 60_000;

/* ── 그룹별 캠페인 모듈 레벨 캐시 ── */
const _campaignCacheMap = new Map<string, { data: Campaign[]; ts: number }>();
const _campaignPendingMap = new Map<string, Promise<Campaign[]>>();
// 실패한 그룹 재시도 방지: groupId → 마지막 실패 시각
const _campaignErrorMap = new Map<string, number>();
// 빈 캐시 강제 재시도 방지: 무한루프 차단
const _campaignForceRetried = new Set<string>();
const CAMPAIGN_TTL = 30_000;
const CAMPAIGN_ERROR_TTL = 10_000; // 실패 후 10초 뒤 재시도

function fetchGroupCampaigns(groupId: string): Promise<Campaign[]> {
  const hit = _campaignCacheMap.get(groupId);
  if (hit && Date.now() - hit.ts < CAMPAIGN_TTL) return Promise.resolve(hit.data);
  const existing = _campaignPendingMap.get(groupId);
  if (existing) return existing;
  const p = fetch(`/api/project-groups/${groupId}`)
    .then(r => {
      // HTTP 에러(4xx/5xx)를 빈 배열로 캐싱하지 않도록 명시적으로 throw
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((d: { campaigns?: Campaign[] }) => {
      const campaigns = (d.campaigns ?? []) as Campaign[];
      _campaignCacheMap.set(groupId, { data: campaigns, ts: Date.now() });
      _campaignErrorMap.delete(groupId);
      _campaignPendingMap.delete(groupId);
      return campaigns;
    })
    .catch(err => {
      _campaignErrorMap.set(groupId, Date.now());
      _campaignPendingMap.delete(groupId);
      throw err;
    });
  _campaignPendingMap.set(groupId, p);
  return p;
}

function ProjectsInner() {
  const searchParams   = useSearchParams();
  const teamParam      = searchParams.get("team");
  const openParam      = searchParams.get("open");

  const teamParamRef = useRef(teamParam);
  teamParamRef.current = teamParam;

  const [groups,       setGroups]       = useState<ProjectGroup[]>(_groupsCache?.data.groups ?? []);
  const [loading,      setLoading]      = useState(!_groupsCache);
  const [modal,        setModal]        = useState<"create" | null>(null);
  const [editing,      setEditing]      = useState<ProjectGroup | null>(null);
  const [search,       setSearch]       = useState("");
  const [activeTab,    setActiveTab]    = useState<string>("전체");
  const [revenueStats, setRevenueStats]     = useState<RevenueStats | null>(null);
  const [statsCriteria, setStatsCriteria]   = useState<"캠페인 시작날짜" | "계산서날짜" | "통장">("캠페인 시작날짜");

  // 아코디언: 펼쳐진 그룹 ID 셋
  const [statusFilter, setStatusFilter] = useState<"전체" | "진행중" | "종료" | "D-7" | "D-3" | "D-1" | "WD-7" | "WD-3" | "WD-1">("전체");
  const [expanded, setExpanded]     = useState<Set<string>>(new Set());
  // 그룹별 캠페인 캐시
  const [campaignMap, setCampaignMap] = useState<Map<string, Campaign[]>>(new Map());
  // 그룹별 로딩 상태
  const [loadingGroups, setLoadingGroups] = useState<Set<string>>(new Set());

  // 캠페인 모달
  const [editCampaign,    setEditCampaign]    = useState<ProjectFormData | null>(null);
  const [activeCampGroup, setActiveCampGroup] = useState<string | null>(null);
  const [viewClient,      setViewClient]      = useState<ClientFormData | null>(null);
  const [deletingCamp,    setDeletingCamp]    = useState<string | null>(null);
  const [copyingCamp,     setCopyingCamp]     = useState<string | null>(null);
  const [addCampGroup,    setAddCampGroup]    = useState<string | null>(null);
  // 신규 프로젝트+캠페인 동시 생성 (GroupId 없이 ProjectModal 오픈)
  const [newProjectModal, setNewProjectModal] = useState(false);

  // 키워드 전체 업데이트
  const [kwUpdating, setKwUpdating] = useState(false);
  const [kwToast,    setKwToast]    = useState<{ msg: string; ok: boolean } | null>(null);

  async function updateAllKeywords() {
    if (kwUpdating) return;
    setKwUpdating(true);
    try {
      const res  = await fetch("/api/reports/rankings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await res.json();
      const succeeded = (data.results ?? []).filter((r: { error?: string }) => !r.error).length;
      const failed    = (data.results ?? []).filter((r: { error?: string }) => !!r.error).length;
      const total     = (data.results ?? []).length;
      if (total === 0) {
        setKwToast({ msg: "등록된 키워드가 없습니다.", ok: false });
      } else {
        setKwToast({ msg: `${succeeded}개 업데이트 완료${failed > 0 ? ` (실패 ${failed}개)` : ""}`, ok: failed === 0 });
      }
    } catch {
      setKwToast({ msg: "업데이트 중 오류가 발생했습니다.", ok: false });
    } finally {
      setKwUpdating(false);
      setTimeout(() => setKwToast(null), 4000);
    }
  }

  // 작업확인 뷰
  const [viewMode, setViewMode]           = useState<"목록" | "작업확인">("목록");
  const [workRows, setWorkRows]           = useState<WorkCheckRow[]>([]);
  const [workLoading, setWorkLoading]     = useState(false);
  const [workFilter, setWorkFilter]       = useState<"전체" | "미완료" | "완료">("미완료");
  const [workSearch, setWorkSearch]       = useState("");
  const [workAssignee, setWorkAssignee]   = useState<string>("전체");
  const [pendingQty, setPendingQty]       = useState<Map<string, string>>(new Map());
  const [pendingSettingDate, setPendingSettingDate] = useState<Map<string, string>>(new Map());
  const [pendingAssignee, setPendingAssignee] = useState<Map<string, string>>(new Map());

  const [workIncomplete, setWorkIncomplete] = useState(0);
  const [workMonth, setWorkMonth]           = useState<string>(new Date().toISOString().slice(0, 7));


  function loadWorkCheck() {
    setWorkLoading(true);
    const url = teamParam ? `/api/work-check?team=${encodeURIComponent(teamParam)}` : "/api/work-check";
    fetch(url, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const rows: WorkCheckRow[] = d.rows ?? [];
        setWorkRows(rows);
        setWorkIncomplete(rows.filter((r) => !r.workCompleted).length);
      })
      .finally(() => setWorkLoading(false));
  }

  async function updateWorkRow(id: string, patch: { workCompleted?: boolean; settingDate?: string; assignee?: string | null }) {
    // 낙관적 업데이트: 요청 전에 로컬 상태를 먼저 반영
    let rollback: WorkCheckRow[] | undefined;
    setWorkRows((prev) => {
      rollback = prev;
      return prev.map((r) => r.id !== id ? r : { ...r, ...patch });
    });
    // workCompleted 토글은 Staff 접근 가능한 전용 엔드포인트 사용 (/api/costs는 Manager 전용)
    const endpoint = patch.workCompleted !== undefined ? `/api/work-check/${id}` : `/api/costs/${id}`;
    const res = await fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      // 저장 실패 시 이전 상태로 롤백
      if (rollback) setWorkRows(rollback);
      return;
    }
    if (patch.workCompleted !== undefined) {
      // 서버 응답의 row.id로 정확히 한 행만 업데이트 (낙관적 업데이트가 잘못된 행을 변경한 경우 교정)
      const data = await res.json().catch(() => null);
      const confirmedId = data?.row?.id as string | undefined;
      if (confirmedId && rollback) {
        setWorkRows(rollback.map((r) => r.id === confirmedId ? { ...r, workCompleted: Boolean(data.row.workCompleted) } : r));
      }
      window.dispatchEvent(new Event("work-badge-refresh"));
      // 서버 데이터로 조용히 재동기화 (낙관적 업데이트 오류를 최종 교정)
      const refreshUrl = teamParam ? `/api/work-check?team=${encodeURIComponent(teamParam)}` : "/api/work-check";
      fetch(refreshUrl, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          const rows: WorkCheckRow[] = d.rows ?? [];
          setWorkRows(rows);
          setWorkIncomplete(rows.filter((r) => !r.workCompleted).length);
        })
        .catch(() => {});
    }
  }

  // 그룹 목록 로드
  const load = useCallback((invalidate = false) => {
    if (!invalidate && _groupsCache && Date.now() - _groupsCache.ts < GROUPS_TTL) {
      const { groups, workIncompleteCount } = _groupsCache.data;
      setGroups(groups);
      setCampaignMap((prev) => {
        const n = new Map(prev);
        // 빈 배열은 저장하지 않음 — has()가 true가 되어 아코디언 클릭 시 로드를 건너뛰는 버그 방지
        for (const g of groups) if (Array.isArray(g.campaigns) && g.campaigns.length > 0) n.set(g.id, g.campaigns as Campaign[]);
        return n;
      });
      // 글로벌 카운트는 팀별 페이지에서 사용하지 않음 — 팀별 정확한 값은 useEffect에서 별도 로드
      if (!teamParamRef.current) setWorkIncomplete(workIncompleteCount);
      setLoading(false);
      return;
    }
    if (invalidate) { _groupsCache = null; _allCampaignsPending = null; }
    setLoading(true);
    // 그룹·캠페인 병렬 fetch — 캐시 무효화 후에도 동시에 재로드
    fetchAllCampaigns();
    fetchGroups()
      .then(({ groups, workIncompleteCount }) => {
        setGroups(groups);
        setCampaignMap((prev) => {
          const n = new Map(prev);
          for (const g of groups) if (Array.isArray(g.campaigns) && g.campaigns.length > 0) n.set(g.id, g.campaigns as Campaign[]);
          return n;
        });
        if (!teamParamRef.current) setWorkIncomplete(workIncompleteCount);
      })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // stats/revenue 로드 — 마운트 시 + criteria/team 변경 시 실행, 60초 캐시
  // 캐시 키에 teamParam 포함 — 팀별 뷰에서 서로 다른 teams 목록이 필요
  const loadStats = useCallback(() => {
    const cacheKey = `${statsCriteria}|${teamParam ?? ""}`;
    const cached = _statsCacheMap.get(cacheKey);
    if (cached && Date.now() - cached.ts < STATS_TTL) { setRevenueStats(cached.data); return; }
    const url = `/api/stats/revenue?year=${new Date().getFullYear()}&criteria=${encodeURIComponent(statsCriteria)}${teamParam ? `&team=${encodeURIComponent(teamParam)}` : ""}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => { _statsCacheMap.set(cacheKey, { data: d, ts: Date.now() }); setRevenueStats(d); })
      .catch(() => {});
  }, [statsCriteria, teamParam]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadStats(); }, [loadStats]);
  // 페이지 마운트 시 모달 정적 데이터(clients/products/users) 백그라운드 프리로드
  useEffect(() => { preloadModalInit(); }, []);
  // 펼쳐진 행 중 campaignMap·loadingGroups에 없는 그룹 자동 로드
  // deps 없음 — 렌더마다 체크해서 HMR/상태 desync 대응. 데이터 로드 완료 시 조건이 false가 되어 무한루프 없음
  // _campaignErrorMap TTL 만료 시 재시도, 빈 캐시지만 campaignCount>0이면 1회 강제 재시도
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    for (const id of expanded) {
      if (loadingGroups.has(id)) continue;
      const cached = campaignMap.get(id);
      if (cached === undefined) {
        // 이전 요청이 실패한 경우 TTL 지난 후 재시도
        const errTs = _campaignErrorMap.get(id);
        if (!errTs || Date.now() - errTs > CAMPAIGN_ERROR_TTL) {
          loadCampaigns(id);
        }
      } else if (cached.length === 0) {
        // 빈 배열이 캐싱됐지만 그룹에 캠페인이 있어야 하는 경우 1회 강제 재시도
        const grp = groups.find(g => g.id === id);
        if (grp && (grp.campaignCount > 0 || grp.activeCampaignCount > 0) && !_campaignForceRetried.has(id)) {
          _campaignForceRetried.add(id);
          loadCampaigns(id, true);
        }
      }
    }
  });
  // 입금요청/확인요청 제출 시 그룹·캠페인 캐시 무효화 → 매입/매출 상태 배지 즉시 갱신
  useEffect(() => {
    const refresh = () => {
      _campaignCacheMap.clear();
      _campaignPendingMap.clear();
      setCampaignMap(new Map());
      load(true);
    };
    window.addEventListener("approval-request-added", refresh);
    return () => window.removeEventListener("approval-request-added", refresh);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (teamParam) setActiveTab(teamParam); }, [teamParam]);
  // 팀 이동 시 작업확인 뷰·배지 초기화 — 이전 팀 데이터가 그대로 보이는 버그 방지
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    setViewMode("목록");
    setWorkRows([]);
    setWorkIncomplete(0);
    // 팀별 미완료 배지 카운트를 즉시 로드 (전체 캐시의 글로벌 카운트 대신 팀별 정확한 값 사용)
    if (teamParam) {
      fetch(`/api/work-check?team=${encodeURIComponent(teamParam)}`)
        .then((r) => r.json())
        .then((d) => {
          const rows: WorkCheckRow[] = d.rows ?? [];
          setWorkIncomplete(rows.filter((r) => !r.workCompleted).length);
        })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamParam]);

  // ?open=projectId → 해당 캠페인 모달 자동 오픈
  useEffect(() => {
    if (!openParam) return;
    fetch(`/api/projects/${openParam}`)
      .then((r) => r.json())
      .then(({ project }) => {
        if (!project) return;
        setEditCampaign({
          id:             project.id,
          status:         (project.status === "리드" ? "진행" : project.status) ?? "진행",
          campaignName:   project.campaignName ?? "",
          clientId:       project.clientId ?? undefined,
          projectType:    project.projectType ?? "",
          advertiser:     project.advertiser ?? "",
          product:        project.product ?? "",
          assignedTeam:   project.assignedTeam ?? "",
          assignedPerson: project.assignedPerson ?? "",
          contractAmount: project.contractAmount != null ? String(project.contractAmount) : "",
          kpiSupply:      project.kpiSupply != null ? String(project.kpiSupply) : "",
          kpiTax:         project.kpiTax    != null ? String(project.kpiTax)    : "",
          startDate:      project.startDate ?? "",
          endDate:        project.endDate ?? "",
          placeLink:      project.placeLink ?? "",
          notes:          project.notes ?? "",
          isExtended:     project.isExtended ?? false,
        });
        if (project.projectGroupId) setActiveCampGroup(project.projectGroupId);
      })
      .catch(() => {});
  }, [openParam]);

  // 프로젝트 ID로 캠페인 모달 열기
  async function openCampaignById(projectId: string, groupId?: string) {
    const res = await fetch(`/api/projects/${projectId}`);
    const { project } = await res.json();
    if (!project) return;
    setEditCampaign({
      id:             project.id,
      status:         (project.status === "리드" ? "진행" : project.status) ?? "진행",
      campaignName:   project.campaignName ?? "",
      clientId:       project.clientId ?? undefined,
      projectType:    project.projectType ?? "",
      advertiser:     project.advertiser ?? "",
      product:        project.product ?? "",
      assignedTeam:   project.assignedTeam ?? "",
      assignedPerson: project.assignedPerson ?? "",
      contractAmount: project.contractAmount != null ? String(project.contractAmount) : "",
      kpiSupply:      project.kpiSupply != null ? String(project.kpiSupply) : "",
      kpiTax:         project.kpiTax    != null ? String(project.kpiTax)    : "",
      startDate:      project.startDate ?? "",
      endDate:        project.endDate ?? "",
      placeLink:      project.placeLink ?? "",
      notes:          project.notes ?? "",
      isExtended:     project.isExtended ?? false,
    });
    if (groupId) setActiveCampGroup(groupId);
  }

  // 그룹 캠페인 로드 (펼칠 때) — 모듈 캐시 히트 시 즉시 반환
  function loadCampaigns(groupId: string, force = false) {
    if (force) {
      _campaignCacheMap.delete(groupId);
      _campaignPendingMap.delete(groupId);
    } else {
      const hit = _campaignCacheMap.get(groupId);
      if (hit && Date.now() - hit.ts < CAMPAIGN_TTL) {
        setCampaignMap(m => new Map(m).set(groupId, hit.data));
        return;
      }
    }
    setLoadingGroups(s => new Set(s).add(groupId));
    fetchGroupCampaigns(groupId)
      .then(campaigns => setCampaignMap(m => new Map(m).set(groupId, campaigns)))
      .catch(() => {})
      .finally(() => setLoadingGroups(s => { const n = new Set(s); n.delete(groupId); return n; }));
  }

  function toggleExpand(groupId: string) {
    const willExpand = !expanded.has(groupId);
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(groupId)) n.delete(groupId);
      else n.add(groupId);
      return n;
    });
    // 업데이터 함수 밖에서 호출해야 setCampaignMap이 정상 적용됨
    if (willExpand && !campaignMap.has(groupId)) loadCampaigns(groupId);
  }

  // 캠페인 복사
  async function handleCopyCampaign(campaignId: string, groupId: string) {
    setCopyingCamp(campaignId);
    await fetch(`/api/projects/${campaignId}/copy`, { method: "POST" });
    setCopyingCamp(null);
    invalidateProjectCache(campaignId);
    setGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, campaignCount: g.campaignCount + 1 } : g));
    setCampaignMap((m) => { const n = new Map(m); n.delete(groupId); return n; });
    loadCampaigns(groupId, true);
  }

  // 캠페인 삭제
  async function handleDeleteGroup(groupId: string) {
    if (!confirm("프로젝트를 삭제하시겠습니까? 모든 캠페인·매출·매입 데이터도 함께 삭제됩니다.")) return;
    const res = await fetch(`/api/project-groups/${groupId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? "삭제에 실패했습니다.");
      return;
    }
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
    _campaignCacheMap.delete(groupId);
    _campaignPendingMap.delete(groupId);
    setCampaignMap((m) => { const n = new Map(m); n.delete(groupId); return n; });
    setExpanded((s) => { const n = new Set(s); n.delete(groupId); return n; });
  }

  async function handleDeleteCampaign(campaignId: string, groupId: string) {
    if (!confirm("캠페인을 삭제하시겠습니까? 매출·매입 데이터도 모두 삭제됩니다.")) return;
    setDeletingCamp(campaignId);
    const res = await fetch(`/api/projects/${campaignId}`, { method: "DELETE" });
    invalidateProjectCache(campaignId);
    setDeletingCamp(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? "삭제에 실패했습니다.");
      return;
    }
    setCampaignMap((m) => { const n = new Map(m); n.delete(groupId); return n; });
    loadCampaigns(groupId, true);
    load(true);
  }

  // 광고주 상세 보기
  async function handleViewClient(clientId: string) {
    const { client } = await fetch(`/api/clients/${clientId}`).then((r) => r.json());
    if (!client) return;
    setViewClient({
      id: client.id, status: client.status,
      companyName: client.companyName, industry: client.industry ?? "",
      advertiserName: client.advertiserName ?? "", advertiserContact: client.advertiserContact ?? "",
      contactEmail: client.contactEmail ?? "", businessNumber: client.businessNumber ?? "",
      category: client.category ?? "", products: client.products ?? [],
      monthlyAvg: client.monthlyAvg != null ? String(client.monthlyAvg) : "",
      inboundDate: client.inboundDate ?? "", inboundRoute: client.inboundRoute ?? "",
      endDate: client.endDate ?? "", endReason: client.endReason ?? "",
      assignedTeam: client.assignedTeam ?? "", assignedPerson: client.assignedPerson ?? "",
      storeName: client.storeName ?? "",
      notes: client.notes ?? "",
    });
  }

  // 팀 필터 (URL 파라미터 기준, 탭으로 표시 안 함)
  const teamFiltered = groups.filter((g) =>
    !teamParam || g.assignedTeam === teamParam
  );

  function withinDays(days: number | null, limit: number) {
    return days !== null && days >= 0 && days <= limit;
  }

  function matchesDeadline(g: ProjectGroup, f: "D-7" | "D-3" | "D-1") {
    if (g.status !== "진행") return false;
    if (f === "D-7") return withinDays(g.activeDaysRemaining, 7);
    if (f === "D-3") return withinDays(g.activeDaysRemaining, 3);
    return withinDays(g.activeDaysRemaining, 1);
  }

  function matchesWorkDeadline(g: ProjectGroup, f: "WD-7" | "WD-3" | "WD-1") {
    if (g.status !== "진행") return false;
    if (f === "WD-7") return withinDays(g.activeWorkDaysRemaining, 7);
    if (f === "WD-3") return withinDays(g.activeWorkDaysRemaining, 3);
    return withinDays(g.activeWorkDaysRemaining, 1);
  }

  const filtered = teamFiltered.filter((g) => {
    let statusOk: boolean;
    if (statusFilter === "전체")        statusOk = true;
    else if (statusFilter === "진행중") statusOk = g.status === "진행";
    else if (statusFilter === "종료")   statusOk = g.status === "종료";
    else if (statusFilter === "WD-7" || statusFilter === "WD-3" || statusFilter === "WD-1")
      statusOk = matchesWorkDeadline(g, statusFilter);
    else statusOk = matchesDeadline(g, statusFilter);
    const searchOk = search === "" || g.name.includes(search) || (g.assignedPerson ?? "").includes(search);
    return statusOk && searchOk;
  });

  function filterCount(f: typeof statusFilter) {
    if (f === "전체")        return teamFiltered.length;
    if (f === "진행중")      return teamFiltered.filter((g) => g.status === "진행").length;
    if (f === "종료")        return teamFiltered.filter((g) => g.status === "종료").length;
    if (f === "WD-7" || f === "WD-3" || f === "WD-1")
      return teamFiltered.filter((g) => matchesWorkDeadline(g, f)).length;
    return teamFiltered.filter((g) => matchesDeadline(g, f)).length;
  }

  const totalCount  = teamFiltered.length;
  const activeCount = teamFiltered.filter((g) => g.status === "진행").length;

  return (
    <div className="space-y-5">
      {/* ── 매출 KPI + 차트 ── */}
      {revenueStats && (
        <RevenueKpiSection stats={revenueStats} teamFilter={teamParam} onReload={loadStats}
          criteria={statsCriteria} onCriteriaChange={setStatsCriteria} />
      )}

      {/* 신규 프로젝트+캠페인 동시 생성 모달 */}
      {newProjectModal && (
        <ProjectModal
          initial={null}
          onClose={() => setNewProjectModal(false)}
          onSaved={async (newGroupId?: string) => {
            setNewProjectModal(false);
            await load(true);
            loadWorkCheck();
            // API 응답의 projectGroupId로 자동 펼침
            if (newGroupId) {
              setExpanded((s) => new Set(s).add(newGroupId));
              loadCampaigns(newGroupId);
            }
          }}
          onViewClient={handleViewClient}
        />
      )}

      {/* 프로젝트 그룹 수정 모달 */}
      {editing && (
        <GroupModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(true); }}
        />
      )}

      {/* 캠페인 추가 모달 */}
      {addCampGroup && (
        <ProjectModal
          initial={null}
          projectGroupId={addCampGroup}
          onClose={() => setAddCampGroup(null)}
          onSaved={() => {
            loadCampaigns(addCampGroup, true);
            load(true);
            loadWorkCheck();
            setAddCampGroup(null);
          }}
          onViewClient={handleViewClient}
        />
      )}

      {/* 캠페인 편집 모달 */}
      {editCampaign && (
        <ProjectModal
          initial={editCampaign}
          projectGroupId={activeCampGroup ?? undefined}
          onClose={() => { setEditCampaign(null); setActiveCampGroup(null); }}
          onSaved={() => {
            if (editCampaign?.id) invalidateProjectCache(editCampaign.id);
            if (activeCampGroup) loadCampaigns(activeCampGroup, true);
            load(true);
            loadWorkCheck();
          }}
          onDelete={async (cid) => {
            if (activeCampGroup) await handleDeleteCampaign(cid, activeCampGroup);
            setEditCampaign(null); setActiveCampGroup(null);
          }}
          onViewClient={handleViewClient}
        />
      )}

      {/* 광고주 모달 */}
      {viewClient && (
        <ClientModal
          initial={viewClient}
          onClose={() => setViewClient(null)}
          onSaved={() => { setViewClient(null); load(true); }}
          onDelete={async (cid) => { await fetch(`/api/clients/${cid}`, { method: "DELETE" }); setViewClient(null); load(true); }}
        />
      )}

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-xs" style={{ color: "#94A3B8" }}>
            {teamParam && <><span className="font-semibold" style={{ color: "#3182F6" }}>{teamParam}</span> · </>}
            프로젝트 {totalCount}개 · 진행중 <span style={{ color: "#3182F6" }}>{activeCount}개</span>
          </p>
          {/* 뷰 전환 — 팀 선택 시에만 표시 */}
          {teamParam && (
            <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "#F1F5F9" }}>
              {(["목록", "작업확인"] as const).map((v) => {
                const isActive = viewMode === v;
                const hasAlert = v === "작업확인" && workIncomplete > 0;
                return (
                  <button key={v} onClick={() => {
                    setViewMode(v);
                    if (v === "작업확인") loadWorkCheck();
                  }}
                    className="relative flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      background: isActive ? "#fff" : hasAlert ? "rgba(239,68,68,0.06)" : "transparent",
                      color: isActive ? "#191F28" : hasAlert ? "#EF4444" : "#94A3B8",
                      boxShadow: isActive ? "0 1px 4px rgba(0,0,0,0.10)" : "none",
                      border: hasAlert && !isActive ? "1px solid rgba(239,68,68,0.2)" : "1px solid transparent",
                    }}>
                    {v}
                    {hasAlert && (
                      <span
                        className="flex items-center justify-center text-white font-bold rounded-full"
                        style={{
                          background: "#EF4444",
                          fontSize: 9,
                          minWidth: 15,
                          height: 15,
                          paddingLeft: workIncomplete > 9 ? 4 : 0,
                          paddingRight: workIncomplete > 9 ? 4 : 0,
                          letterSpacing: "-0.3px",
                        }}
                      >
                        {workIncomplete > 99 ? "99+" : workIncomplete}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* 키워드 전체 업데이트 */}
          <button
            onClick={() => setNewProjectModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "#3182F6" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            프로젝트 추가
          </button>

          <div className="relative">
            <button
              onClick={updateAllKeywords}
              disabled={kwUpdating}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ background: "#F1F5F9", color: "#475569", border: "1px solid #E2E8F0" }}
            >
              {kwUpdating ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                  style={{ animation: "spin 1s linear infinite" }}>
                  <path d="M21 12a9 9 0 1 1-6.22-8.56"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="23 4 23 10 17 10"/>
                  <path d="M20.49 15a9 9 0 1 1-.06-8.64"/>
                </svg>
              )}
              {kwUpdating ? "업데이트 중..." : "키워드 전체 업데이트"}
            </button>
            {kwToast && (
              <div
                className="absolute right-0 top-full mt-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap z-50"
                style={{
                  background: kwToast.ok ? "#10B981" : "#F59E0B",
                  color: "#fff",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                }}
              >
                {kwToast.msg}
              </div>
            )}
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* ── 작업확인 뷰 ── */}
      {viewMode === "작업확인" && (
        <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E9EBEF" }}>
          {/* 월 선택 */}
          {(() => {
            const wMonths = [...new Set(workRows.map(r => (r.workStartDate ?? "").slice(0, 7)).filter(Boolean))].sort((a, b) => b.localeCompare(a));
            if (wMonths.length === 0) return null;
            return (
              <div className="flex items-center gap-2 px-5 py-2.5 flex-wrap" style={{ borderBottom: "1px solid #F1F5F9", background: "#FAFBFC" }}>
                <span className="text-xs font-semibold shrink-0" style={{ color: "#94A3B8" }}>월</span>
                {wMonths.map((m) => {
                  const [y, mo] = m.split("-");
                  const isActive = workMonth === m;
                  const inc = workRows.filter(r => (r.workStartDate ?? "").startsWith(m) && !r.workCompleted).length;
                  return (
                    <button key={m} onClick={() => setWorkMonth(m)}
                      className="relative flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-semibold transition-all"
                      style={{ background: isActive ? "#191F28" : "#F1F5F9", color: isActive ? "#fff" : "#64748B" }}>
                      {y}.{mo}
                      {inc > 0 && (
                        <span className="flex items-center justify-center text-white font-bold rounded-full"
                          style={{ background: isActive ? "rgba(255,255,255,0.3)" : "#EF4444", fontSize: 9, minWidth: 14, height: 14,
                            paddingLeft: inc > 9 ? 3 : 0, paddingRight: inc > 9 ? 3 : 0 }}>
                          {inc > 99 ? "99+" : inc}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })()}

          {/* 필터 바 */}
          {(() => {
            const monthFiltered = workRows.filter(r => (r.workStartDate ?? "").startsWith(workMonth));
            return (
              <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid #F1F5F9", background: "#FAFBFC" }}>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    {(["미완료", "완료", "전체"] as const).map((f) => {
                      const isActive = workFilter === f;
                      return (
                        <button key={f} onClick={() => setWorkFilter(f)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                          style={{
                            background: isActive ? (f === "완료" ? "rgba(16,185,129,0.1)" : f === "미완료" ? "rgba(239,68,68,0.08)" : "rgba(49,130,246,0.1)") : "transparent",
                            color: isActive ? (f === "완료" ? "#059669" : f === "미완료" ? "#EF4444" : "#3182F6") : "#94A3B8",
                          }}>
                          {f}
                          <span className="ml-1 font-bold">
                            {f === "전체" ? monthFiltered.length
                              : f === "완료" ? monthFiltered.filter(r => r.workCompleted).length
                              : monthFiltered.filter(r => !r.workCompleted).length}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input type="text" placeholder="캠페인명, 품명, 담당자 검색" value={workSearch}
                    onChange={(e) => setWorkSearch(e.target.value)}
                    className="pl-8 pr-4 py-1.5 text-xs rounded-xl outline-none"
                    style={{ background: "#F1F5F9", border: "1px solid #E9EBEF", color: "#191F28", width: 220 }} />
                </div>
              </div>
            );
          })()}

          {workLoading ? (
            <div className="py-16 text-center text-sm" style={{ color: "#94A3B8" }}>불러오는 중...</div>
          ) : (() => {
            const allAssignees = [...new Set(workRows.filter(r => (r.workStartDate ?? "").startsWith(workMonth)).map(r => r.assignee).filter(Boolean) as string[])].sort();
            const allAssigneeOpts = [...new Set(workRows.map(r => r.assignee).filter(Boolean) as string[])].sort();
              return (
            <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: 960 }}>
              <thead>
                <tr style={{ background: "#FFF7ED" }}>
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap" style={{ color: "#F97316", borderBottom: "2px solid #FED7AA" }}>#</th>
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap" style={{ color: "#F97316", borderBottom: "2px solid #FED7AA" }}>
                    <div className="flex items-center gap-1.5">
                      <span>담당자</span>
                      <div className="relative">
                        <select
                          value={workAssignee}
                          onChange={(e) => setWorkAssignee(e.target.value)}
                          className="appearance-none text-xs font-semibold pl-2 pr-5 py-0.5 rounded-md cursor-pointer outline-none transition-all"
                          style={{
                            background: workAssignee === "전체" ? "rgba(249,115,22,0.08)" : "rgba(49,130,246,0.12)",
                            color:      workAssignee === "전체" ? "#F97316" : "#3182F6",
                            border:     "1px solid " + (workAssignee === "전체" ? "rgba(249,115,22,0.25)" : "rgba(49,130,246,0.35)"),
                          }}
                        >
                          <option value="전체">전체</option>
                          {allAssignees.map((a) => <option key={a} value={a}>{a}</option>)}
                        </select>
                        <svg className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ color: workAssignee === "전체" ? "#F97316" : "#3182F6" }}>
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      </div>
                    </div>
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap" style={{ color: "#F97316", borderBottom: "2px solid #FED7AA" }}>작업담당자</th>
                  {["품명", "개수", "공급가", "세액", "합계", "작업시작일", "작업만료일", "셋팅날짜", "잔여일", "완료"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap" style={{ color: "#F97316", borderBottom: "2px solid #FED7AA" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const filtered = workRows
                    .filter((r) => (r.workStartDate ?? "").startsWith(workMonth))
                    .filter((r) => workAssignee === "전체" || r.assignee === workAssignee)
                    .filter((r) => {
                      if (workFilter === "완료")   return r.workCompleted;
                      if (workFilter === "미완료") return !r.workCompleted;
                      return true;
                    })
                    .filter((r) => {
                      if (!workSearch.trim()) return true;
                      const q = workSearch.toLowerCase();
                      return (r.campaignName ?? "").toLowerCase().includes(q)
                        || (r.groupName ?? "").toLowerCase().includes(q)
                        || (r.productName ?? "").toLowerCase().includes(q)
                        || (r.assignee ?? "").toLowerCase().includes(q);
                    })
                    .sort((a, b) => {
                      if (!a.workEndDate && !b.workEndDate) return 0;
                      if (!a.workEndDate) return 1;
                      if (!b.workEndDate) return -1;
                      return a.workEndDate.localeCompare(b.workEndDate);
                    });

                  if (filtered.length === 0) {
                    return <tr><td colSpan={13} className="py-16 text-center text-sm" style={{ color: "#94A3B8" }}>해당 월의 작업 데이터가 없습니다.</td></tr>;
                  }

                  // 캠페인별 그룹핑 (projectId 기준, 순서 유지)
                  const groups = [...new Map(filtered.map(r => [r.projectId, { projectId: r.projectId, groupName: r.groupName, campaignName: r.campaignName }])).values()];

                  let rowIdx = 0;
                  return groups.flatMap(({ projectId, groupName, campaignName }) => {
                    const groupRows = filtered.filter(r => r.projectId === projectId);
                    const allDone = groupRows.every(r => r.workCompleted);
                    return [
                      <tr key={`gh-${projectId}`} style={{ background: allDone ? "#F0FDF4" : "#F8FAFC", borderTop: "2px solid #E9EBEF" }}>
                        <td colSpan={13} className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openCampaignById(projectId, filtered.find(r => r.projectId === projectId)?.groupId)}
                              className="font-bold text-xs hover:underline transition-colors"
                              style={{ color: "#3182F6", cursor: "pointer", background: "none", border: "none", padding: 0 }}
                            >{groupName}</button>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                            <span className="text-xs" style={{ color: "#475569" }}>{campaignName || "—"}</span>
                            <span className="ml-2 text-xs px-2 py-0.5 rounded-full font-semibold" style={{
                              background: allDone ? "rgba(16,185,129,0.1)" : "rgba(49,130,246,0.08)",
                              color: allDone ? "#059669" : "#3182F6",
                            }}>
                              {allDone ? "완료" : `${groupRows.filter(r => r.workCompleted).length}/${groupRows.length}`}
                            </span>
                          </div>
                        </td>
                      </tr>,
                      ...groupRows.map((r) => {
                        rowIdx++;
                        const remDiff = r.workEndDate
                          ? new Date(r.workEndDate).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)
                          : null;
                        const remDays = remDiff !== null ? Math.ceil(remDiff / 86400000) : null;
                        return (
                          <tr key={r.id} className="border-t" style={{ borderColor: "#F1F5F9", background: r.workCompleted ? "rgba(16,185,129,0.02)" : undefined }}>
                            <td className="px-3 py-2 font-medium" style={{ color: "#94A3B8" }}>{rowIdx}</td>
                            <td className="px-3 py-2" style={{ color: r.assignee ? "#475569" : "#CBD5E1" }}>{r.assignee || "—"}</td>
                            <td className="px-2 py-1.5">
                              <div className="flex items-center gap-1.5">
                                <div className="relative">
                                  <select
                                    value={pendingAssignee.has(r.id) ? pendingAssignee.get(r.id)! : (r.assignee ?? "")}
                                    onChange={(e) => setPendingAssignee((prev) => new Map(prev).set(r.id, e.target.value))}
                                    className="appearance-none text-xs pl-2 pr-5 py-1 rounded-lg outline-none transition-all cursor-pointer"
                                    style={{ background: "#F8FAFC", border: "1px solid #E9EBEF", color: (pendingAssignee.has(r.id) ? pendingAssignee.get(r.id) : r.assignee) ? "#191F28" : "#CBD5E1", minWidth: 72 }}
                                  >
                                    <option value="">—</option>
                                    {allAssigneeOpts.map((a) => <option key={a} value={a}>{a}</option>)}
                                  </select>
                                  <svg className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round">
                                    <polyline points="6 9 12 15 18 9"/>
                                  </svg>
                                </div>
                                {pendingAssignee.has(r.id) && pendingAssignee.get(r.id) !== (r.assignee ?? "") && (
                                  <button
                                    onClick={() => {
                                      const val = pendingAssignee.get(r.id)!;
                                      updateWorkRow(r.id, { assignee: val || null });
                                      setPendingAssignee((prev) => { const m = new Map(prev); m.delete(r.id); return m; });
                                    }}
                                    className="px-2 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors"
                                    style={{ background: "#3182F6", color: "#fff" }}
                                  >
                                    적용
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 font-medium" style={{ color: "#191F28" }}>{r.productName || "—"}</td>
                            <td className="px-3 py-2 text-center" style={{ color: "#475569" }}>{r.quantity ?? "—"}</td>
                            <td className="px-3 py-2 text-right" style={{ color: "#475569" }}>{r.supplyPrice ? `₩${r.supplyPrice.toLocaleString()}` : "—"}</td>
                            <td className="px-3 py-2 text-right" style={{ color: "#475569" }}>{r.tax ? `₩${r.tax.toLocaleString()}` : "—"}</td>
                            <td className="px-3 py-2 text-right font-semibold" style={{ color: "#191F28" }}>{r.total ? `₩${r.total.toLocaleString()}` : "—"}</td>
                            <td className="px-3 py-2 whitespace-nowrap" style={{ color: r.workStartDate ? "#475569" : "#CBD5E1" }}>
                              {r.workStartDate ? r.workStartDate.replace(/-/g, ". ") : "—"}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap" style={{ color: r.workEndDate ? "#475569" : "#CBD5E1" }}>
                              {r.workEndDate ? r.workEndDate.replace(/-/g, ". ") : "—"}
                            </td>
                            <td className="px-2 py-1.5">
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="date"
                                  value={pendingSettingDate.has(r.id) ? pendingSettingDate.get(r.id)! : (r.settingDate ?? "")}
                                  onChange={(e) => setPendingSettingDate((prev) => new Map(prev).set(r.id, e.target.value))}
                                  className="px-2 py-1 rounded-lg text-xs outline-none"
                                  style={{ background: "#F8FAFC", border: "1px solid #E9EBEF", color: "#191F28", width: 115 }}
                                />
                                {pendingSettingDate.has(r.id) && pendingSettingDate.get(r.id) !== (r.settingDate ?? "") && (
                                  <button
                                    onClick={() => {
                                      const val = pendingSettingDate.get(r.id)!;
                                      updateWorkRow(r.id, { settingDate: val });
                                      setPendingSettingDate((prev) => { const m = new Map(prev); m.delete(r.id); return m; });
                                    }}
                                    className="px-2 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors"
                                    style={{ background: "#3182F6", color: "#fff" }}
                                  >
                                    적용
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 font-medium text-center" style={{
                              color: remDays === null ? "#CBD5E1" : remDays <= 1 ? "#EF4444" : remDays <= 3 ? "#F97316" : remDays <= 7 ? "#EAB308" : "#475569"
                            }}>
                              {remDays === null ? "—" : remDays < 0 ? `+${Math.abs(remDays)}` : remDays === 0 ? "D-0" : `D-${remDays}`}
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={!!r.workCompleted}
                                onChange={(e) => updateWorkRow(r.id, { workCompleted: e.target.checked })}
                                className="w-3.5 h-3.5 rounded accent-[#F97316]"
                              />
                            </td>
                          </tr>
                        );
                      }),
                    ];
                  });
                })()}
              </tbody>
            </table>
            </div>
            );
          })()}
        </div>
      )}

      {viewMode === "목록" && <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E9EBEF" }}>

        {/* ── 탭 영역 ── */}
        <div style={{ borderBottom: "1px solid #F1F5F9" }}>

          {/* 1행: 상태 탭 + 검색 */}
          <div className="flex items-center justify-between px-6 pt-4">
            <div className="flex items-center gap-1">
              {(["전체", "진행중", "종료"] as const).map((s) => {
                const isActive = statusFilter === s;
                const cnt = filterCount(s);
                return (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors"
                    style={{
                      color: isActive ? "#191F28" : "#94A3B8",
                      borderBottom: isActive ? "2px solid #3182F6" : "2px solid transparent",
                      marginBottom: "-1px",
                    }}>
                    {s}
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-bold"
                      style={{ background: isActive ? "rgba(49,130,246,0.1)" : "#F1F5F9", color: isActive ? "#3182F6" : "#94A3B8" }}>
                      {cnt}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="relative pb-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input type="text" placeholder="프로젝트명, 담당자 검색"
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-4 py-2 text-sm rounded-xl outline-none"
                style={{ background: "#F8FAFC", border: "1px solid #E9EBEF", color: "#191F28", width: "220px" }}
              />
            </div>
          </div>

          {/* 2행: 마감 임박 필터 */}
          <div className="flex items-center gap-3 px-6 py-3" style={{ background: "#FAFBFC" }}>
            {([
              { group: "캠페인 종료일", items: [
                { key: "D-7" as const, label: "7일 이내" },
                { key: "D-3" as const, label: "3일 이내" },
                { key: "D-1" as const, label: "1일 이내" },
              ]},
              { group: "품목 종료일", items: [
                { key: "WD-7" as const, label: "7일 이내" },
                { key: "WD-3" as const, label: "3일 이내" },
                { key: "WD-1" as const, label: "1일 이내" },
              ]},
            ].map(({ group, items }, gi) => (
              <div key={group} className="flex items-center gap-1.5">
                {gi > 0 && <div className="w-px h-4 mx-1" style={{ background: "#E9EBEF" }} />}
                <span className="text-xs font-semibold whitespace-nowrap" style={{ color: "#B0B8C1" }}>{group}</span>
                {items.map(({ key, label }) => {
                  const isActive = statusFilter === key;
                  const cnt = filterCount(key);
                  const color = key.endsWith("7") ? "#EAB308" : "#EF4444";
                  return (
                    <button key={key} onClick={() => setStatusFilter(key)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
                      style={{
                        background: isActive ? `${color}15` : "#F1F5F9",
                        color: isActive ? color : "#94A3B8",
                        border: `1px solid ${isActive ? `${color}40` : "transparent"}`,
                      }}>
                      {label}
                      <span className="min-w-[16px] h-4 flex items-center justify-center rounded-full text-xs font-bold px-1"
                        style={{ background: isActive ? `${color}25` : "#E9EBEF", color: isActive ? color : "#94A3B8" }}>
                        {cnt}
                      </span>
                    </button>
                  );
                })}
              </div>
            )))}
          </div>
        </div>

        {/* 테이블 */}
        {loading && <div className="py-16 text-center text-sm" style={{ color: "#94A3B8" }}>데이터를 불러오는 중...</div>}
        {!loading && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "#F8FAFC" }}>
                  {/* 프로젝트 헤더 */}
                  <th className="px-5 py-3 text-left font-semibold text-xs whitespace-nowrap" style={{ color: "#64748B" }}>프로젝트 / 캠페인</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs" style={{ color: "#64748B" }}>유형</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs" style={{ color: "#64748B" }}>상품</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs whitespace-nowrap" style={{ color: "#64748B" }}>계약기간</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs" style={{ color: "#64748B" }}>잔여일</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs" style={{ color: "#64748B" }}>계약금액</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs" style={{ color: "#64748B" }}>매출</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs" style={{ color: "#64748B" }}>세금계산서</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs" style={{ color: "#64748B" }}>매입</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs" style={{ color: "#64748B" }}>상태</th>
                  <th className="px-4 py-3 w-12" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((g) => {
                  const isOpen   = expanded.has(g.id);
                  const isLoadingCamps = loadingGroups.has(g.id);
                  const camps    = campaignMap.get(g.id) ?? [];

                  return [
                    // ── 프로젝트 행 ──
                    <tr
                      key={`group-${g.id}`}
                      className="border-t group cursor-pointer"
                      style={{ borderColor: "#E9EBEF", background: isOpen ? "rgba(49,130,246,0.04)" : "transparent" }}
                      onMouseEnter={(e) => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = "rgba(49,130,246,0.02)"; fetchGroupCampaigns(g.id); }}
                      onMouseLeave={(e) => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                      onClick={() => toggleExpand(g.id)}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          {/* 펼치기 토글 */}
                          <span className="transition-transform duration-150 flex-shrink-0"
                            style={{ color: "#94A3B8", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", display: "inline-flex" }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <polyline points="9 18 15 12 9 6"/>
                            </svg>
                          </span>
                          <div>
                            <span className="font-bold text-sm" style={{ color: "#191F28" }}>{g.name}</span>
                            <div className="flex items-center gap-2 mt-0.5">
                              {g.assignedTeam && (
                                <span className="text-xs px-1.5 py-0.5 rounded-md font-medium"
                                  style={{ background: "rgba(49,130,246,0.08)", color: "#3182F6" }}>{g.assignedTeam}</span>
                              )}
                              {g.assignedPerson && (
                                <span className="text-xs" style={{ color: "#94A3B8" }}>{g.assignedPerson}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      {/* 유형 */}
                      <td className="px-4 py-3.5">
                        {g.activeProjectType ? (
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap inline-block" style={{
                            background: g.activeProjectType === "관리형" ? "rgba(49,130,246,0.1)" : "rgba(139,92,246,0.1)",
                            color:      g.activeProjectType === "관리형" ? "#3182F6" : "#8B5CF6",
                          }}>{g.activeProjectType}</span>
                        ) : <span style={{ color: "#E2E8F0" }}>—</span>}
                      </td>
                      {/* 상품 */}
                      <td className="px-4 py-3.5">
                        {g.activeProduct ? (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap inline-block"
                            style={{ background: "rgba(49,130,246,0.08)", color: "#3182F6" }}>{g.activeProduct}</span>
                        ) : <span style={{ color: "#E2E8F0" }}>—</span>}
                      </td>
                      {/* 계약기간 */}
                      <td className="px-4 py-3.5 text-xs whitespace-nowrap" style={{ color: "#94A3B8" }}>
                        {g.activeStartDate || g.activeEndDate
                          ? `${g.activeStartDate ?? "?"} ~ ${g.activeEndDate ?? "?"}`
                          : <span style={{ color: "#E2E8F0" }}>—</span>}
                      </td>
                      {/* 잔여일 */}
                      <td className="px-4 py-3.5"><DaysBadge days={g.activeDaysRemaining} /></td>
                      {/* 계약금액 — 캠페인 2개 이상이면 전체 누적 합계 표시 */}
                      <td className="px-4 py-3.5 text-xs font-semibold whitespace-nowrap" style={{ color: "#10B981" }}>
                        {g.campaignCount > 1
                          ? wonFmt(g.totalContractAmount)
                          : wonFmt(g.activeContractAmount)}
                        {g.campaignCount > 1 && g.totalContractAmount != null && (
                          <span className="ml-1 font-normal" style={{ color: "#94A3B8", fontSize: 10 }}>누적</span>
                        )}
                      </td>
                      {/* 매출 */}
                      <td className="px-4 py-3.5">
                        <RevenueSalesBadge total={g.revenueTotal} confirmed={g.revenueConfirmed} pending={g.revenuePending} invoiced={g.revenueInvoiced} />
                      </td>
                      {/* 세금계산서 */}
                      <td className="px-4 py-3.5">
                        <TaxInvoiceBadge invoiced={g.revenueInvoiced} />
                      </td>
                      {/* 매입 */}
                      <td className="px-4 py-3.5">
                        <CostBadge total={g.costTotal} approved={g.costApproved} pending={g.costPending} />
                      </td>
                      {/* 상태 */}
                      <td className="px-4 py-3.5">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap inline-block" style={{
                          background: g.status === "종료" ? "#F1F5F9" : "rgba(49,130,246,0.1)",
                          color:      g.status === "종료" ? "#64748B" : "#3182F6",
                        }}>{g.status === "종료" ? "종료" : "진행중"}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* 캠페인 추가 */}
                          <button
                            onClick={(e) => { e.stopPropagation(); setAddCampGroup(g.id); if (!isOpen) toggleExpand(g.id); }}
                            className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors" title="캠페인 추가"
                            style={{ color: "#3182F6" }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                            </svg>
                          </button>
                          {/* 프로젝트 수정 */}
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditing(g); }}
                            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors" title="프로젝트 수정"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>
                          {/* 프로젝트 삭제 */}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteGroup(g.id); }}
                            className="p-1.5 rounded-lg hover:bg-red-50 transition-colors" title="프로젝트 삭제"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                              <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>,

                    // ── 캠페인 행들 (펼쳐진 경우) ──
                    isOpen && isLoadingCamps && (
                      <tr key={`loading-${g.id}`} style={{ background: "rgba(49,130,246,0.02)" }}>
                        <td colSpan={11} className="pl-14 py-3 text-xs" style={{ color: "#94A3B8" }}>
                          캠페인 불러오는 중...
                        </td>
                      </tr>
                    ),

                    isOpen && !isLoadingCamps && camps.length === 0 && (
                      <tr key={`empty-${g.id}`} style={{ background: "rgba(49,130,246,0.02)" }}>
                        <td colSpan={11} className="pl-14 py-3 text-xs" style={{ color: "#CBD5E1" }}>
                          등록된 캠페인이 없습니다.
                        </td>
                      </tr>
                    ),

                    isOpen && !isLoadingCamps && camps.map((c, idx) => (
                      <CampaignRow
                        key={`camp-${c.id}`}
                        c={c}
                        index={camps.length - 1 - idx}
                        onEdit={(cam) => { setEditCampaign(toCampaignFormData(cam)); setActiveCampGroup(g.id); }}
                        onDelete={(cid) => handleDeleteCampaign(cid, g.id)}
                        onCopy={(cid) => handleCopyCampaign(cid, g.id)}
                        deleting={deletingCamp}
                        copying={copyingCamp}
                      />
                    )),

                    isOpen && !isLoadingCamps && (
                      <tr key={`add-camp-${g.id}`} style={{ background: "rgba(49,130,246,0.02)" }}>
                        <td colSpan={11} className="pl-12 pr-4 py-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); setAddCampGroup(g.id); }}
                            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors hover:bg-blue-50"
                            style={{ color: "#3182F6", border: "1px dashed #93C5FD" }}
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                            </svg>
                            캠페인 추가
                          </button>
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="py-16 text-center text-sm" style={{ color: "#94A3B8" }}>
                {search ? "검색 결과가 없습니다." : "이 팀에 프로젝트가 없습니다."}
              </div>
            )}
          </div>
        )}
      </div>}
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={null}>
      <ProjectsInner />
    </Suspense>
  );
}
