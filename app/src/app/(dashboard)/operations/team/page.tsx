"use client";

import { useState, useEffect, useCallback } from "react";

// ─── 상수 ────────────────────────────────────────────────

const TEAMS = ["전체", "영업 1팀", "영업 2팀"] as const;
type Team = typeof TEAMS[number];

const TEAM_COLORS: Record<string, string> = {
  "영업 1팀": "#6366F1",
  "영업 2팀": "#10B981",
};

const CRITERIA_OPTIONS = [
  { value: "캠페인 시작날짜", label: "캠페인 시작날짜 기준" },
  { value: "계산서날짜", label: "계산서날짜 기준" },
];

// ─── 타입 ────────────────────────────────────────────────

interface RevenueRow {
  id: string;
  rowNum: number | null;
  assignee: string | null;
  assignedTeam: string | null;
  productName: string | null;
  quantity: number | null;
  supplyPrice: number | null;
  tax: number | null;
  total: number | null;
  startDate: string | null;
  invoiceDate: string | null;
  clientName: string | null;
}

interface CostRow {
  id: string;
  rowNum: number | null;
  assignee: string | null;
  assignedTeam: string | null;
  vendor: string | null;
  productName: string | null;
  quantity: number | null;
  supplyPrice: number | null;
  tax: number | null;
  total: number | null;
  startDate: string | null;
  invoiceDate: string | null;
}

// ─── 유틸 ────────────────────────────────────────────────

function sumN(arr: (number | null | undefined)[]) {
  return arr.reduce<number>((a, b) => a + (b ?? 0), 0);
}
function won(n: number | null | undefined) {
  if (!n) return <span style={{ color: "#CBD5E1" }}>—</span>;
  return <>{"₩" + n.toLocaleString()}</>;
}
function wonNum(n: number | null | undefined) {
  return n ? "₩" + n.toLocaleString() : "—";
}
function dateFmt(d: string | null) {
  if (!d) return <span style={{ color: "#CBD5E1" }}>—</span>;
  const [, m, day] = d.split("-");
  return <>{parseInt(m)}. {parseInt(day)}</>;
}

// ─── 스타일 ──────────────────────────────────────────────

const S = {
  thBlue:  { background:"#3182F6", color:"#fff", padding:"9px 12px", fontSize:12, fontWeight:700, textAlign:"center" as const, whiteSpace:"nowrap" as const, border:"1px solid #2462D8" },
  thDark:  { background:"#334155", color:"#fff", padding:"9px 12px", fontSize:12, fontWeight:700, textAlign:"center" as const, whiteSpace:"nowrap" as const, border:"1px solid #4A5568" },
  tdLabel: { background:"#F8FAFC", color:"#475569", padding:"7px 10px", fontSize:12, textAlign:"center" as const, border:"1px solid #E9EBEF", whiteSpace:"nowrap" as const },
  tdData:  { background:"#FFFFFF", color:"#191F28", padding:"7px 10px", fontSize:12, textAlign:"right" as const, border:"1px solid #E9EBEF", whiteSpace:"nowrap" as const },
  tdTotal: { background:"rgba(49,130,246,0.07)", color:"#3182F6", padding:"8px 10px", fontSize:12, fontWeight:700, textAlign:"right" as const, border:"1px solid rgba(49,130,246,0.15)" },
  tdTotalLabel: { background:"#3182F6", color:"#fff", padding:"8px 10px", fontSize:12, fontWeight:700, textAlign:"center" as const, border:"1px solid #2462D8" },
  trTotal: { background:"rgba(49,130,246,0.04)" },
};

// ─── 요약 바 ──────────────────────────────────────────────

function SummaryBar({ revRows, costRows, teamLabel }: {
  revRows: RevenueRow[];
  costRows: CostRow[];
  teamLabel?: string;
}) {
  const totalSupply = sumN(revRows.map(r => r.supplyPrice));
  const totalTax    = sumN(revRows.map(r => r.tax));
  const totalCost   = sumN(costRows.map(r => r.supplyPrice));
  const profit      = totalSupply - totalCost;

  const byPerson = new Map<string, { supply: number; tax: number }>();
  for (const r of revRows) {
    const name = r.assignee || "미지정";
    const cur  = byPerson.get(name) ?? { supply: 0, tax: 0 };
    cur.supply += r.supplyPrice ?? 0;
    cur.tax    += r.tax ?? 0;
    byPerson.set(name, cur);
  }

  const prefix = teamLabel ? `${teamLabel} ` : "";
  const metrics = [
    { label: `${prefix}매출`,  value: totalSupply, color: "#3182F6" },
    { label: `${prefix}매입`,  value: totalCost,   color: "#6366F1" },
    { label: "영업이익",        value: profit,      color: profit >= 0 ? "#10B981" : "#EF4444" },
    { label: "부가세",          value: totalTax,    color: "#F59E0B" },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        {metrics.map(({ label, value, color }) => (
          <div key={label} className="rounded-2xl p-4" style={{ background: "#FFFFFF", border: "1px solid #E9EBEF" }}>
            <p className="text-xs font-semibold mb-1" style={{ color: "#94A3B8" }}>{label}</p>
            <p className="text-lg font-black" style={{ color }}>₩{value.toLocaleString()}</p>
          </div>
        ))}
      </div>
      {byPerson.size > 0 && (
        <div className="rounded-2xl px-5 py-4" style={{ background: "#FFFFFF", border: "1px solid #E9EBEF" }}>
          <p className="text-xs font-bold mb-3" style={{ color: "#94A3B8" }}>담당자별 매출</p>
          <div className="flex flex-wrap gap-4">
            {Array.from(byPerson.entries()).map(([name, { supply, tax }]) => (
              <div key={name} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ background: "#3182F6" }}>{name.slice(0, 1)}</div>
                <div>
                  <p className="text-sm font-bold" style={{ color: "#191F28" }}>{name}</p>
                  <p className="text-xs" style={{ color: "#64748B" }}>
                    공급가 <span className="font-semibold text-[#3182F6]">₩{supply.toLocaleString()}</span>
                    <span className="mx-1.5" style={{ color: "#E9EBEF" }}>|</span>
                    세액 <span className="font-semibold" style={{ color: "#94A3B8" }}>₩{tax.toLocaleString()}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 매출 테이블 ──────────────────────────────────────────

function RevenueTable({ rows, criteria }: { rows: RevenueRow[]; criteria: string }) {
  const totalSupply = sumN(rows.map(r => r.supplyPrice));
  const totalTax    = sumN(rows.map(r => r.tax));
  const totalAmount = sumN(rows.map(r => r.total));
  const dateLabel   = criteria === "계산서날짜" ? "계산서날짜" : "캠페인 시작날짜";

  return (
    <section>
      <h2 className="text-sm font-bold mb-2.5" style={{ color: "#191F28" }}>매출 내역</h2>
      <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid #E9EBEF" }}>
        <table className="w-full border-collapse" style={{ minWidth: 760 }}>
          <thead>
            <tr>{["#","담당자",dateLabel,"업체명","품명","개수","공급가","부가세","합계","계산서날짜"].map(h => (
              <th key={h} style={S.thBlue}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={10} style={{ ...S.tdData, textAlign:"center", padding:"32px", color:"#CBD5E1" }}>
                이 달의 매출 내역이 없습니다.
              </td></tr>
            ) : rows.map((r, i) => (
              <tr key={r.id}>
                <td style={{ ...S.tdLabel, width:36 }}>{i+1}</td>
                <td style={S.tdLabel}>{r.assignee || <span style={{color:"#CBD5E1"}}>—</span>}</td>
                <td style={{ ...S.tdData, textAlign:"center" }}>{dateFmt(criteria==="계산서날짜" ? r.invoiceDate : r.startDate)}</td>
                <td style={{ ...S.tdData, textAlign:"left", maxWidth:160 }}>{r.clientName || <span style={{color:"#CBD5E1"}}>—</span>}</td>
                <td style={{ ...S.tdData, textAlign:"left" }}>{r.productName || <span style={{color:"#CBD5E1"}}>—</span>}</td>
                <td style={{ ...S.tdData, textAlign:"center" }}>{r.quantity ? `${r.quantity}개` : <span style={{color:"#CBD5E1"}}>—</span>}</td>
                <td style={S.tdData}>{won(r.supplyPrice)}</td>
                <td style={S.tdData}>{won(r.tax)}</td>
                <td style={{ ...S.tdData, fontWeight:600 }}>{won(r.total)}</td>
                <td style={{ ...S.tdData, textAlign:"center" }}>{dateFmt(r.invoiceDate)}</td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr style={S.trTotal}>
                <td colSpan={6} style={S.tdTotalLabel}>TOTAL</td>
                <td style={S.tdTotal}>{wonNum(totalSupply)}</td>
                <td style={S.tdTotal}>{wonNum(totalTax)}</td>
                <td style={{ ...S.tdTotal, background:"rgba(49,130,246,0.14)" }}>{wonNum(totalAmount)}</td>
                <td style={{ ...S.tdLabel, background:"rgba(49,130,246,0.04)" }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── 매입 테이블 ──────────────────────────────────────────

function CostTable({ rows, criteria }: { rows: CostRow[]; criteria: string }) {
  const totalSupply = sumN(rows.map(r => r.supplyPrice));
  const totalTax    = sumN(rows.map(r => r.tax));
  const totalAmount = sumN(rows.map(r => r.total));
  const dateLabel   = criteria === "계산서날짜" ? "계산서날짜" : "캠페인 시작날짜";

  return (
    <section>
      <h2 className="text-sm font-bold mb-2.5" style={{ color: "#191F28" }}>매입 내역</h2>
      <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid #E9EBEF" }}>
        <table className="w-full border-collapse" style={{ minWidth: 720 }}>
          <thead>
            <tr>{["#","담당자",dateLabel,"매입처","품명","개수","공급가","부가세","합계","계산서날짜"].map(h => (
              <th key={h} style={S.thDark}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={10} style={{ ...S.tdData, textAlign:"center", padding:"32px", color:"#CBD5E1" }}>
                이 달의 매입 내역이 없습니다.
              </td></tr>
            ) : rows.map((r, i) => (
              <tr key={r.id}>
                <td style={{ ...S.tdLabel, width:36 }}>{i+1}</td>
                <td style={S.tdLabel}>{r.assignee || <span style={{color:"#CBD5E1"}}>—</span>}</td>
                <td style={{ ...S.tdData, textAlign:"center" }}>{dateFmt(criteria==="계산서날짜" ? r.invoiceDate : r.startDate)}</td>
                <td style={{ ...S.tdData, textAlign:"left" }}>{r.vendor || <span style={{color:"#CBD5E1"}}>—</span>}</td>
                <td style={{ ...S.tdData, textAlign:"left" }}>{r.productName || <span style={{color:"#CBD5E1"}}>—</span>}</td>
                <td style={{ ...S.tdData, textAlign:"center" }}>{r.quantity ? `${r.quantity}개` : <span style={{color:"#CBD5E1"}}>—</span>}</td>
                <td style={S.tdData}>{won(r.supplyPrice)}</td>
                <td style={S.tdData}>{won(r.tax)}</td>
                <td style={{ ...S.tdData, fontWeight:600 }}>{won(r.total)}</td>
                <td style={{ ...S.tdData, textAlign:"center" }}>{dateFmt(r.invoiceDate)}</td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr style={S.trTotal}>
                <td colSpan={6} style={{ ...S.tdTotalLabel, background:"#334155", borderColor:"#4A5568" }}>TOTAL</td>
                <td style={S.tdTotal}>{wonNum(totalSupply)}</td>
                <td style={S.tdTotal}>{wonNum(totalTax)}</td>
                <td style={{ ...S.tdTotal, background:"rgba(49,130,246,0.14)" }}>{wonNum(totalAmount)}</td>
                <td style={{ ...S.tdLabel, background:"rgba(49,130,246,0.04)" }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────

export default function TeamProfitPage() {
  const now = new Date();
  const [year,     setYear]     = useState(now.getFullYear());
  const [month,    setMonth]    = useState(now.getMonth() + 1);
  const [criteria, setCriteria] = useState("캠페인 시작날짜");
  const [team,     setTeam]     = useState<Team>("전체");
  const [dataTab,  setDataTab]  = useState<"revenue" | "cost">("revenue");

  const [revRows,  setRevRows]  = useState<RevenueRow[]>([]);
  const [costRows, setCostRows] = useState<CostRow[]>([]);
  const [loading,  setLoading]  = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const q = `year=${year}&month=${month}&criteria=${encodeURIComponent(criteria)}`;
    fetch(`/api/operations/monthly?${q}`)
      .then(r => r.json())
      .then(({ revRows: rv, costRows: cs }) => {
        setRevRows(rv ?? []);
        setCostRows(cs ?? []);
      })
      .finally(() => setLoading(false));
  }, [year, month, criteria]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (year === now.getFullYear() && month === now.getMonth() + 1) return;
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  const filteredRev  = team === "전체" ? revRows  : revRows.filter(r => r.assignedTeam === team);
  const filteredCost = team === "전체" ? costRows : costRows.filter(r => r.assignedTeam === team);

  function teamSupply(t: string) {
    return revRows.filter(r => r.assignedTeam === t).reduce<number>((a, r) => a + (r.supplyPrice ?? 0), 0);
  }

  return (
    <div className="space-y-5">
      {/* ── 헤더 ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: "#191F28" }}>팀별 손익현황</h1>

        <div className="flex items-center gap-2">
          <select value={criteria} onChange={e => setCriteria(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg border outline-none"
            style={{ borderColor: "#E9EBEF", color: "#475569", background: "#F8FAFC" }}>
            {CRITERIA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <div className="flex items-center gap-1 rounded-lg border px-1"
            style={{ borderColor: "#E9EBEF", background: "#F8FAFC" }}>
            <button onClick={prevMonth}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white transition-colors">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <span className="text-sm font-bold px-2 min-w-[80px] text-center" style={{ color: "#191F28" }}>
              {year}년 {month}월
            </span>
            <button onClick={nextMonth} disabled={isCurrentMonth}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white transition-colors disabled:opacity-30">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── 팀 탭 ── */}
      <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ background: "#F1F5F9" }}>
        {TEAMS.map((t) => {
          const isActive = team === t;
          const color    = TEAM_COLORS[t];
          const supply   = t !== "전체" && !loading ? teamSupply(t) : null;
          return (
            <button key={t} onClick={() => setTeam(t)}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
              style={{
                background: isActive ? "#FFFFFF" : "transparent",
                color:      isActive ? (color ?? "#191F28") : "#94A3B8",
                boxShadow:  isActive ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}>
              {color && (
                <span className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: isActive ? color : "#CBD5E1" }} />
              )}
              {t}
              {supply !== null && (
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-md"
                  style={{
                    background: isActive ? `${color}18` : "transparent",
                    color: isActive ? color : "#CBD5E1",
                  }}>
                  ₩{Math.round(supply / 10000).toLocaleString()}만
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── 콘텐츠 ── */}
      {loading ? (
        <div className="py-32 text-center text-sm" style={{ color: "#CBD5E1" }}>불러오는 중...</div>
      ) : (
        <>
          <SummaryBar
            revRows={filteredRev}
            costRows={filteredCost}
            teamLabel={team !== "전체" ? team : undefined}
          />

          {/* 매출 / 매입 탭 */}
          <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ background: "#F1F5F9" }}>
            {([
              { key: "revenue" as const, label: "매출", count: filteredRev.length },
              { key: "cost"    as const, label: "매입", count: filteredCost.length },
            ]).map(({ key, label, count }) => {
              const isActive = dataTab === key;
              return (
                <button key={key} onClick={() => setDataTab(key)}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
                  style={{
                    background: isActive ? "#FFFFFF" : "transparent",
                    color:      isActive ? "#191F28" : "#94A3B8",
                    boxShadow:  isActive ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  }}>
                  {label}
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-md"
                    style={{
                      background: isActive ? "rgba(49,130,246,0.1)" : "transparent",
                      color:      isActive ? "#3182F6" : "#CBD5E1",
                    }}>
                    {count}건
                  </span>
                </button>
              );
            })}
          </div>

          {dataTab === "revenue"
            ? <RevenueTable rows={filteredRev}  criteria={criteria} />
            : <CostTable    rows={filteredCost} criteria={criteria} />
          }
        </>
      )}
    </div>
  );
}
