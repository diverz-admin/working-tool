"use client";

import { useState, useEffect, useCallback } from "react";
import ClientModal, { ClientFormData, LinkedProject } from "@/components/clients/ClientModal";
import DeleteConfirmModal from "@/components/clients/DeleteConfirmModal";
import ProjectModal, { ProjectFormData } from "@/components/projects/ProjectModal";
import { useCurrentRole } from "@/lib/useCurrentRole";

type Status = "리드" | "진행" | "종료";
type TabKey = "전체" | Status;
type CategoryFilter = "전체" | "B2B" | "B2C";
type TeamFilter = "전체" | "영업 1팀" | "영업 2팀";
const TEAM_FILTERS: TeamFilter[] = ["전체", "영업 1팀", "영업 2팀"];
const TEAM_COLOR: Record<string, string> = { "영업 1팀": "#6366F1", "영업 2팀": "#10B981" };

interface Client {
  id: string;
  status: Status;
  inboundDate: string;
  companyName: string;
  industry: string;
  advertiserName: string;
  advertiserContact: string;
  contactEmail?: string;
  businessNumber?: string;
  category?: string;
  products: string[];
  monthlyAvg?: number;
  inboundRoute: string;
  endReason?: string;
  endDate?: string;
  assignedTeam?: string;
  assignedPerson?: string;
  notes?: string;
  projectCount?: number;
}

const TABS: { key: TabKey; label: string; color: string }[] = [
  { key: "전체", label: "전체",   color: "#191F28" },
  { key: "리드", label: "리드",   color: "#8B5CF6" },
  { key: "진행", label: "진행중", color: "#3182F6" },
  { key: "종료", label: "종료",   color: "#94A3B8" },
];

const STATUS_STYLE: Record<Status, { bg: string; color: string; label: string }> = {
  리드: { bg: "rgba(139,92,246,0.1)", color: "#8B5CF6", label: "리드"  },
  진행: { bg: "rgba(49,130,246,0.1)", color: "#3182F6", label: "진행중" },
  종료: { bg: "#F1F5F9",             color: "#64748B", label: "종료"  },
};

function formatWon(amount: number) {
  if (amount >= 100000000) return `${(amount / 100000000).toFixed(1)}억원`;
  if (amount >= 10000)     return `${(amount / 10000).toFixed(0)}만원`;
  return `${amount.toLocaleString()}원`;
}

function ProductBadge({ label }: { label: string }) {
  return (
    <span className="inline-block text-xs px-2 py-0.5 rounded-full font-medium mr-1 mb-0.5" style={{ background: "rgba(49,130,246,0.1)", color: "#3182F6" }}>
      {label}
    </span>
  );
}

function CategoryBadge({ category }: { category?: string }) {
  if (!category) return <span style={{ color: "#CBD5E1" }}>—</span>;
  const isB2B = category === "B2B";
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{
      background: isB2B ? "rgba(99,102,241,0.1)" : "rgba(16,185,129,0.1)",
      color: isB2B ? "#6366F1" : "#10B981",
    }}>
      {category}
    </span>
  );
}

function linkedProjectToFormData(p: LinkedProject): ProjectFormData {
  return {
    id: p.id,
    status: (p.status === "리드" ? "진행" : p.status) as "진행" | "종료",
    campaignName: p.campaignName,
    clientId: p.clientId ?? undefined,
    advertiser: p.advertiser ?? "",
    product: p.product ?? "",
    assignedTeam: p.assignedTeam ?? "",
    assignedPerson: p.assignedPerson ?? "",
    contractAmount: p.contractAmount != null ? String(p.contractAmount) : "",
    startDate: p.startDate ?? "",
    endDate: p.endDate ?? "",
    placeLink: p.placeLink ?? "",
    notes: p.notes ?? "",
    isExtended: p.isExtended ?? false,
  };
}

function toFormData(c: Client): ClientFormData {
  return {
    id: c.id,
    status: c.status,
    companyName: c.companyName,
    industry: c.industry ?? "",
    advertiserName: c.advertiserName ?? "",
    advertiserContact: c.advertiserContact ?? "",
    contactEmail: c.contactEmail ?? "",
    businessNumber: c.businessNumber ?? "",
    category: c.category ?? "",
    products: c.products ?? [],
    monthlyAvg: c.monthlyAvg ? String(c.monthlyAvg) : "",
    inboundDate: c.inboundDate ?? "",
    inboundRoute: c.inboundRoute ?? "",
    endDate: c.endDate ?? "",
    endReason: c.endReason ?? "",
    assignedTeam: c.assignedTeam ?? "",
    assignedPerson: c.assignedPerson ?? "",
    notes: c.notes ?? "",
  };
}

type ViewMode = "team" | "list";

function emptyClientForm(assignedTeam = ""): ClientFormData {
  return {
    status: "리드", companyName: "", industry: "", advertiserName: "",
    advertiserContact: "", contactEmail: "", businessNumber: "", category: "",
    products: [], monthlyAvg: "", inboundDate: "", inboundRoute: "",
    endDate: "", endReason: "", assignedTeam, assignedPerson: "", notes: "",
  };
}

export default function ClientsPage() {
  const [role] = useCurrentRole();
  const isAdmin = role === "Admin";

  const [clients,      setClients]      = useState<Client[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [activeTab,    setActiveTab]    = useState<TabKey>("전체");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("전체");
  const [search,       setSearch]       = useState("");
  const [teamFilter,   setTeamFilter]   = useState<TeamFilter>("전체");
  const [viewMode,     setViewMode]     = useState<ViewMode>("team");
  const [modal,        setModal]        = useState<"create" | null>(null);
  const [editClient,   setEditClient]   = useState<ClientFormData | null>(null);
  const [viewProject,  setViewProject]  = useState<ProjectFormData | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [deleting,     setDeleting]     = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/clients")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setClients(data.clients);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    setDeleting(id);
    const res = await fetch(`/api/clients/${id}`, {
      method: "DELETE",
      headers: { "X-User-Role": role },
    });
    setDeleting(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "삭제에 실패했습니다.");
      return;
    }
    setDeleteTarget(null);
    load();
  }

  function canDelete(client: Client): boolean {
    if ((client.projectCount ?? 0) === 0) return true;
    return isAdmin;
  }

  const teamBase = teamFilter === "전체"
    ? clients
    : clients.filter((c) => c.assignedTeam === teamFilter);

  const categoryBase = categoryFilter === "전체"
    ? teamBase
    : teamBase.filter((c) => c.category === categoryFilter);

  const tabCounts: Record<TabKey, number> = {
    전체: categoryBase.length,
    리드: categoryBase.filter((c) => c.status === "리드").length,
    진행: categoryBase.filter((c) => c.status === "진행").length,
    종료: categoryBase.filter((c) => c.status === "종료").length,
  };

  const categoryCounts: Record<CategoryFilter, number> = {
    전체: teamBase.filter((c) => activeTab === "전체" || c.status === activeTab).length,
    B2B:  teamBase.filter((c) => (activeTab === "전체" || c.status === activeTab) && c.category === "B2B").length,
    B2C:  teamBase.filter((c) => (activeTab === "전체" || c.status === activeTab) && c.category === "B2C").length,
  };

  const filtered = categoryBase.filter(
    (c) =>
      (activeTab === "전체" || c.status === activeTab) &&
      (search === "" ||
        c.companyName.includes(search) ||
        c.advertiserName.includes(search) ||
        c.industry.includes(search))
  );

  const activeColor = TABS.find((t) => t.key === activeTab)!.color;

  return (
    <div className="space-y-5">
      {modal === "create" && (
        <ClientModal
          initial={null}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}

      {editClient !== null && (
        <ClientModal
          initial={editClient}
          onClose={() => setEditClient(null)}
          onSaved={() => { setEditClient(null); load(); }}
          onDelete={(id) => { setEditClient(null); handleDelete(id); }}
          onViewProject={(p) => setViewProject(linkedProjectToFormData(p))}
        />
      )}

      {viewProject !== null && (
        <ProjectModal
          initial={viewProject}
          onClose={() => setViewProject(null)}
          onSaved={() => { setViewProject(null); load(); }}
          onDelete={async (id) => {
            await fetch(`/api/projects/${id}`, { method: "DELETE" });
            setViewProject(null);
            load();
          }}
        />
      )}

      {deleteTarget !== null && (
        <DeleteConfirmModal
          companyName={deleteTarget.companyName}
          onConfirm={() => handleDelete(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "#191F28" }}>광고주 관리</h1>
          <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>
            총 {clients.length}명 ·{" "}
            <span style={{ color: "#3182F6" }}>진행중 {clients.filter(c => c.status === "진행").length}명</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* 뷰 모드 토글 */}
          <div className="flex gap-0.5 p-0.5 rounded-xl" style={{ background: "#F1F5F9" }}>
            {([["team","팀별"],["list","목록"]] as [ViewMode,string][]).map(([mode, label]) => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: viewMode === mode ? "#fff" : "transparent",
                  color:      viewMode === mode ? "#191F28" : "#94A3B8",
                  boxShadow:  viewMode === mode ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                }}>
                {mode === "team"
                  ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                }
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setModal("create")}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            광고주 추가
          </button>
        </div>
      </div>

      {/* 팀 필터 */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold" style={{ color: "#64748B" }}>팀</span>
        <div className="flex gap-1.5">
          {TEAM_FILTERS.map((t) => {
            const isActive = teamFilter === t;
            const color    = TEAM_COLOR[t] ?? "#191F28";
            const count    = t === "전체" ? clients.length : clients.filter(c => c.assignedTeam === t).length;
            return (
              <button key={t} onClick={() => setTeamFilter(t)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                style={{
                  background: isActive ? `${color}15` : "#F8FAFC",
                  color:      isActive ? color : "#64748B",
                  border:     `1px solid ${isActive ? `${color}40` : "#E9EBEF"}`,
                }}>
                {t !== "전체" && (
                  <span className="w-2 h-2 rounded-full" style={{ background: isActive ? color : "#CBD5E1" }} />
                )}
                {t}
                <span className="text-xs font-bold" style={{ color: isActive ? color : "#B0B8C1" }}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 팀별 뷰 */}
      {viewMode === "team" && !loading && (
        <div className="space-y-4">
          {(["영업 1팀", "영업 2팀", ""] as const).map((teamKey) => {
            const teamClients = filtered.filter(c =>
              teamKey === "" ? (!c.assignedTeam || !["영업 1팀","영업 2팀"].includes(c.assignedTeam)) : c.assignedTeam === teamKey
            );
            const color = TEAM_COLOR[teamKey] ?? "#94A3B8";
            const label = teamKey || "미지정";
            if (teamFilter !== "전체" && teamKey !== teamFilter) return null;
            return (
              <div key={teamKey || "none"} className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: `1px solid ${color}30` }}>
                {/* 팀 헤더 */}
                <div className="flex items-center justify-between px-5 py-3.5" style={{ background: `${color}08`, borderBottom: "1px solid #F1F5F9" }}>
                  <div className="flex items-center gap-3">
                    {teamKey ? <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} /> : <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />}
                    <span className="text-sm font-bold" style={{ color: teamKey ? color : "#94A3B8" }}>{label}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: `${color}15`, color: teamKey ? color : "#94A3B8" }}>
                      {teamClients.length}명
                    </span>
                    {teamClients.filter(c=>c.status==="진행").length > 0 && (
                      <span className="text-xs" style={{ color: "#3182F6" }}>진행중 {teamClients.filter(c=>c.status==="진행").length}명</span>
                    )}
                  </div>
                  <button onClick={() => setEditClient(emptyClientForm(teamKey))}
                    className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-xl transition-colors"
                    style={{ color, background: `${color}10` }}
                    onMouseEnter={e=>(e.currentTarget.style.background=`${color}20`)}
                    onMouseLeave={e=>(e.currentTarget.style.background=`${color}10`)}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    광고주 추가
                  </button>
                </div>
                {teamClients.length === 0 ? (
                  <div className="py-8 text-center text-xs" style={{ color: "#CBD5E1" }}>등록된 광고주가 없습니다.</div>
                ) : (
                  <ClientTable clients={teamClients} deleting={deleting} onEdit={(c) => setEditClient(toFormData(c))} onDelete={(c) => setDeleteTarget(c)} canDelete={canDelete} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 목록 뷰 카드 */}
      {viewMode === "list" && <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E9EBEF" }}>

        {/* 탭 + 필터 + 검색 */}
        <div className="px-6 pt-5" style={{ borderBottom: "1px solid #F1F5F9" }}>
          <div className="flex items-center justify-between mb-4">
            {/* 상태 탭 */}
            <div className="flex gap-1">
              {TABS.map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className="relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors"
                    style={{
                      color: isActive ? tab.color : "#94A3B8",
                      borderBottom: isActive ? `2px solid ${tab.color}` : "2px solid transparent",
                      marginBottom: "-1px",
                      background: "transparent",
                    }}
                  >
                    {tab.label}
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-full font-bold"
                      style={{
                        background: isActive ? `${tab.color}15` : "#F1F5F9",
                        color: isActive ? tab.color : "#94A3B8",
                      }}
                    >
                      {tabCounts[tab.key]}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* B2B / B2C 필터 + 검색 */}
            <div className="flex items-center gap-3">
              {/* 세그먼트 컨트롤 */}
              <div className="flex items-center p-0.5 rounded-xl gap-0.5" style={{ background: "#F1F5F9" }}>
                {(["전체", "B2B", "B2C"] as CategoryFilter[]).map((cat) => {
                  const isActive = categoryFilter === cat;
                  const catColor = cat === "B2B" ? "#6366F1" : cat === "B2C" ? "#10B981" : "#191F28";
                  return (
                    <button
                      key={cat}
                      onClick={() => setCategoryFilter(cat)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                      style={{
                        background: isActive ? "#FFFFFF" : "transparent",
                        color: isActive ? catColor : "#94A3B8",
                        boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                      }}
                    >
                      {cat !== "전체" && (
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: isActive ? catColor : "#CBD5E1" }} />
                      )}
                      {cat}
                      <span
                        className="px-1.5 py-0.5 rounded-full font-bold"
                        style={{
                          fontSize: 10,
                          background: isActive ? `${catColor}18` : "transparent",
                          color: isActive ? catColor : "#CBD5E1",
                        }}
                      >
                        {categoryCounts[cat]}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* 검색 */}
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="업체명, 담당자, 업종 검색"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 pr-4 py-2 text-sm rounded-xl outline-none transition-all"
                  style={{ background: "#F8FAFC", border: "1px solid #E9EBEF", color: "#191F28", width: "220px" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = activeColor)}
                  onBlur={(e)  => (e.currentTarget.style.borderColor = "#E9EBEF")}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 본문 */}
        {loading && <div className="py-16 text-center text-sm" style={{ color: "#94A3B8" }}>데이터를 불러오는 중...</div>}
        {error   && <div className="py-16 text-center text-sm" style={{ color: "#EF4444" }}>데이터 로드 실패: {error}</div>}
        {!loading && !error && (
          <div className="overflow-x-auto">
            {activeTab === "전체" && <AllTable    data={filtered} onEdit={(c) => setEditClient(toFormData(c))} onDelete={(c) => setDeleteTarget(c)} deleting={deleting} canDelete={canDelete} />}
            {activeTab === "리드" && <LeadTable   data={filtered} onEdit={(c) => setEditClient(toFormData(c))} onDelete={(c) => setDeleteTarget(c)} deleting={deleting} canDelete={canDelete} />}
            {activeTab === "진행" && <ActiveTable data={filtered} onEdit={(c) => setEditClient(toFormData(c))} onDelete={(c) => setDeleteTarget(c)} deleting={deleting} canDelete={canDelete} />}
            {activeTab === "종료" && <EndedTable  data={filtered} onEdit={(c) => setEditClient(toFormData(c))} onDelete={(c) => setDeleteTarget(c)} deleting={deleting} canDelete={canDelete} />}
            {filtered.length === 0 && (
              <div className="py-16 text-center text-sm" style={{ color: "#94A3B8" }}>검색 결과가 없습니다.</div>
            )}
          </div>
        )}
      </div>}
    </div>
  );
}

/* ── 팀별 뷰용 공통 테이블 ── */
interface ClientTableProps { clients: Client[]; deleting: string | null; onEdit: (c: Client) => void; onDelete: (c: Client) => void; canDelete?: (c: Client) => boolean; }
function ClientTable({ clients, deleting, onEdit, onDelete, canDelete }: ClientTableProps) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr style={{ background: "#F8FAFC" }}>
          {["구분","업체명","업종","담당자","업체담당자","연락처","상품종류","상태",""].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold" style={{ color: "#64748B" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {clients.map(c => {
          const ss = STATUS_STYLE[c.status];
          return (
            <tr key={c.id} className="border-t cursor-pointer"
              style={{ borderColor: "#F1F5F9" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(49,130,246,0.02)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              onClick={() => onEdit(c)}>
              <td className="px-4 py-3"><CategoryBadge category={c.category} /></td>
              <td className="px-4 py-3 font-semibold" style={{ color: "#191F28" }}>{c.companyName}</td>
              <td className="px-4 py-3 text-xs" style={{ color: "#64748B" }}>{c.industry || "—"}</td>
              <td className="px-4 py-3 text-xs" style={{ color: "#475569" }}>{c.assignedPerson || "—"}</td>
              <td className="px-4 py-3 text-xs" style={{ color: "#475569" }}>{c.advertiserName || "—"}</td>
              <td className="px-4 py-3 text-xs" style={{ color: "#64748B" }}>{c.advertiserContact || "—"}</td>
              <td className="px-4 py-3"><div className="flex flex-wrap gap-0.5">{(c.products ?? []).map(p => <ProductBadge key={p} label={p} />)}</div></td>
              <td className="px-4 py-3">
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: ss.bg, color: ss.color }}>{ss.label}</span>
              </td>
              <td className="px-4 py-3">
                {(() => {
                  const allowed = canDelete ? canDelete(c) : true;
                  return (
                    <button onClick={e => { e.stopPropagation(); if (allowed) onDelete(c); }}
                      disabled={deleting === c.id || !allowed}
                      title={!allowed ? "연결된 프로젝트가 있어 관리자만 삭제할 수 있습니다." : ""}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ opacity: allowed ? 0.3 : 0.15, cursor: allowed ? "pointer" : "not-allowed" }}
                      onMouseEnter={e => { if (allowed) e.currentTarget.style.opacity = "1"; }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = allowed ? "0.3" : "0.15"; }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={allowed ? "#EF4444" : "#94A3B8"} strokeWidth="2" strokeLinecap="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                        <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                      </svg>
                    </button>
                  );
                })()}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ── 공통 액션 버튼 ── */
interface ActionProps {
  client: Client;
  onEdit: (c: Client) => void;
  onDelete: (c: Client) => void;
  deleting: string | null;
  canDelete?: (c: Client) => boolean;
}
function Actions({ client, onEdit, onDelete, deleting, canDelete }: ActionProps) {
  const allowed = canDelete ? canDelete(client) : true;
  return (
    <td className="px-4 py-3.5">
      <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(client); }}
          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          title="수정"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); if (allowed) onDelete(client); }}
          disabled={deleting === client.id || !allowed}
          className="p-1.5 rounded-lg transition-colors disabled:opacity-40"
          style={{ background: allowed ? "rgba(239,68,68,0.08)" : "#F1F5F9", cursor: allowed ? "pointer" : "not-allowed" }}
          onMouseEnter={(e) => { if (allowed) e.currentTarget.style.background = "rgba(239,68,68,0.18)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = allowed ? "rgba(239,68,68,0.08)" : "#F1F5F9"; }}
          title={!allowed ? "연결된 프로젝트가 있어 관리자만 삭제할 수 있습니다." : "삭제"}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={allowed ? "#EF4444" : "#CBD5E1"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
      </div>
    </td>
  );
}

/* ── 공통 헤더/행 ── */
function THead({ headers }: { headers: string[] }) {
  return (
    <thead>
      <tr style={{ background: "#F8FAFC" }}>
        {headers.map((h) => (
          <th key={h} className="px-5 py-3 text-left font-semibold text-xs whitespace-nowrap" style={{ color: "#64748B" }}>{h}</th>
        ))}
        <th className="px-4 py-3 w-20" />
      </tr>
    </thead>
  );
}

function TR({ children, status, onClick }: { children: React.ReactNode; status: Status; onClick?: () => void }) {
  const hoverBg = status === "리드" ? "rgba(139,92,246,0.04)" : status === "진행" ? "rgba(49,130,246,0.04)" : "#F8FAFC";
  return (
    <tr
      className="border-t group cursor-pointer"
      style={{ borderColor: "#F1F5F9" }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = hoverBg)}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

/* ── 테이블 컴포넌트들 ── */
interface TableProps { data: Client[]; onEdit: (c: Client) => void; onDelete: (c: Client) => void; deleting: string | null; canDelete?: (c: Client) => boolean; }

function AllTable({ data, onEdit, onDelete, deleting, canDelete }: TableProps) {
  return (
    <table className="w-full text-sm">
      <THead headers={["상태", "구분", "업체명", "업종", "담당팀", "담당자", "업체담당자", "연락처", "상품종류"]} />
      <tbody>
        {data.map((c) => {
          const s = STATUS_STYLE[c.status];
          return (
            <TR key={c.id} status={c.status} onClick={() => onEdit(c)}>
              <td className="px-5 py-3.5">
                <span className="text-xs px-2.5 py-1 rounded-full font-semibold whitespace-nowrap" style={{ background: s.bg, color: s.color }}>{s.label}</span>
              </td>
              <td className="px-5 py-3.5"><CategoryBadge category={c.category} /></td>
              <td className="px-5 py-3.5 font-semibold" style={{ color: "#191F28" }}>{c.companyName}</td>
              <td className="px-5 py-3.5 text-xs" style={{ color: "#64748B" }}>{c.industry}</td>
              <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>{c.assignedTeam || "—"}</td>
              <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>{c.assignedPerson || "—"}</td>
              <td className="px-5 py-3.5" style={{ color: "#475569" }}>{c.advertiserName}</td>
              <td className="px-5 py-3.5 text-xs" style={{ color: "#64748B" }}>{c.advertiserContact}</td>
              <td className="px-5 py-3.5"><div className="flex flex-wrap">{c.products.map((p) => <ProductBadge key={p} label={p} />)}</div></td>
              <Actions client={c} onEdit={onEdit} onDelete={onDelete} deleting={deleting} canDelete={canDelete} />
            </TR>
          );
        })}
      </tbody>
    </table>
  );
}

function LeadTable({ data, onEdit, onDelete, deleting, canDelete }: TableProps) {
  return (
    <table className="w-full text-sm">
      <THead headers={["구분", "업체명", "업종", "담당팀", "담당자", "업체담당자", "연락처", "상품종류", "인입 날짜", "인입 경로"]} />
      <tbody>
        {data.map((c) => (
          <TR key={c.id} status={c.status} onClick={() => onEdit(c)}>
            <td className="px-5 py-3.5"><CategoryBadge category={c.category} /></td>
            <td className="px-5 py-3.5 font-semibold" style={{ color: "#191F28" }}>{c.companyName}</td>
            <td className="px-5 py-3.5 text-xs" style={{ color: "#64748B" }}>{c.industry}</td>
            <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>{c.assignedTeam || "—"}</td>
            <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>{c.assignedPerson || "—"}</td>
            <td className="px-5 py-3.5" style={{ color: "#475569" }}>{c.advertiserName}</td>
            <td className="px-5 py-3.5 text-xs" style={{ color: "#64748B" }}>{c.advertiserContact}</td>
            <td className="px-5 py-3.5"><div className="flex flex-wrap">{c.products.map((p) => <ProductBadge key={p} label={p} />)}</div></td>
            <td className="px-5 py-3.5 text-xs" style={{ color: "#94A3B8" }}>{c.inboundDate || "—"}</td>
            <td className="px-5 py-3.5">
              <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: "#F1F5F9", color: "#475569" }}>{c.inboundRoute || "—"}</span>
            </td>
            <Actions client={c} onEdit={onEdit} onDelete={onDelete} deleting={deleting} canDelete={canDelete} />
          </TR>
        ))}
      </tbody>
    </table>
  );
}

function ActiveTable({ data, onEdit, onDelete, deleting, canDelete }: TableProps) {
  return (
    <table className="w-full text-sm">
      <THead headers={["구분", "업체명", "업종", "담당팀", "담당자", "업체담당자", "연락처", "상품종류", "인입 경로"]} />
      <tbody>
        {data.map((c) => (
          <TR key={c.id} status={c.status} onClick={() => onEdit(c)}>
            <td className="px-5 py-3.5"><CategoryBadge category={c.category} /></td>
            <td className="px-5 py-3.5 font-semibold" style={{ color: "#191F28" }}>{c.companyName}</td>
            <td className="px-5 py-3.5 text-xs" style={{ color: "#64748B" }}>{c.industry}</td>
            <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>{c.assignedTeam || "—"}</td>
            <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>{c.assignedPerson || "—"}</td>
            <td className="px-5 py-3.5" style={{ color: "#475569" }}>{c.advertiserName}</td>
            <td className="px-5 py-3.5 text-xs" style={{ color: "#64748B" }}>{c.advertiserContact}</td>
            <td className="px-5 py-3.5"><div className="flex flex-wrap">{c.products.map((p) => <ProductBadge key={p} label={p} />)}</div></td>
            <td className="px-5 py-3.5">
              <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: "#F1F5F9", color: "#475569" }}>{c.inboundRoute || "—"}</span>
            </td>
            <Actions client={c} onEdit={onEdit} onDelete={onDelete} deleting={deleting} canDelete={canDelete} />
          </TR>
        ))}
      </tbody>
    </table>
  );
}

function EndedTable({ data, onEdit, onDelete, deleting, canDelete }: TableProps) {
  return (
    <table className="w-full text-sm">
      <THead headers={["구분", "업체명", "업종", "담당팀", "담당자", "업체담당자", "연락처", "상품종류", "종료 날짜", "종료 사유"]} />
      <tbody>
        {data.map((c) => (
          <TR key={c.id} status={c.status} onClick={() => onEdit(c)}>
            <td className="px-5 py-3.5"><CategoryBadge category={c.category} /></td>
            <td className="px-5 py-3.5 font-semibold" style={{ color: "#191F28" }}>{c.companyName}</td>
            <td className="px-5 py-3.5 text-xs" style={{ color: "#64748B" }}>{c.industry}</td>
            <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>{c.assignedTeam || "—"}</td>
            <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>{c.assignedPerson || "—"}</td>
            <td className="px-5 py-3.5" style={{ color: "#475569" }}>{c.advertiserName}</td>
            <td className="px-5 py-3.5 text-xs" style={{ color: "#64748B" }}>{c.advertiserContact}</td>
            <td className="px-5 py-3.5"><div className="flex flex-wrap">{c.products.map((p) => <ProductBadge key={p} label={p} />)}</div></td>
            <td className="px-5 py-3.5 text-xs" style={{ color: "#94A3B8" }}>{c.endDate || "—"}</td>
            <td className="px-5 py-3.5">
              <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: "#F1F5F9", color: "#64748B" }}>{c.endReason || "—"}</span>
            </td>
            <Actions client={c} onEdit={onEdit} onDelete={onDelete} deleting={deleting} canDelete={canDelete} />
          </TR>
        ))}
      </tbody>
    </table>
  );
}
