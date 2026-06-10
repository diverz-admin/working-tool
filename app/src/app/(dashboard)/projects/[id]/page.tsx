"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import ProjectModal, { ProjectFormData } from "@/components/projects/ProjectModal";
import ClientModal, { ClientFormData } from "@/components/clients/ClientModal";

interface ProjectGroup {
  id: string;
  name: string;
  clientId: string | null;
  assignedTeam: string | null;
  assignedPerson: string | null;
  status: string;
  notes: string | null;
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
  isExtended: boolean | null;
  placeLink: string | null;
  assignedTeam: string | null;
  assignedPerson: string | null;
  clientId: string | null;
  advertiser: string | null;
  projectGroupId: string | null;
  daysRemaining: number | null;
  revenueTotal: number;
  revenueCompleted: number;
  costTotal: number;
  costCompleted: number;
  notes: string | null;
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
    startDate:      c.startDate ?? "",
    endDate:        c.endDate ?? "",
    placeLink:      c.placeLink ?? "",
    notes:          c.notes ?? "",
    isExtended:     c.isExtended ?? false,
  };
}

function DaysBadge({ days }: { days: number | null }) {
  if (days === null) return <span style={{ color: "#CBD5E1" }}>—</span>;
  const color = days < 0 ? "#94A3B8" : days <= 1 ? "#EF4444" : days <= 3 ? "#F97316" : days <= 7 ? "#EAB308" : "#3182F6";
  const label = days < 0 ? "종료됨" : days === 0 ? "D-0" : `D-${days}`;
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: `${color}18`, color }}>{label}</span>
  );
}

function ProgressBadge({ completed, total, label }: { completed: number; total: number; label: string }) {
  if (total === 0) return <span className="text-xs" style={{ color: "#CBD5E1" }}>—</span>;
  const isComplete = completed === total;
  const hasProgress = completed > 0;
  const color = isComplete ? "#10B981" : hasProgress ? "#F59E0B" : "#94A3B8";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-bold" style={{ color: "#64748B" }}>{label}</span>
      <span className="text-xs font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{ background: `${color}18`, color }}>
        {isComplete ? `✓ ${total}` : `${completed}/${total}`}
      </span>
    </div>
  );
}

function wonFmt(n: number | null | undefined) {
  if (!n) return "—";
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억`;
  if (n >= 10000)     return `${(n / 10000).toFixed(0)}만원`;
  return `${n.toLocaleString()}원`;
}

function ProjectGroupPageInner() {
  const { id } = useParams<{ id: string }>();
  const router       = useRouter();
  const searchParams = useSearchParams();
  const openCampaignId = searchParams.get("campaign");

  const [group,       setGroup]       = useState<ProjectGroup | null>(null);
  const [campaigns,   setCampaigns]   = useState<Campaign[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [modal,       setModal]       = useState<"create" | null>(null);
  const [editCampaign, setEditCampaign] = useState<ProjectFormData | null>(null);
  const [viewClient,  setViewClient]  = useState<ClientFormData | null>(null);
  const [deleting,    setDeleting]    = useState<string | null>(null);
  const [typeFilter,  setTypeFilter]  = useState<"전체" | "관리형" | "보장형">("전체");
  const [statusFilter, setStatusFilter] = useState<"전체" | "리드" | "진행" | "종료">("전체");

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/project-groups/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setGroup(d.group ?? null);
        setCampaigns(d.campaigns ?? []);
      })
      .finally(() => setLoading(false));
  }, [id]);

  // ?campaign=xxx 쿼리 파라미터로 캠페인 모달 자동 오픈
  useEffect(() => {
    if (!openCampaignId || campaigns.length === 0) return;
    const target = campaigns.find((c) => c.id === openCampaignId);
    if (target) setEditCampaign(toCampaignFormData(target));
  }, [openCampaignId, campaigns]);

  useEffect(() => { load(); }, [load]);

  async function handleDeleteCampaign(campaignId: string) {
    if (!confirm("캠페인을 삭제하시겠습니까? 매출·매입 데이터도 모두 삭제됩니다.")) return;
    setDeleting(campaignId);
    const res = await fetch(`/api/projects/${campaignId}`, { method: "DELETE" });
    setDeleting(null);
    if (!res.ok) { alert("삭제에 실패했습니다."); return; }
    load();
  }

  async function handleDeleteGroup() {
    if (!confirm("프로젝트를 삭제하면 모든 캠페인·매출·매입 데이터가 삭제됩니다. 계속하시겠습니까?")) return;
    await fetch(`/api/project-groups/${id}`, { method: "DELETE" });
    router.push("/projects");
  }

  async function handleViewClient(clientId: string) {
    const res = await fetch(`/api/clients/${clientId}`);
    const { client } = await res.json();
    if (!client) return;
    setViewClient({
      id: client.id,
      status: client.status as "리드" | "진행" | "종료",
      companyName: client.companyName,
      industry: client.industry ?? "",
      advertiserName: client.advertiserName ?? "",
      advertiserContact: client.advertiserContact ?? "",
      contactEmail: client.contactEmail ?? "",
      businessNumber: client.businessNumber ?? "",
      category: client.category ?? "",
      products: client.products ?? [],
      monthlyAvg: client.monthlyAvg != null ? String(client.monthlyAvg) : "",
      inboundDate: client.inboundDate ?? "",
      inboundRoute: client.inboundRoute ?? "",
      endDate: client.endDate ?? "",
      endReason: client.endReason ?? "",
      assignedTeam: client.assignedTeam ?? "",
      assignedPerson: client.assignedPerson ?? "",
      notes: client.notes ?? "",
    });
  }

  const filtered = campaigns.filter(
    (c) =>
      (statusFilter === "전체" || c.status === statusFilter) &&
      (typeFilter === "전체" || c.projectType === typeFilter)
  );

  const activeCnt = campaigns.filter((c) => c.status === "진행").length;
  const totalRevenue = campaigns.reduce((s, c) => s + (c.contractAmount ?? 0), 0);

  if (loading) {
    return <div className="py-32 text-center text-sm" style={{ color: "#94A3B8" }}>데이터를 불러오는 중...</div>;
  }

  if (!group) {
    return <div className="py-32 text-center text-sm" style={{ color: "#EF4444" }}>프로젝트를 찾을 수 없습니다.</div>;
  }

  return (
    <div className="space-y-5">
      {/* 캠페인 모달 */}
      {modal === "create" && (
        <ProjectModal
          initial={null}
          projectGroupId={id}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
          onViewClient={handleViewClient}
        />
      )}
      {editCampaign !== null && (
        <ProjectModal
          initial={editCampaign}
          projectGroupId={id}
          onClose={() => setEditCampaign(null)}
          onSaved={() => { setEditCampaign(null); load(); }}
          onDelete={(cid) => handleDeleteCampaign(cid)}
          onViewClient={handleViewClient}
        />
      )}
      {viewClient !== null && (
        <ClientModal
          initial={viewClient}
          onClose={() => setViewClient(null)}
          onSaved={() => { setViewClient(null); load(); }}
          onDelete={async (cid) => {
            await fetch(`/api/clients/${cid}`, { method: "DELETE" });
            setViewClient(null); load();
          }}
        />
      )}

      {/* 상단 네비 */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push("/projects")}
          className="flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-60"
          style={{ color: "#64748B" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          프로젝트 목록
        </button>
        <button
          onClick={handleDeleteGroup}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border-2 transition-all hover:bg-red-50"
          style={{ borderColor: "#EF4444", color: "#EF4444" }}
        >
          프로젝트 삭제
        </button>
      </div>

      {/* 프로젝트 헤더 카드 */}
      <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E9EBEF" }}>
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold" style={{ color: "#191F28" }}>{group.name}</h1>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{
                background: group.status === "진행" ? "rgba(49,130,246,0.1)" : "#F1F5F9",
                color:      group.status === "진행" ? "#3182F6" : "#64748B",
              }}>{group.status}</span>
            </div>
            <div className="flex items-center gap-4 text-xs" style={{ color: "#64748B" }}>
              {group.assignedTeam && <span>팀: <strong>{group.assignedTeam}</strong></span>}
              {group.assignedPerson && <span>담당자: <strong>{group.assignedPerson}</strong></span>}
            </div>
            {group.notes && <p className="text-xs" style={{ color: "#94A3B8" }}>{group.notes}</p>}
          </div>
          <div className="flex gap-4 text-right">
            <div>
              <p className="text-xs" style={{ color: "#94A3B8" }}>총 캠페인</p>
              <p className="text-lg font-bold" style={{ color: "#191F28" }}>{campaigns.length}개</p>
            </div>
            <div>
              <p className="text-xs" style={{ color: "#94A3B8" }}>진행중</p>
              <p className="text-lg font-bold" style={{ color: "#3182F6" }}>{activeCnt}개</p>
            </div>
            {totalRevenue > 0 && (
              <div>
                <p className="text-xs" style={{ color: "#94A3B8" }}>총 계약금액</p>
                <p className="text-lg font-bold" style={{ color: "#10B981" }}>{wonFmt(totalRevenue)}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 캠페인 목록 */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E9EBEF" }}>

        {/* 필터 + 추가 버튼 */}
        <div className="px-6 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #F1F5F9", background: "#F8FAFC" }}>
          <div className="flex items-center gap-4">
            {/* 상태 필터 */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold" style={{ color: "#64748B" }}>상태</span>
              <div className="flex p-0.5 rounded-xl gap-0.5" style={{ background: "#E9EBEF" }}>
                {(["전체", "리드", "진행", "종료"] as const).map((s) => {
                  const color = s === "진행" ? "#3182F6" : s === "리드" ? "#8B5CF6" : s === "종료" ? "#64748B" : "#191F28";
                  const isA = statusFilter === s;
                  return (
                    <button key={s} onClick={() => setStatusFilter(s)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                      style={{ background: isA ? "#FFFFFF" : "transparent", color: isA ? color : "#94A3B8",
                        boxShadow: isA ? "0 1px 4px rgba(0,0,0,0.10)" : "none" }}>
                      {s === "진행" ? "진행중" : s}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* 유형 필터 */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold" style={{ color: "#64748B" }}>유형</span>
              <div className="flex gap-1">
                {(["전체", "관리형", "보장형"] as const).map((t) => {
                  const color = t === "관리형" ? "#3182F6" : t === "보장형" ? "#8B5CF6" : "#475569";
                  const bg    = t === "관리형" ? "rgba(49,130,246,0.1)" : t === "보장형" ? "rgba(139,92,246,0.1)" : "#F1F5F9";
                  const bd    = t === "관리형" ? "rgba(49,130,246,0.35)" : t === "보장형" ? "rgba(139,92,246,0.35)" : "#CBD5E1";
                  const isA = typeFilter === t;
                  return (
                    <button key={t} onClick={() => setTypeFilter(t)}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                      style={{ background: isA ? bg : "#FFFFFF", color: isA ? color : "#94A3B8",
                        border: `1.5px solid ${isA ? bd : "#E9EBEF"}` }}>
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <button
            onClick={() => setModal("create")}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "#3182F6" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            캠페인 추가
          </button>
        </div>

        {/* 캠페인 테이블 */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "#F8FAFC" }}>
                {["캠페인명", "유형", "상품", "계약기간", "잔여일", "계약금액", "매출", "매입", "상태"].map((h) => (
                  <th key={h} className="px-5 py-3 text-left font-semibold text-xs whitespace-nowrap" style={{ color: "#64748B" }}>{h}</th>
                ))}
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className="border-t group cursor-pointer"
                  style={{ borderColor: "#F1F5F9" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(49,130,246,0.03)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                  onClick={() => setEditCampaign(toCampaignFormData(c))}
                >
                  {/* 캠페인명 */}
                  <td className="px-5 py-3.5 font-semibold" style={{ color: "#191F28" }}>
                    <div className="flex items-center gap-1.5">
                      {c.placeLink && (
                        <a href={c.placeLink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                          className="opacity-0 group-hover:opacity-100 transition-opacity" title="플레이스 링크">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#3182F6" strokeWidth="2" strokeLinecap="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                            <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                          </svg>
                        </a>
                      )}
                      {c.campaignName}
                      {c.isExtended && (
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded-md"
                          style={{ background: "rgba(99,102,241,0.1)", color: "#6366F1" }}>연장</span>
                      )}
                    </div>
                  </td>
                  {/* 유형 */}
                  <td className="px-5 py-3.5">
                    {c.projectType ? (
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{
                        background: c.projectType === "관리형" ? "rgba(49,130,246,0.1)" : "rgba(139,92,246,0.1)",
                        color:      c.projectType === "관리형" ? "#3182F6" : "#8B5CF6",
                      }}>{c.projectType}</span>
                    ) : <span style={{ color: "#CBD5E1" }}>—</span>}
                  </td>
                  {/* 상품 */}
                  <td className="px-5 py-3.5">
                    {c.product ? (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: "rgba(49,130,246,0.1)", color: "#3182F6" }}>{c.product}</span>
                    ) : <span style={{ color: "#CBD5E1" }}>—</span>}
                  </td>
                  {/* 계약기간 */}
                  <td className="px-5 py-3.5 text-xs" style={{ color: "#94A3B8" }}>
                    {c.startDate || c.endDate ? `${c.startDate ?? "?"} ~ ${c.endDate ?? "?"}` : "—"}
                  </td>
                  {/* 잔여일 */}
                  <td className="px-5 py-3.5"><DaysBadge days={c.daysRemaining} /></td>
                  {/* 계약금액 */}
                  <td className="px-5 py-3.5 text-xs font-semibold" style={{ color: "#3182F6" }}>
                    {wonFmt(c.contractAmount)}
                  </td>
                  {/* 매출 진행 */}
                  <td className="px-5 py-3.5">
                    <ProgressBadge completed={c.revenueCompleted} total={c.revenueTotal} label="매출" />
                  </td>
                  {/* 매입 진행 */}
                  <td className="px-5 py-3.5">
                    <ProgressBadge completed={c.costCompleted} total={c.costTotal} label="매입" />
                  </td>
                  {/* 상태 */}
                  <td className="px-5 py-3.5">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{
                      background: c.status === "진행" ? "rgba(49,130,246,0.1)" : c.status === "리드" ? "rgba(139,92,246,0.1)" : "#F1F5F9",
                      color:      c.status === "진행" ? "#3182F6" : c.status === "리드" ? "#8B5CF6" : "#64748B",
                    }}>{c.status === "진행" ? "진행중" : c.status}</span>
                  </td>
                  {/* 액션 */}
                  <td className="px-4 py-3.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteCampaign(c.id); }}
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-16 text-center text-sm" style={{ color: "#94A3B8" }}>
              캠페인이 없습니다. 캠페인을 추가해주세요.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProjectGroupPage() {
  return (
    <Suspense fallback={null}>
      <ProjectGroupPageInner />
    </Suspense>
  );
}
