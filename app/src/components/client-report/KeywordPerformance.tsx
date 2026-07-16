// 빌더 미리보기·인쇄 리포트 공용 — 키워드 순위 성과 렌더

export interface KeywordTrendPoint { date: string; rank: number | null; }
export interface KeywordItem {
  id: string;
  keyword: string;
  platform: string;
  platformLabel: string;
  startRank: number | null;
  endRank: number | null;
  bestRank: number | null;
  status: "up" | "down" | "same" | "new" | "out" | "none";
  delta: number;
  trend: KeywordTrendPoint[];
}
export interface KeywordSummary {
  trackerCount: number;
  top10Count: number;
  improvedCount: number;
  avgStart: number | null;
  avgEnd: number | null;
}

function rankText(r: number | null) {
  return r == null ? "300위 밖" : `${r}위`;
}

const STATUS_STYLE: Record<KeywordItem["status"], { label: string; color: string; bg: string }> = {
  up:   { label: "상승",     color: "#059669", bg: "rgba(16,185,129,0.1)" },
  down: { label: "하락",     color: "#DC2626", bg: "rgba(239,68,68,0.1)" },
  same: { label: "유지",     color: "#64748B", bg: "rgba(148,163,184,0.12)" },
  new:  { label: "신규 진입", color: "#3182F6", bg: "rgba(49,130,246,0.1)" },
  out:  { label: "이탈",     color: "#D97706", bg: "rgba(217,119,6,0.1)" },
  none: { label: "-",       color: "#94A3B8", bg: "transparent" },
};

// 순위 추이 스파크라인 (순위는 낮을수록 위)
function Sparkline({ trend }: { trend: KeywordTrendPoint[] }) {
  const W = 88, H = 26, P = 3;
  const ranked = trend.filter(p => p.rank != null) as { date: string; rank: number }[];
  if (ranked.length < 2) return <span style={{ color: "#CBD5E1", fontSize: 10 }}>—</span>;
  const ranks = ranked.map(p => p.rank);
  const min = Math.min(...ranks), max = Math.max(...ranks);
  const span = max - min || 1;
  const n = trend.length;
  const pts = trend.map((p, i) => {
    const x = P + (n === 1 ? 0 : (i * (W - 2 * P)) / (n - 1));
    if (p.rank == null) return null;
    // rank 작을수록 y 위로
    const y = P + ((p.rank - min) / span) * (H - 2 * P);
    return { x, y };
  });
  const path = pts.filter(Boolean).map((pt, i) => `${i === 0 ? "M" : "L"}${pt!.x.toFixed(1)},${pt!.y.toFixed(1)}`).join(" ");
  const last = pts.filter(Boolean).at(-1)!;
  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <path d={path} fill="none" stroke="#3182F6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r="2" fill="#3182F6" />
    </svg>
  );
}

export function KeywordPerformance({ items, summary }: { items: KeywordItem[]; summary: KeywordSummary }) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl px-4 py-8 text-center text-sm" style={{ background: "#F8FAFC", border: "1px solid #E9EBEF", color: "#94A3B8" }}>
        이 기간에 수집된 키워드 순위 데이터가 없습니다.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {/* 요약 카드 */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "추적 키워드", value: `${summary.trackerCount}개` },
          { label: "10위권 노출", value: `${summary.top10Count}개` },
          { label: "상승·신규 진입", value: `${summary.improvedCount}개` },
          { label: "평균 순위", value: summary.avgStart != null && summary.avgEnd != null ? `${summary.avgStart}위 → ${summary.avgEnd}위` : "-" },
        ].map(c => (
          <div key={c.label} className="rounded-xl px-3 py-2.5" style={{ background: "#F8FAFC", border: "1px solid #E9EBEF" }}>
            <p className="text-xs" style={{ color: "#94A3B8" }}>{c.label}</p>
            <p className="text-sm font-bold mt-0.5" style={{ color: "#191F28" }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* 키워드 표 */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E9EBEF" }}>
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F8FAFC" }}>
              {["키워드", "플랫폼", "시작 순위", "현재 순위", "최고", "변화", "추이"].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-bold" style={{ color: "#64748B", borderBottom: "1px solid #E9EBEF", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map(k => {
              const st = STATUS_STYLE[k.status];
              return (
                <tr key={k.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <td className="px-3 py-2 font-semibold" style={{ color: "#191F28", whiteSpace: "nowrap" }}>{k.keyword}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: "#64748B", whiteSpace: "nowrap" }}>{k.platformLabel}</td>
                  <td className="px-3 py-2" style={{ color: "#475569", whiteSpace: "nowrap" }}>{rankText(k.startRank)}</td>
                  <td className="px-3 py-2 font-bold" style={{ color: k.endRank != null && k.endRank <= 10 ? "#3182F6" : "#191F28", whiteSpace: "nowrap" }}>{rankText(k.endRank)}</td>
                  <td className="px-3 py-2" style={{ color: "#059669", whiteSpace: "nowrap" }}>{rankText(k.bestRank)}</td>
                  <td className="px-3 py-2" style={{ whiteSpace: "nowrap" }}>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: st.color, background: st.bg }}>
                      {st.label}{(k.status === "up" || k.status === "down") && k.delta !== 0 ? ` ${Math.abs(k.delta)}` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2"><Sparkline trend={k.trend} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
