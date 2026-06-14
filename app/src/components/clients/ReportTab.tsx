"use client";

import { useState, useEffect, useCallback } from "react";

interface Tracker {
  id: string;
  keyword: string;
  platform: string;
  targetType: string;
  targetValue: string;
  isActive: boolean;
  latestRanking: { rank: number | null; checkedAt: string } | null;
}

const TARGET_TYPE_LABELS: Record<string, string> = {
  mall: "쇼핑몰명",
  product_id: "상품 ID",
  product_name: "상품명",
  nstore_id: "스마트스토어 상품 ID",
  place_id: "플레이스 ID",
  place_name: "업체명",
};

function parseNaverUrl(url: string): { platform: "shopping" | "place"; targetType: string; targetValue: string } | null {
  // 스마트스토어: smartstore.naver.com/{store}/products/{productId}
  const smartstore = url.match(/smartstore\.naver\.com\/[^/?]+\/products\/(\d+)/);
  if (smartstore) return { platform: "shopping", targetType: "nstore_id", targetValue: smartstore[1] };

  // 네이버 플레이스 (map.naver.com)
  const mapPlace = url.match(/map\.naver\.com\/[^?]*?\/place\/(\d+)/);
  if (mapPlace) return { platform: "place", targetType: "place_id", targetValue: mapPlace[1] };

  // 네이버 플레이스 (place.naver.com)
  const placeNaver = url.match(/place\.naver\.com\/(?:place\/)?(\d+)/);
  if (placeNaver) return { platform: "place", targetType: "place_id", targetValue: placeNaver[1] };

  // 네이버 플레이스 entry (naver.me 단축 URL 제외, 긴 URL)
  const entryPlace = url.match(/entry\/place\/(\d+)/);
  if (entryPlace) return { platform: "place", targetType: "place_id", targetValue: entryPlace[1] };

  return null;
}

function RankBadge({ rank, untracked }: { rank: number | null | undefined; untracked?: boolean }) {
  if (untracked) return <span className="text-xs" style={{ color: "#CBD5E1" }}>미조회</span>;
  if (rank == null) return <span className="text-xs font-bold" style={{ color: "#94A3B8" }}>300위 밖</span>;
  const color = rank <= 3 ? "#10B981" : rank <= 10 ? "#3182F6" : rank <= 30 ? "#EAB308" : rank <= 100 ? "#F97316" : "#94A3B8";
  return (
    <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ background: `${color}18`, color }}>
      {rank}위
    </span>
  );
}

interface AddFormState {
  keyword: string;
  platform: "shopping" | "place";
  targetType: string;
  targetValue: string;
}

const EMPTY_FORM: AddFormState = { keyword: "", platform: "shopping", targetType: "mall", targetValue: "" };

export default function ReportTab({ clientId }: { clientId: string }) {
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<AddFormState>(EMPTY_FORM);
  const [urlInput, setUrlInput] = useState("");
  const [urlParsed, setUrlParsed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/reports/trackers?clientId=${clientId}`)
      .then((r) => r.json())
      .then((d) => setTrackers(d.trackers ?? []))
      .finally(() => setLoading(false));
  }, [clientId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

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

  async function deleteTracker(id: string) {
    await fetch(`/api/reports/trackers/${id}`, { method: "DELETE" });
    load();
  }

  function handleUrlChange(val: string) {
    setUrlInput(val);
    const parsed = parseNaverUrl(val.trim());
    if (parsed) {
      setAddForm((p) => ({ ...p, platform: parsed.platform, targetType: parsed.targetType, targetValue: parsed.targetValue }));
      setUrlParsed(true);
    } else {
      setUrlParsed(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addForm.keyword.trim() || !addForm.targetValue.trim()) { setAddError("모든 항목을 입력해주세요."); return; }
    setSaving(true); setAddError(null);
    const res = await fetch("/api/reports/trackers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, ...addForm }),
    });
    setSaving(false);
    if (!res.ok) { setAddError("저장 실패"); return; }
    setShowAdd(false);
    setAddForm(EMPTY_FORM);
    setUrlInput("");
    setUrlParsed(false);
    load();
  }

  const inputCls = "w-full px-2.5 py-1.5 text-xs rounded-lg outline-none border transition-colors focus:border-[#3182F6]";
  const inputStyle = { background: "#F8FAFC", borderColor: "#E9EBEF", color: "#191F28" };

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(49,130,246,0.1)", color: "#3182F6" }}>쇼핑</span>
          <span className="text-xs" style={{ color: "#94A3B8" }}>키워드 {trackers.length}개 추적</span>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl text-white transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          키워드 추가
        </button>
      </div>

      {/* 추가 폼 */}
      {showAdd && (
        <form onSubmit={handleAdd} className="p-4 rounded-xl space-y-3" style={{ background: "#F8FAFC", border: "1px solid #E9EBEF" }}>
          {/* URL 자동 입력 */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>
              네이버 URL 붙여넣기 <span className="font-normal" style={{ color: "#94A3B8" }}>(플레이스 또는 스마트스토어)</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://map.naver.com/... 또는 https://smartstore.naver.com/..."
                className={inputCls} style={inputStyle}
              />
              {urlParsed && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(16,185,129,0.12)", color: "#059669" }}>
                  {addForm.platform === "place" ? "플레이스" : "쇼핑"} 자동 인식 ✓
                </span>
              )}
            </div>
            {urlInput && !urlParsed && (
              <p className="text-xs mt-1" style={{ color: "#F97316" }}>인식되지 않은 URL — 아래에서 직접 입력하세요.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>검색 키워드 *</label>
              <input
                type="text" value={addForm.keyword}
                onChange={(e) => setAddForm((p) => ({ ...p, keyword: e.target.value }))}
                placeholder="예: 에어컨 청소" className={inputCls} style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>플랫폼</label>
              <div className="flex gap-1">
                {(["shopping", "place"] as const).map((p) => (
                  <button key={p} type="button"
                    onClick={() => setAddForm((prev) => ({ ...prev, platform: p, targetType: p === "place" ? "place_id" : "mall" }))}
                    className="flex-1 py-1 text-xs font-semibold rounded-lg border transition-all"
                    style={{
                      background: addForm.platform === p ? "rgba(49,130,246,0.12)" : "#FFFFFF",
                      borderColor: addForm.platform === p ? "#3182F6" : "#E9EBEF",
                      color: addForm.platform === p ? "#3182F6" : "#94A3B8",
                    }}>
                    {p === "shopping" ? "쇼핑" : "플레이스"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>추적 방식</label>
              <div className="flex gap-1 flex-wrap">
                {(addForm.platform === "shopping"
                  ? [["mall","몰명"],["product_name","상품명"],["nstore_id","스토어ID"]] as const
                  : [["place_id","플레이스ID"],["place_name","업체명"]] as const
                ).map(([t, label]) => (
                  <button key={t} type="button" onClick={() => setAddForm((p) => ({ ...p, targetType: t }))}
                    className="flex-1 py-1 text-xs font-semibold rounded-lg border transition-all"
                    style={{
                      background: addForm.targetType === t ? "rgba(49,130,246,0.12)" : "#FFFFFF",
                      borderColor: addForm.targetType === t ? "#3182F6" : "#E9EBEF",
                      color: addForm.targetType === t ? "#3182F6" : "#94A3B8",
                    }}>{label}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>{TARGET_TYPE_LABELS[addForm.targetType] ?? "추적 값"} *</label>
              <input
                type="text" value={addForm.targetValue}
                onChange={(e) => setAddForm((p) => ({ ...p, targetValue: e.target.value }))}
                placeholder={addForm.targetType === "place_id" || addForm.targetType === "nstore_id" ? "숫자 ID" : "텍스트 입력"}
                className={inputCls} style={inputStyle}
              />
            </div>
          </div>

          {addError && <p className="text-xs" style={{ color: "#EF4444" }}>{addError}</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => { setShowAdd(false); setUrlInput(""); setUrlParsed(false); setAddForm(EMPTY_FORM); }}
              className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-white" style={{ borderColor: "#E9EBEF", color: "#64748B" }}>취소</button>
            <button type="submit" disabled={saving} className="text-xs px-3 py-1.5 rounded-lg text-white font-semibold transition-opacity hover:opacity-90 disabled:opacity-50" style={{ background: "#3182F6" }}>
              {saving ? "추가 중..." : "추가"}
            </button>
          </div>
        </form>
      )}

      {/* 키워드 목록 */}
      {loading ? (
        <div className="py-8 text-center text-xs" style={{ color: "#94A3B8" }}>불러오는 중...</div>
      ) : trackers.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-xs mb-1" style={{ color: "#94A3B8" }}>추적 중인 키워드가 없습니다.</p>
          <button onClick={() => setShowAdd(true)} className="text-xs font-semibold" style={{ color: "#3182F6" }}>+ 키워드 추가</button>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden border" style={{ borderColor: "#E9EBEF" }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: "#F8FAFC" }}>
                {["키워드", "추적 값", "현재 순위", "마지막 조회", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left font-semibold whitespace-nowrap" style={{ color: "#64748B" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trackers.map((t) => (
                <tr key={t.id} className="border-t group" style={{ borderColor: "#F1F5F9" }}>
                  <td className="px-4 py-3 font-semibold" style={{ color: "#191F28" }}>
                    <div className="flex items-center gap-2">
                      {t.keyword}
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold" style={{
                        background: t.platform === "place" ? "rgba(16,185,129,0.1)" : "rgba(49,130,246,0.1)",
                        color: t.platform === "place" ? "#059669" : "#3182F6",
                      }}>{t.platform === "place" ? "플레이스" : "쇼핑"}</span>
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>{TARGET_TYPE_LABELS[t.targetType] ?? t.targetType}</div>
                  </td>
                  <td className="px-4 py-3" style={{ color: "#475569" }}>{t.targetValue}</td>
                  <td className="px-4 py-3">
                    <RankBadge rank={t.latestRanking?.rank} untracked={t.latestRanking == null} />
                  </td>
                  <td className="px-4 py-3" style={{ color: "#94A3B8" }}>
                    {t.latestRanking ? new Date(t.latestRanking.checkedAt).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => checkOne(t.id)}
                        disabled={checking === t.id}
                        title="지금 조회"
                        className="p-1.5 rounded-lg transition-colors hover:bg-slate-100 disabled:opacity-40"
                      >
                        {checking === t.id ? (
                          <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3182F6" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.08-4"/></svg>
                        )}
                      </button>
                      <button
                        onClick={() => deleteTracker(t.id)}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ background: "rgba(239,68,68,0.08)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.18)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.08)")}
                        title="삭제"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs" style={{ color: "#CBD5E1" }}>
        순위 조회 시 Naver API를 실시간으로 호출합니다. (최대 300위까지 추적)
      </p>
    </div>
  );
}
