"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface Client {
  id: string;
  companyName: string;
  status: string;
}

interface Tracker {
  id: string;
  clientId: string | null;
  platform: string;
  keyword: string;
  targetType: string;
  targetValue: string;
  isActive: boolean;
  createdAt: string;
  latestRanking: { rank: number | null; totalResults: number | null; checkedAt: string } | null;
}

interface Ranking {
  id: string;
  rank: number | null;
  totalResults: number | null;
  checkedAt: string;
}

const SHOPPING_TARGET_TYPES = ["mall", "product_name", "nstore_id", "product_id"] as const;
const PLACE_TARGET_TYPES    = ["place_name", "place_id"] as const;

const TARGET_TYPE_LABELS: Record<string, string> = {
  mall:         "쇼핑몰명",
  product_id:   "카탈로그 ID",
  product_name: "상품명",
  nstore_id:    "스마트스토어 ID",
  place_name:   "업체명",
  place_id:     "플레이스 ID",
};

const PLATFORM_META: Record<string, { label: string; color: string; bg: string; maxRank: number }> = {
  shopping: { label: "쇼핑",   color: "#3182F6", bg: "rgba(49,130,246,0.1)",  maxRank: 300 },
  place:    { label: "플레이스", color: "#8B5CF6", bg: "rgba(139,92,246,0.1)", maxRank: 100 },
};

function RankBadge({ rank, platform = "shopping" }: { rank: number | null | undefined; platform?: string }) {
  const maxRank = PLATFORM_META[platform]?.maxRank ?? 300;
  if (rank == null) return <span className="text-xs font-bold" title="순위권 밖 또는 상품·업체 ID를 확인해주세요." style={{ color: "#CBD5E1" }}>{maxRank}위 밖</span>;
  const color = rank <= 3 ? "#10B981" : rank <= 10 ? "#3182F6" : rank <= 30 ? "#EAB308" : rank <= 100 ? "#F97316" : "#94A3B8";
  return (
    <span className="text-sm font-black px-2.5 py-0.5 rounded-full" style={{ background: `${color}18`, color }}>
      {rank}위
    </span>
  );
}

function PlatformBadge({ platform }: { platform: string }) {
  const meta = PLATFORM_META[platform] ?? PLATFORM_META.shopping;
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: meta.bg, color: meta.color }}>
      {meta.label}
    </span>
  );
}

function RankDelta({ tracker }: { tracker: Tracker }) {
  const rank = tracker.latestRanking?.rank;
  if (rank == null) return null;
  return null; // history 패널에서 보여줌
}

function HistoryPanel({ tracker, onClose }: { tracker: Tracker; onClose: () => void }) {
  const platform = tracker.platform ?? "shopping";
  const [rankings, setRankings] = useState<Ranking[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/reports/trackers/${tracker.id}`)
      .then((r) => r.json())
      .then((d) => setRankings(d.rankings ?? []))
      .finally(() => setLoading(false));
  }, [tracker.id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function checkNow() {
    setChecking(true);
    await fetch("/api/reports/rankings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackerId: tracker.id }),
    });
    setChecking(false);
    load();
  }

  const chartData = [...rankings]
    .reverse()
    .map((r) => ({
      date: new Date(r.checkedAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" }),
      rank: r.rank ?? 301,
    }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(22,31,51,0.5)", backdropFilter: "blur(2px)" }} onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl p-6 space-y-5" style={{ background: "#FFFFFF", boxShadow: "0 20px 60px rgba(22,31,51,0.2)" }} onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <PlatformBadge platform={platform} />
              <h3 className="text-base font-bold" style={{ color: "#191F28" }}>{tracker.keyword}</h3>
            </div>
            <p className="text-xs mt-1" style={{ color: "#94A3B8" }}>
              {TARGET_TYPE_LABELS[tracker.targetType]}: <span style={{ color: "#475569" }}>{tracker.targetValue}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={checkNow}
              disabled={checking}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-opacity hover:opacity-80 disabled:opacity-40 text-white"
              style={{ background: "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" }}
            >
              {checking ? (
                <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.08-4"/></svg>
              )}
              지금 조회
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        {/* 최신 순위 */}
        <div className="flex items-center gap-4 p-4 rounded-xl" style={{ background: "#F8FAFC" }}>
          <div>
            <p className="text-xs mb-1" style={{ color: "#94A3B8" }}>현재 순위</p>
            <RankBadge rank={rankings[0]?.rank} platform={platform} />
          </div>
          {rankings[0] && (
            <div>
              <p className="text-xs mb-1" style={{ color: "#94A3B8" }}>마지막 조회</p>
              <p className="text-xs font-medium" style={{ color: "#475569" }}>
                {new Date(rankings[0].checkedAt).toLocaleString("ko-KR")}
              </p>
            </div>
          )}
          {rankings[0]?.totalResults != null && (
            <div>
              <p className="text-xs mb-1" style={{ color: "#94A3B8" }}>전체 검색 결과</p>
              <p className="text-xs font-medium" style={{ color: "#475569" }}>
                {rankings[0].totalResults.toLocaleString()}개
              </p>
            </div>
          )}
        </div>

        {/* 차트 */}
        {loading ? (
          <div className="h-40 flex items-center justify-center text-sm" style={{ color: "#94A3B8" }}>불러오는 중...</div>
        ) : chartData.length > 1 ? (
          <div>
            <p className="text-xs font-semibold mb-3" style={{ color: "#64748B" }}>순위 추이</p>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={chartData}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                <YAxis reversed domain={["dataMin - 5", "dataMax + 5"]} tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={30} />
                <Tooltip
                  contentStyle={{ background: "#191F28", border: "none", borderRadius: 8, fontSize: 12, color: "#fff" }}
                  formatter={(v: unknown) => { const n = Number(v); return [n >= 301 ? "300위 밖" : `${n}위`, "순위"] as [string, string]; }}
                />
                <Line type="monotone" dataKey="rank" stroke="#3182F6" strokeWidth={2} dot={{ fill: "#3182F6", r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-xs text-center py-4" style={{ color: "#94A3B8" }}>조회 기록이 2개 이상이면 그래프가 표시됩니다.</p>
        )}

        {/* 기록 테이블 */}
        {rankings.length > 0 && (
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: "#64748B" }}>조회 기록</p>
            <div className="overflow-y-auto rounded-xl border" style={{ borderColor: "#E9EBEF", maxHeight: 180 }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: "#F8FAFC" }}>
                    {["조회 시각", "순위", "전체 결과"].map((h) => (
                      <th key={h} className="px-4 py-2 text-left font-semibold" style={{ color: "#64748B" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rankings.map((r) => (
                    <tr key={r.id} className="border-t" style={{ borderColor: "#F1F5F9" }}>
                      <td className="px-4 py-2" style={{ color: "#475569" }}>{new Date(r.checkedAt).toLocaleString("ko-KR")}</td>
                      <td className="px-4 py-2"><RankBadge rank={r.rank} platform={platform} /></td>
                      <td className="px-4 py-2" style={{ color: "#94A3B8" }}>{r.totalResults?.toLocaleString() ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AddTrackerModal({
  clientId,
  onClose,
  onSaved,
}: {
  clientId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [platform, setPlatform]     = useState<"shopping" | "place">("shopping");
  const [keyword, setKeyword]       = useState("");
  const [targetType, setTargetType] = useState<string>("mall");
  const [targetValue, setTargetValue] = useState("");
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const targetTypes = platform === "place" ? PLACE_TARGET_TYPES : SHOPPING_TARGET_TYPES;

  function handlePlatformChange(p: "shopping" | "place") {
    setPlatform(p);
    setTargetType(p === "place" ? "place_name" : "mall");
    setTargetValue("");
  }

  const placeholders: Record<string, string> = {
    mall:         "예: 은재홈케어",
    product_id:   "예: 84431678761 (11자리)",
    product_name: "예: 에어컨청소",
    nstore_id:    "예: 6506046581",
    place_name:   "예: 한알피부과",
    place_id:     "예: 1234567890",
  };
  const hints: Record<string, string> = {
    mall:         "쇼핑몰명 포함 일치 (대소문자 무관)",
    product_id:   "네이버 쇼핑 카탈로그 ID (11자리, search.shopping.naver.com/catalog/xxxxx)",
    product_name: "상품명 포함 일치 (대소문자 무관)",
    nstore_id:    "스마트스토어 URL의 숫자 ID (smartstore.naver.com/store/products/xxxxxxxxxx)",
    place_name:   "업체명 포함 일치 (대소문자 무관)",
    place_id:     "네이버 플레이스 ID (URL에서 확인, 정확히 일치)",
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim() || !targetValue.trim()) { setError("모든 항목을 입력해주세요."); return; }
    setSaving(true); setError(null);
    const res = await fetch("/api/reports/trackers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, platform, keyword, targetType, targetValue }),
    });
    if (!res.ok) { setSaving(false); setError("저장 실패"); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(22,31,51,0.5)", backdropFilter: "blur(2px)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "#FFFFFF", boxShadow: "0 20px 60px rgba(22,31,51,0.2)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold" style={{ color: "#191F28" }}>키워드 추가</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 플랫폼 선택 */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748B" }}>플랫폼</label>
            <div className="flex gap-2">
              {(["shopping", "place"] as const).map((p) => {
                const meta = PLATFORM_META[p];
                return (
                  <button
                    key={p} type="button"
                    onClick={() => handlePlatformChange(p)}
                    className="flex-1 py-2 text-xs font-semibold rounded-xl border transition-all"
                    style={{
                      background: platform === p ? meta.bg : "#F8FAFC",
                      borderColor: platform === p ? meta.color : "#E9EBEF",
                      color: platform === p ? meta.color : "#94A3B8",
                    }}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 검색 키워드 */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>검색 키워드</label>
            <input
              type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)}
              placeholder={platform === "place" ? "예: 강남 피부과" : "예: 에어컨 청소"}
              className="w-full px-3 py-2 text-sm rounded-xl outline-none border transition-colors focus:border-[#3182F6]"
              style={{ background: "#F8FAFC", borderColor: "#E9EBEF", color: "#191F28" }}
            />
          </div>

          {/* 추적 방식 */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>추적 방식</label>
            <div className="flex gap-2">
              {targetTypes.map((t) => {
                const meta = PLATFORM_META[platform];
                return (
                  <button
                    key={t} type="button"
                    onClick={() => setTargetType(t)}
                    className="flex-1 py-1.5 text-xs font-semibold rounded-xl border transition-all"
                    style={{
                      background: targetType === t ? `${meta.color}18` : "#F8FAFC",
                      borderColor: targetType === t ? meta.color : "#E9EBEF",
                      color: targetType === t ? meta.color : "#94A3B8",
                    }}
                  >
                    {TARGET_TYPE_LABELS[t]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 추적 값 */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>
              {TARGET_TYPE_LABELS[targetType]}
            </label>
            <input
              type="text" value={targetValue} onChange={(e) => setTargetValue(e.target.value)}
              placeholder={placeholders[targetType] ?? ""}
              className="w-full px-3 py-2 text-sm rounded-xl outline-none border transition-colors focus:border-[#3182F6]"
              style={{ background: "#F8FAFC", borderColor: "#E9EBEF", color: "#191F28" }}
            />
            <p className="text-xs mt-1.5" style={{ color: "#94A3B8" }}>{hints[targetType]}</p>
          </div>

          {error && <p className="text-xs" style={{ color: "#EF4444" }}>{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 text-sm font-medium rounded-xl border transition-colors hover:bg-slate-50" style={{ borderColor: "#E9EBEF", color: "#64748B" }}>취소</button>
            <button type="submit" disabled={saving} className="flex-1 py-2 text-sm font-semibold rounded-xl text-white transition-opacity hover:opacity-90 disabled:opacity-50" style={{ background: "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" }}>
              {saving ? "추가 중..." : "추가"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReportsInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedClientId = searchParams.get("clientId");

  const [clients, setClients] = useState<Client[]>([]);
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingTrackers, setLoadingTrackers] = useState(false);
  const [checkingAll, setCheckingAll] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [historyTracker, setHistoryTracker] = useState<Tracker | null>(null);

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((d) => setClients(d.clients ?? []))
      .finally(() => setLoadingClients(false));
  }, []);

  const loadTrackers = useCallback(() => {
    if (!selectedClientId) { setTrackers([]); return; }
    setLoadingTrackers(true);
    fetch(`/api/reports/trackers?clientId=${selectedClientId}`)
      .then((r) => r.json())
      .then((d) => setTrackers(d.trackers ?? []))
      .finally(() => setLoadingTrackers(false));
  }, [selectedClientId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadTrackers(); }, [loadTrackers]);

  async function checkAll() {
    if (!selectedClientId) return;
    setCheckingAll(true);
    const ids = trackers.map((t) => t.id);
    await Promise.all(
      ids.map((id) =>
        fetch("/api/reports/rankings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trackerId: id }),
        })
      )
    );
    setCheckingAll(false);
    loadTrackers();
  }

  async function deleteTracker(id: string) {
    await fetch(`/api/reports/trackers/${id}`, { method: "DELETE" });
    loadTrackers();
  }

  const selectedClient = clients.find((c) => c.id === selectedClientId);

  return (
    <div className="flex gap-6 h-full">
      {/* 고객사 목록 사이드 */}
      <div className="w-56 shrink-0">
        <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E9EBEF" }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: "#F1F5F9" }}>
            <p className="text-xs font-bold" style={{ color: "#191F28" }}>고객사</p>
          </div>
          {loadingClients ? (
            <div className="py-8 text-center text-xs" style={{ color: "#94A3B8" }}>로딩 중...</div>
          ) : (
            <div>
              {clients.filter(c => c.status !== "종료").map((c) => {
                const isSelected = c.id === selectedClientId;
                return (
                  <button
                    key={c.id}
                    onClick={() => router.push(`/reports?clientId=${c.id}`)}
                    className="w-full text-left px-4 py-2.5 text-xs font-medium transition-colors"
                    style={{
                      background: isSelected ? "rgba(49,130,246,0.08)" : "transparent",
                      color: isSelected ? "#3182F6" : "#475569",
                      borderLeft: isSelected ? "2px solid #3182F6" : "2px solid transparent",
                    }}
                  >
                    {c.companyName}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 메인 패널 */}
      <div className="flex-1 min-w-0">
        {!selectedClientId ? (
          <div className="h-64 flex items-center justify-center rounded-2xl" style={{ background: "#FFFFFF", border: "1px solid #E9EBEF" }}>
            <p className="text-sm" style={{ color: "#94A3B8" }}>왼쪽에서 고객사를 선택해주세요.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 헤더 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-bold" style={{ color: "#191F28" }}>{selectedClient?.companyName ?? "—"}</h2>
                <span className="text-xs" style={{ color: "#94A3B8" }}>키워드 {trackers.length}개 추적 중</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={checkAll}
                  disabled={checkingAll || trackers.length === 0}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all hover:bg-slate-50 disabled:opacity-40"
                  style={{ borderColor: "#E9EBEF", color: "#475569" }}
                >
                  {checkingAll ? (
                    <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.08-4"/></svg>
                  )}
                  전체 조회
                </button>
                <button
                  onClick={() => setShowAdd(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl text-white transition-opacity hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  키워드 추가
                </button>
              </div>
            </div>

            {/* 키워드 테이블 */}
            <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E9EBEF" }}>
              {loadingTrackers ? (
                <div className="py-16 text-center text-sm" style={{ color: "#94A3B8" }}>불러오는 중...</div>
              ) : trackers.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-sm mb-2" style={{ color: "#94A3B8" }}>추적 중인 키워드가 없습니다.</p>
                  <button onClick={() => setShowAdd(true)} className="text-xs font-semibold" style={{ color: "#3182F6" }}>+ 키워드 추가</button>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "#F8FAFC" }}>
                      {["플랫폼", "키워드", "추적 방식", "추적 값", "현재 순위", "마지막 조회", ""].map((h) => (
                        <th key={h} className="px-5 py-3 text-left font-semibold text-xs whitespace-nowrap" style={{ color: "#64748B" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {trackers.map((t) => (
                      <tr
                        key={t.id}
                        className="border-t group cursor-pointer"
                        style={{ borderColor: "#F1F5F9" }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(49,130,246,0.03)")}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                        onClick={() => setHistoryTracker(t)}
                      >
                        <td className="px-5 py-3.5"><PlatformBadge platform={t.platform ?? "shopping"} /></td>
                        <td className="px-5 py-3.5 font-semibold" style={{ color: "#191F28" }}>{t.keyword}</td>
                        <td className="px-5 py-3.5">
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#F1F5F9", color: "#64748B" }}>
                            {TARGET_TYPE_LABELS[t.targetType] ?? t.targetType}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>{t.targetValue}</td>
                        <td className="px-5 py-3.5">
                          <RankBadge rank={t.latestRanking?.rank} platform={t.platform ?? "shopping"} />
                          {t.latestRanking == null && <span className="text-xs ml-1" style={{ color: "#CBD5E1" }}>미조회</span>}
                        </td>
                        <td className="px-5 py-3.5 text-xs" style={{ color: "#94A3B8" }}>
                          {t.latestRanking
                            ? new Date(t.latestRanking.checkedAt).toLocaleString("ko-KR")
                            : "—"}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteTracker(t.id); }}
                              className="p-1.5 rounded-lg transition-colors"
                              style={{ background: "rgba(239,68,68,0.08)" }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.18)")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.08)")}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* 자동 조회 안내 */}
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl" style={{ background: "rgba(49,130,246,0.06)", border: "1px solid rgba(49,130,246,0.15)" }}>
              <svg className="mt-0.5 shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3182F6" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <p className="text-xs" style={{ color: "#475569" }}>
                자동 조회는 <code className="px-1 py-0.5 rounded text-xs" style={{ background: "#F1F5F9" }}>POST /api/reports/rankings</code>를 스케줄러(Vercel Cron 등)로 주기 호출하면 됩니다.
                Naver API 키를 <code className="px-1 py-0.5 rounded text-xs" style={{ background: "#F1F5F9" }}>.env.local</code>에 입력해야 조회가 작동합니다.
              </p>
            </div>
          </div>
        )}
      </div>

      {showAdd && selectedClientId && (
        <AddTrackerModal
          clientId={selectedClientId}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); loadTrackers(); }}
        />
      )}

      {historyTracker && (
        <HistoryPanel
          tracker={historyTracker}
          onClose={() => { setHistoryTracker(null); loadTrackers(); }}
        />
      )}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={null}>
      <ReportsInner />
    </Suspense>
  );
}
