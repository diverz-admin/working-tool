"use client";

import { useState, useEffect, useCallback } from "react";

interface Tracker {
  id: string;
  keyword: string;
  targetType: string;
  targetValue: string;
  isActive: boolean;
  latestRanking: { rank: number | null; checkedAt: string } | null;
}

const TARGET_TYPE_LABELS: Record<string, string> = {
  mall: "쇼핑몰명",
  product_id: "상품 ID",
  product_name: "상품명",
};

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
  targetType: "mall" | "product_id" | "product_name";
  targetValue: string;
}

export default function ReportTab({ clientId }: { clientId: string }) {
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState<string | null>(null); // trackerId being checked
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<AddFormState>({ keyword: "", targetType: "mall", targetValue: "" });
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
    setAddForm({ keyword: "", targetType: "mall", targetValue: "" });
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>검색 키워드</label>
              <input
                type="text" value={addForm.keyword}
                onChange={(e) => setAddForm((p) => ({ ...p, keyword: e.target.value }))}
                placeholder="예: 에어컨 청소" className={inputCls} style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>추적 방식</label>
              <div className="flex gap-1">
                {(["mall", "product_name", "product_id"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setAddForm((p) => ({ ...p, targetType: t }))}
                    className="flex-1 py-1 text-xs font-semibold rounded-lg border transition-all"
                    style={{
                      background: addForm.targetType === t ? "rgba(49,130,246,0.12)" : "#FFFFFF",
                      borderColor: addForm.targetType === t ? "#3182F6" : "#E9EBEF",
                      color: addForm.targetType === t ? "#3182F6" : "#94A3B8",
                    }}>
                    {t === "mall" ? "몰명" : t === "product_name" ? "상품명" : "ID"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>{TARGET_TYPE_LABELS[addForm.targetType]}</label>
            <input
              type="text" value={addForm.targetValue}
              onChange={(e) => setAddForm((p) => ({ ...p, targetValue: e.target.value }))}
              placeholder={addForm.targetType === "mall" ? "예: 은재홈케어" : addForm.targetType === "product_id" ? "예: 12345678" : "예: 에어컨청소"}
              className={inputCls} style={inputStyle}
            />
          </div>
          {addError && <p className="text-xs" style={{ color: "#EF4444" }}>{addError}</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowAdd(false)} className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-white" style={{ borderColor: "#E9EBEF", color: "#64748B" }}>취소</button>
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
                    <div>{t.keyword}</div>
                    <div className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>{TARGET_TYPE_LABELS[t.targetType]}</div>
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
