"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchJson } from "@/lib/fetch-json";
// ─── 상수 ────────────────────────────────────────────────

// 인원이 적어 팀 대신 사람별로 나눈다. 사람이 늘면 여기에 추가한다.
const PEOPLE = ["전체", "전재민", "조하늘", "양지훈", "조한알"] as const;
type Person = (typeof PEOPLE)[number];
const PERSON_COLORS: Record<string, string> = {
  "전재민": "#F59E0B",
  "조하늘": "#6366F1",
  "양지훈": "#10B981",
  "조한알": "#EC4899",
};

const CRITERIA_OPTIONS = [
  { value: "캠페인 시작날짜", label: "캠페인 시작날짜 기준" },
  { value: "계산서날짜", label: "계산서날짜 기준" },
  { value: "통장", label: "통장 기준" },
];

// 매출 표시 날짜: 통장→입금일(paymentDate), 계산서→발행일(invoiceDate), 그 외→캠페인 시작일(startDate)
function revDateLabel(criteria: string) {
  return criteria === "통장" ? "통장(입금일)" : criteria === "계산서날짜" ? "계산서날짜" : "캠페인 시작날짜";
}
function revDateVal(r: { startDate: string | null; invoiceDate: string | null; paymentDate: string | null }, criteria: string) {
  return criteria === "통장" ? r.paymentDate : criteria === "계산서날짜" ? r.invoiceDate : r.startDate;
}
// 매입 표시 날짜: 통장→승인일(purchaseDate), 계산서→발행일(invoiceDate), 그 외(캠페인 시작)→작업시작일(workStartDate)
function costDateLabel(criteria: string) {
  return criteria === "통장" ? "통장(승인일)" : criteria === "계산서날짜" ? "계산서날짜" : "작업시작일";
}
function costDateVal(r: { invoiceDate: string | null; purchaseDate: string | null; workStartDate: string | null }, criteria: string) {
  return criteria === "통장" ? r.purchaseDate : criteria === "계산서날짜" ? r.invoiceDate : r.workStartDate;
}

// ─── 타입 ────────────────────────────────────────────────

interface RevenueRow {
  id: string;
  projectId: string;
  campaignName: string | null;
  assignee: string | null;
  assignedTeam: string | null;
  supplyPrice: number | null;
  tax: number | null;
  total: number | null;
  startDate: string | null;
  invoiceDate: string | null;
  paymentDate: string | null;
  clientName: string | null;
}

interface CostRow {
  id: string;
  rowNum: number | null;
  assignee: string | null;
  assignedTeam: string | null;
  projectPerson: string | null;
  projectId: string;
  campaignName: string | null;
  clientName: string | null;
  vendor: string | null;
  productName: string | null;
  quantity: number | null;
  supplyPrice: number | null;
  tax: number | null;
  total: number | null;
  startDate: string | null;
  invoiceDate: string | null;
  purchaseDate: string | null;
  workStartDate: string | null;
}

// ─── 유틸 ────────────────────────────────────────────────

// 사람 귀속: 매출·매입 모두 캠페인 담당자
const revOwner  = (r: RevenueRow) => r.assignee;
const costOwner = (r: CostRow) => r.projectPerson ?? r.assignee;

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
function pct(part: number, whole: number) {
  return whole ? `${((part / whole) * 100).toFixed(1)}%` : "—";
}
const dash = <span style={{ color: "#CBD5E1" }}>—</span>;
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
  const totalSupply  = sumN(revRows.map(r => r.supplyPrice));
  const totalTax     = sumN(revRows.map(r => r.tax));
  const totalCost    = sumN(costRows.map(r => r.supplyPrice));
  const profit       = totalSupply - totalCost;

  const prefix = teamLabel ? `${teamLabel} ` : "";
  const metrics = [
    { label: `${prefix}매출`,  value: totalSupply, color: "#3182F6" },
    { label: `${prefix}매입`,  value: totalCost,    color: "#6366F1" },
    { label: "영업이익",        value: profit,       color: profit >= 0 ? "#10B981" : "#EF4444", note: "매출 − 매입" },
    { label: "부가세",          value: totalTax,     color: "#F59E0B" },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        {metrics.map(({ label, value, color, note }) => (
          <div key={label} className="rounded-2xl p-4" style={{ background: "#FFFFFF", border: "1px solid #E9EBEF" }}>
            <p className="text-xs font-semibold mb-1" style={{ color: "#94A3B8" }}>{label}</p>
            <p className="text-lg font-bold" style={{ color }}>₩{value.toLocaleString()}</p>
            {note && <p className="text-[11px] mt-0.5" style={{ color: "#CBD5E1" }}>{note}</p>}
          </div>
        ))}
      </div>
      {!teamLabel && <MemberStats revRows={revRows} costRows={costRows} />}
    </div>
  );
}

// ─── 멤버별 통계 (전체에서만) ──────────────────────────────

function MemberStats({ revRows, costRows }: { revRows: RevenueRow[]; costRows: CostRow[] }) {
  const members = PEOPLE.filter(p => p !== "전체") as string[];
  const stat = new Map(members.map(m => [m, { rev: 0, cost: 0, projects: new Set<string>(), clients: new Set<string>() }]));
  for (const r of revRows) {
    const cur = stat.get(revOwner(r) ?? "");
    if (!cur) continue;
    cur.rev += r.supplyPrice ?? 0; cur.projects.add(r.projectId);
    if (r.clientName) cur.clients.add(r.clientName.trim());
  }
  for (const c of costRows) {
    const cur = stat.get(costOwner(c) ?? "");
    if (!cur) continue;
    cur.cost += c.supplyPrice ?? 0; cur.projects.add(c.projectId);
    if (c.clientName) cur.clients.add(c.clientName.trim());
  }
  const keys = members;
  const totalRev = sumN(keys.map(k => stat.get(k)!.rev));

  return (
    <div className="rounded-2xl px-5 py-4" style={{ background: "#FFFFFF", border: "1px solid #E9EBEF" }}>
      <div className="flex items-baseline gap-2 mb-3">
        <p className="text-xs font-semibold" style={{ color: "#94A3B8" }}>멤버별 매출 · 매입</p>
        <p className="text-[11px]" style={{ color: "#CBD5E1" }}>공급가 기준 · 캠페인 담당자 기준</p>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${keys.length}, minmax(0, 1fr))` }}>
        {keys.map(k => {
          const v = stat.get(k)!;
          const profit = v.rev - v.cost;
          const color = PERSON_COLORS[k] ?? "#94A3B8";
          const share = totalRev ? (v.rev / totalRev) * 100 : 0;
          const empty = !v.rev && !v.cost;
          return (
            <div key={k} className="rounded-xl p-3.5" style={{ background: "#F8FAFC", border: "1px solid #EEF1F4", opacity: empty ? 0.6 : 1 }}>
              <div className="flex items-center gap-2 mb-2.5">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[11px] font-semibold shrink-0"
                  style={{ background: color }}>{k.slice(0, 1)}</div>
                <p className="text-sm font-semibold" style={{ color: "#191F28" }}>{k}</p>
                <p className="ml-auto text-[11px]" style={{ color: "#94A3B8" }}>
                  {v.clients.size ? `업체 ${v.clients.size} · 캠페인 ${v.projects.size}` : "실적 없음"}
                </p>
              </div>
              <p className="text-[11px]" style={{ color: "#94A3B8" }}>매출</p>
              <p className="text-lg font-bold tabular-nums" style={{ color: "#3182F6" }}>₩{v.rev.toLocaleString()}</p>
              <div className="h-1.5 mt-1.5 mb-3 rounded-full overflow-hidden" style={{ background: "#E9EBEF" }}>
                <div className="h-full rounded-full" style={{ width: `${share}%`, background: color }} />
              </div>
              <div className="space-y-1 text-xs tabular-nums">
                <div className="flex justify-between"><span style={{ color: "#64748B" }}>매출 비중</span><span style={{ color: "#191F28" }}>{totalRev ? `${share.toFixed(1)}%` : "—"}</span></div>
                <div className="flex justify-between"><span style={{ color: "#64748B" }}>매입</span><span style={{ color: "#191F28" }}>₩{v.cost.toLocaleString()}</span></div>
                <div className="flex justify-between pt-1.5 mt-1.5" style={{ borderTop: "1px solid #E9EBEF" }}>
                  <span className="font-semibold" style={{ color: "#475569" }}>영업이익</span>
                  <span className="font-semibold" style={{ color: profit < 0 ? "#EF4444" : "#10B981" }}>
                    {profit < 0 ? "−" : ""}₩{Math.abs(profit).toLocaleString()}
                    {v.rev > 0 && <span className="ml-1 font-normal" style={{ color: "#94A3B8" }}>{pct(profit, v.rev)}</span>}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 매출 테이블 ──────────────────────────────────────────

function RevenueTable({ rows, criteria }: { rows: RevenueRow[]; criteria: string }) {
  const totalSupply = sumN(rows.map(r => r.supplyPrice));
  const totalTax    = sumN(rows.map(r => r.tax));
  const totalAmount = sumN(rows.map(r => r.total));
  const dateLabel   = revDateLabel(criteria);

  return (
    <section>
      <h2 className="text-sm font-bold mb-2.5" style={{ color: "#191F28" }}>매출 내역</h2>
      <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid #E9EBEF" }}>
        <table className="w-full border-collapse" style={{ minWidth: 760 }}>
          <thead>
            <tr>{["#","담당자",dateLabel,"업체명","캠페인","공급가","부가세","합계","계산서날짜"].map(h => (
              <th key={h} style={S.thBlue}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} style={{ ...S.tdData, textAlign:"center", padding:"32px", color:"#CBD5E1" }}>
                이 달의 매출 내역이 없습니다.
              </td></tr>
            ) : rows.map((r, i) => (
              <tr key={r.id}>
                <td style={{ ...S.tdLabel, width:36 }}>{i+1}</td>
                <td style={S.tdLabel}>{r.assignee || <span style={{color:"#CBD5E1"}}>—</span>}</td>
                <td style={{ ...S.tdData, textAlign:"center" }}>{dateFmt(revDateVal(r, criteria))}</td>
                <td style={{ ...S.tdData, textAlign:"left", maxWidth:160 }}>{r.clientName || <span style={{color:"#CBD5E1"}}>—</span>}</td>
                <td style={{ ...S.tdData, textAlign:"left", maxWidth:220, overflow:"hidden", textOverflow:"ellipsis" }}>{r.campaignName || dash}</td>
                <td style={S.tdData}>{won(r.supplyPrice)}</td>
                <td style={S.tdData}>{won(r.tax)}</td>
                <td style={{ ...S.tdData, fontWeight:600 }}>{won(r.total)}</td>
                <td style={{ ...S.tdData, textAlign:"center" }}>{dateFmt(r.invoiceDate)}</td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr style={S.trTotal}>
                <td colSpan={5} style={S.tdTotalLabel}>TOTAL</td>
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
  const dateLabel   = costDateLabel(criteria);

  return (
    <section>
      <h2 className="text-sm font-bold mb-2.5" style={{ color: "#191F28" }}>매입 내역</h2>
      <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid #E9EBEF" }}>
        <table className="w-full border-collapse" style={{ minWidth: 720 }}>
          <thead>
            <tr>{["#","담당자",dateLabel,"캠페인","매입처","품명","개수","공급가","부가세","합계"].map(h => (
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
                <td style={S.tdLabel}>{costOwner(r) || <span style={{color:"#CBD5E1"}}>—</span>}</td>
                <td style={{ ...S.tdData, textAlign:"center" }}>{dateFmt(costDateVal(r, criteria))}</td>
                <td style={{ ...S.tdData, textAlign:"left", maxWidth:200, overflow:"hidden", textOverflow:"ellipsis" }}>{r.campaignName || dash}</td>
                <td style={{ ...S.tdData, textAlign:"left" }}>{r.vendor || <span style={{color:"#CBD5E1"}}>—</span>}</td>
                <td style={{ ...S.tdData, textAlign:"left" }}>{r.productName || <span style={{color:"#CBD5E1"}}>—</span>}</td>
                <td style={{ ...S.tdData, textAlign:"center" }}>{r.quantity ? `${r.quantity}개` : <span style={{color:"#CBD5E1"}}>—</span>}</td>
                <td style={S.tdData}>{won(r.supplyPrice)}</td>
                <td style={S.tdData}>{won(r.tax)}</td>
                <td style={{ ...S.tdData, fontWeight:600 }}>{won(r.total)}</td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr style={S.trTotal}>
                <td colSpan={7} style={{ ...S.tdTotalLabel, background:"#334155", borderColor:"#4A5568" }}>TOTAL</td>
                <td style={S.tdTotal}>{wonNum(totalSupply)}</td>
                <td style={S.tdTotal}>{wonNum(totalTax)}</td>
                <td style={{ ...S.tdTotal, background:"rgba(49,130,246,0.14)" }}>{wonNum(totalAmount)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── 업체별 합계 ──────────────────────────────────────────
// 매출과 매입을 업체(광고주) 단위로 묶는다. 날짜 기준이 서로 달라 한쪽만 있는 업체도 그대로 보인다.

interface ClientSum {
  client: string;
  people: Set<string>;
  projects: Set<string>;
  revSupply: number;
  costSupply: number;
  costCount: number;
}

const NO_CLIENT = "(업체 없음)";

function clientSums(revRows: RevenueRow[], costRows: CostRow[]): ClientSum[] {
  const map = new Map<string, ClientSum>();
  const get = (clientName: string | null, person: string | null, projectId: string) => {
    const key = clientName?.trim() || NO_CLIENT;
    let cur = map.get(key);
    if (!cur) { cur = { client: key, people: new Set(), projects: new Set(), revSupply: 0, costSupply: 0, costCount: 0 }; map.set(key, cur); }
    if (person) cur.people.add(person);
    cur.projects.add(projectId);
    return cur;
  };
  for (const r of revRows)  get(r.clientName, revOwner(r), r.projectId).revSupply += r.supplyPrice ?? 0;
  for (const c of costRows) { const cur = get(c.clientName, costOwner(c), c.projectId); cur.costSupply += c.supplyPrice ?? 0; cur.costCount += 1; }
  return [...map.values()].sort((a, b) => b.revSupply - a.revSupply || b.costSupply - a.costSupply);
}

function ClientTable({ revRows, costRows, showPerson }: { revRows: RevenueRow[]; costRows: CostRow[]; showPerson: boolean }) {
  const rows = clientSums(revRows, costRows);
  const totRev    = sumN(rows.map(r => r.revSupply));
  const totCost   = sumN(rows.map(r => r.costSupply));
  const totCount  = sumN(rows.map(r => r.costCount));
  const totProj   = sumN(rows.map(r => r.projects.size));
  const totProfit = totRev - totCost;
  const heads = ["#", ...(showPerson ? ["담당자"] : []), "업체명", "캠페인 수", "매출 공급가", "매입 공급가", "매입 건수", "이익", "이익률"];
  const list = (set: Set<string>) => set.size ? [...set].join(", ") : dash;

  return (
    <section>
      <div className="flex items-baseline gap-2 mb-2.5">
        <h2 className="text-sm font-bold" style={{ color: "#191F28" }}>업체별 합계</h2>
        <p className="text-xs" style={{ color: "#94A3B8" }}>공급가 기준 · 이익 = 매출 − 매입 · 업체 {rows.length}곳</p>
      </div>
      <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid #E9EBEF" }}>
        <table className="w-full border-collapse" style={{ minWidth: 860 }}>
          <thead>
            <tr>{heads.map(h => <th key={h} style={S.thBlue}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={heads.length} style={{ ...S.tdData, textAlign:"center", padding:"32px", color:"#CBD5E1" }}>
                이 달의 업체 매출·매입이 없습니다.
              </td></tr>
            ) : rows.map((r, i) => {
              const profit = r.revSupply - r.costSupply;
              return (
                <tr key={r.client}>
                  <td style={{ ...S.tdLabel, width:36 }}>{i+1}</td>
                  {showPerson && <td style={S.tdLabel}>{list(r.people)}</td>}
                  <td style={{ ...S.tdData, textAlign:"left", maxWidth:240, overflow:"hidden", textOverflow:"ellipsis", fontWeight:600 }}>{r.client}</td>
                  <td style={{ ...S.tdData, textAlign:"center" }}>{r.projects.size}개</td>
                  <td style={S.tdData}>{won(r.revSupply)}</td>
                  <td style={S.tdData}>{won(r.costSupply)}</td>
                  <td style={{ ...S.tdData, textAlign:"center" }}>{r.costCount ? `${r.costCount}건` : dash}</td>
                  <td style={{ ...S.tdData, fontWeight:600, color: profit < 0 ? "#EF4444" : "#191F28" }}>
                    {profit === 0 ? dash : `${profit < 0 ? "−" : ""}₩${Math.abs(profit).toLocaleString()}`}
                  </td>
                  <td style={{ ...S.tdData, textAlign:"center", color:"#64748B" }}>{r.revSupply ? pct(profit, r.revSupply) : dash}</td>
                </tr>
              );
            })}
            {rows.length > 0 && (
              <tr style={S.trTotal}>
                <td colSpan={showPerson ? 3 : 2} style={S.tdTotalLabel}>TOTAL</td>
                <td style={{ ...S.tdTotal, textAlign:"center" }}>{totProj}개</td>
                <td style={S.tdTotal}>{wonNum(totRev)}</td>
                <td style={S.tdTotal}>{wonNum(totCost)}</td>
                <td style={{ ...S.tdTotal, textAlign:"center" }}>{totCount}건</td>
                <td style={{ ...S.tdTotal, background:"rgba(49,130,246,0.14)", color: totProfit < 0 ? "#EF4444" : "#3182F6" }}>
                  {`${totProfit < 0 ? "−" : ""}₩${Math.abs(totProfit).toLocaleString()}`}
                </td>
                <td style={{ ...S.tdTotal, textAlign:"center" }}>{pct(totProfit, totRev)}</td>
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
  const [person,   setPerson]   = useState<Person>("전체");
  const [dataTab,  setDataTab]  = useState<"client" | "revenue" | "cost">("client");

  const [revRows,  setRevRows]  = useState<RevenueRow[]>([]);
  const [costRows, setCostRows] = useState<CostRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  // 매출: 캠페인 시작 날짜 기준 / 매입: 계산서 발행 날짜 기준
  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const q = `year=${year}&month=${month}&criteria=${encodeURIComponent(criteria)}`;
    fetchJson<{ revRows?: RevenueRow[]; costRows?: CostRow[] }>(`/api/operations/monthly?${q}`)
      .then(({ revRows: rv, costRows: cs }) => {
        setRevRows(rv ?? []);
        setCostRows(cs ?? []);
      })
      // 실패 시 0원으로 보여주면 안 된다 — 오류를 그대로 노출한다
      .catch((e: Error) => { setError(e.message); setRevRows([]); setCostRows([]); })
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

  const all = person === "전체";
  const filteredRev  = all ? revRows  : revRows.filter(r => revOwner(r) === person);
  const filteredCost = all ? costRows : costRows.filter(r => costOwner(r) === person);

  function personSupply(name: string) {
    return revRows.filter(r => revOwner(r) === name).reduce<number>((a, r) => a + (r.supplyPrice ?? 0), 0);
  }

  return (
    <div className="space-y-5">
      {/* ── 헤더 ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "#191F28" }}>팀별 손익현황</h1>
          <p className="text-xs mt-0.5" style={{ color:"#94A3B8" }}>{criteria === "통장" ? "매출: 입금 승인일 기준 · 매입: 승인일 기준" : criteria === "계산서날짜" ? "매출: 계산서 발행일 기준 · 매입: 계산서 발행일 기준" : "매출: 캠페인 시작일 기준 · 매입: 작업시작일 기준"}</p>
        </div>

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

      {/* ── 담당자 탭 ── */}
      <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ background: "#F1F5F9" }}>
        {PEOPLE.map((t) => {
          const isActive = person === t;
          const color    = t === "전체" ? undefined : PERSON_COLORS[t];
          // 오류 시에는 뱃지 금액도 숨긴다 — ₩0만이 실제 값으로 오인되면 안 된다
          const supply   = t !== "전체" && !loading && !error ? personSupply(t) : null;
          return (
            <button key={t} onClick={() => setPerson(t)}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
              style={{
                background: isActive ? "#FFFFFF" : "transparent",
                color:      isActive ? (color ?? "#191F28") : "#94A3B8",
                boxShadow:  isActive ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}>
              {color && (
                <span className="rounded-full shrink-0"
                  style={{ width: 8, height: 8, background: isActive ? color : "#CBD5E1" }} />
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
      ) : error ? (
        <div className="py-32 flex flex-col items-center gap-3">
          <p className="text-sm font-semibold" style={{ color: "#EF4444" }}>{error}</p>
          <p className="text-xs" style={{ color: "#94A3B8" }}>손익 데이터를 표시할 수 없습니다. 금액이 0으로 잘못 보이지 않도록 표시를 중단했습니다.</p>
          <button onClick={load} className="px-4 py-1.5 text-sm font-semibold rounded-lg" style={{ background: "#3182F6", color: "#fff" }}>다시 시도</button>
        </div>
      ) : (
        <>
          <SummaryBar
            revRows={filteredRev}
            costRows={filteredCost}
            teamLabel={all ? undefined : person}
          />

          {/* 업체별 / 매출 / 매입 탭 */}
          <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ background: "#F1F5F9" }}>
            {([
              { key: "client"   as const, label: "업체별",   count: new Set([...filteredRev, ...filteredCost].map(r => r.clientName?.trim() || NO_CLIENT)).size },
              { key: "revenue"  as const, label: "매출",     count: filteredRev.length },
              { key: "cost"     as const, label: "매입",     count: filteredCost.length },
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
                    {count}{key === "client" ? "곳" : "건"}
                  </span>
                </button>
              );
            })}
          </div>

          {dataTab === "client"   && <ClientTable revRows={filteredRev} costRows={filteredCost} showPerson={all} />}
          {dataTab === "revenue"  && <RevenueTable rows={filteredRev}  criteria={criteria} />}
          {dataTab === "cost"     && <CostTable    rows={filteredCost} criteria={criteria} />}
        </>
      )}
    </div>
  );
}
