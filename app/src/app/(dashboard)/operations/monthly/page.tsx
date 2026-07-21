"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ─── 상수 ────────────────────────────────────────────────

const SGA_CATEGORIES = [
  "급여", "복리후생비", "지급수수료", "광고선전비",
  "도서인쇄비", "임차료", "통신비", "소모품비", "직접매입(상품)",
  "판매수수료", "외주용역비", "기타 영업비용",
] as const;

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
  assignee: string | null;
  assignedTeam: string | null;
  productName: string | null;
  quantity: number | null;
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
  assignee: string | null;
  assignedTeam: string | null;
  campaignName: string | null;
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

interface SgaRow {
  category: string;
  item: string;
  month: number;
  amount: number;
}

// ─── 유틸 ────────────────────────────────────────────────

function sumN(arr: (number | null | undefined)[]) {
  return arr.reduce<number>((a, b) => a + (b ?? 0), 0);
}
function wonFmt(n: number) { return n === 0 ? "₩0" : "₩" + n.toLocaleString(); }
function won(n: number | null | undefined) {
  return n ? <>{("₩" + n.toLocaleString())}</> : <span style={{ color: "#CBD5E1" }}>—</span>;
}
function wonNum(n: number | null | undefined) { return n ? "₩" + n.toLocaleString() : "—"; }
function dateFmt(d: string | null) {
  if (!d) return <span style={{ color: "#CBD5E1" }}>—</span>;
  const [, m, day] = d.split("-");
  return <>{parseInt(m)}. {parseInt(day)}</>;
}
function parseNum(s: string) {
  const n = parseInt(s.replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

// ─── 테이블 스타일 ────────────────────────────────────────

const S = {
  thBlue:  { background:"#3182F6", color:"#fff", padding:"9px 12px", fontSize:12, fontWeight:700, textAlign:"center" as const, whiteSpace:"nowrap" as const, border:"1px solid #2462D8" },
  thDark:  { background:"#334155", color:"#fff", padding:"9px 12px", fontSize:12, fontWeight:700, textAlign:"center" as const, whiteSpace:"nowrap" as const, border:"1px solid #4A5568" },
  tdLabel: { background:"#F8FAFC", color:"#475569", padding:"7px 10px", fontSize:12, textAlign:"center" as const, border:"1px solid #E9EBEF", whiteSpace:"nowrap" as const },
  tdData:  { background:"#FFFFFF", color:"#191F28", padding:"7px 10px", fontSize:12, textAlign:"right" as const, border:"1px solid #E9EBEF", whiteSpace:"nowrap" as const },
  tdTotal: { background:"rgba(49,130,246,0.07)", color:"#3182F6", padding:"8px 10px", fontSize:12, fontWeight:700, textAlign:"right" as const, border:"1px solid rgba(49,130,246,0.15)" },
  tdTotalLabel: { background:"#3182F6", color:"#fff", padding:"8px 10px", fontSize:12, fontWeight:700, textAlign:"center" as const, border:"1px solid #2462D8" },
  trTotal: { background:"rgba(49,130,246,0.04)" },
};

// ─── 요약 카드 ────────────────────────────────────────────

function SummaryCards({ revRows, costRows, sgaRows, month }: {
  revRows: RevenueRow[]; costRows: CostRow[]; sgaRows: SgaRow[]; month: number;
}) {
  const totalRevenue  = sumN(revRows.map(r => r.total));
  const totalRevTax   = sumN(revRows.map(r => r.tax));
  const totalDirect   = sumN(costRows.map(r => r.total));
  const totalOtherSga = sumN(
    SGA_CATEGORIES
      .filter(c => c !== "직접매입(상품)")
      .map(cat => sgaRows.find(r => r.month === month && r.category === cat && r.item === "합계")?.amount ?? 0)
  );
  const totalExpense = totalDirect + totalOtherSga;
  const profit       = totalRevenue - totalExpense;

  const byPerson = new Map<string, { supply: number; tax: number }>();
  for (const r of revRows) {
    const name = r.assignee || "미지정";
    const cur  = byPerson.get(name) ?? { supply: 0, tax: 0 };
    cur.supply += r.supplyPrice ?? 0;
    cur.tax    += r.tax ?? 0;
    byPerson.set(name, cur);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "총 매출",  value: totalRevenue, color: "#3182F6" },
          { label: "총 지출",  value: totalExpense, color: "#6366F1" },
          { label: "영업이익", value: profit,        color: profit >= 0 ? "#10B981" : "#EF4444" },
          { label: "부가세",   value: totalRevTax,  color: "#F59E0B" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-2xl p-4" style={{ background:"#FFFFFF", border:"1px solid #E9EBEF" }}>
            <p className="text-xs font-semibold mb-1" style={{ color:"#94A3B8" }}>{label}</p>
            <p className="text-xl font-black" style={{ color }}>₩{value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl px-5 py-3.5" style={{ background:"#FFFFFF", border:"1px solid #E9EBEF" }}>
          <p className="text-xs font-bold mb-2" style={{ color:"#94A3B8" }}>지출 구성</p>
          <div className="flex items-center gap-5">
            {[
              { label:"직접매입(상품)", value: totalDirect,   color:"#6366F1" },
              { label:"판관비",         value: totalOtherSga, color:"#8B5CF6" },
              { label:"합계",           value: totalExpense,  color:"#191F28" },
            ].map(({ label, value, color }, i, arr) => (
              <div key={label} className="flex items-center gap-5">
                <div>
                  <p className="text-xs mb-0.5" style={{ color:"#64748B" }}>{label}</p>
                  <p className="text-sm font-bold" style={{ color }}>₩{value.toLocaleString()}</p>
                </div>
                {i < arr.length - 1 && <div style={{ width:1, height:28, background:"#E9EBEF" }}/>}
              </div>
            ))}
          </div>
        </div>

        {byPerson.size > 0 && (
          <div className="rounded-2xl px-5 py-3.5" style={{ background:"#FFFFFF", border:"1px solid #E9EBEF" }}>
            <p className="text-xs font-bold mb-2" style={{ color:"#94A3B8" }}>담당자별 매출</p>
            <div className="flex flex-wrap gap-4">
              {Array.from(byPerson.entries()).map(([name, { supply, tax }]) => (
                <div key={name} className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ background:"#3182F6" }}>{name.slice(0,1)}</div>
                  <div>
                    <p className="text-xs font-bold" style={{ color:"#191F28" }}>{name}</p>
                    <p style={{ fontSize:11, color:"#64748B" }}>
                      공급가 <span className="font-semibold" style={{ color:"#3182F6" }}>₩{supply.toLocaleString()}</span>
                      <span className="mx-1" style={{ color:"#E9EBEF" }}>|</span>
                      세액 <span className="font-semibold" style={{ color:"#94A3B8" }}>₩{tax.toLocaleString()}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 매출 테이블 (읽기 전용) ──────────────────────────────

function RevenueSection({ rows, criteria }: { rows: RevenueRow[]; criteria: string }) {
  const totalSupply = sumN(rows.map(r => r.supplyPrice));
  const totalTax    = sumN(rows.map(r => r.tax));
  const totalAmount = sumN(rows.map(r => r.total));
  const dateLabel   = revDateLabel(criteria);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <p className="text-xs" style={{ color:"#94A3B8" }}>
          프로젝트 관리에서 자동으로 집계됩니다.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl" style={{ border:"1px solid #E9EBEF" }}>
        <table className="w-full border-collapse" style={{ minWidth:720 }}>
          <colgroup>
            <col style={{ width:36 }} />
            <col style={{ width:76 }} />
            <col style={{ width:76 }} />
            <col style={{ width:80 }} />
            <col />
            <col style={{ width:96 }} />
            <col style={{ width:84 }} />
            <col style={{ width:96 }} />
            <col style={{ width:88 }} />
          </colgroup>
          <thead>
            <tr>{["#","팀","담당자",dateLabel,"업체명","공급가","부가세","합계","계산서날짜"].map(h => (
              <th key={h} style={S.thBlue}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} style={{ ...S.tdData, textAlign:"center", padding:"40px", color:"#CBD5E1" }}>
                이 달의 매출 내역이 없습니다. 프로젝트 관리에서 매출을 입력해주세요.
              </td></tr>
            ) : rows.map((r, i) => (
              <tr key={r.id} style={{ background: i % 2 === 0 ? "#FFFFFF" : "#FAFBFC" }}>
                <td style={S.tdLabel}>{i+1}</td>
                <td style={S.tdLabel}>{r.assignedTeam || <span style={{color:"#CBD5E1"}}>—</span>}</td>
                <td style={S.tdLabel}>{r.assignee || <span style={{color:"#CBD5E1"}}>—</span>}</td>
                <td style={{ ...S.tdData, textAlign:"center" }}>{dateFmt(revDateVal(r, criteria))}</td>
                <td style={{ ...S.tdData, textAlign:"left" }}>{r.clientName || <span style={{color:"#CBD5E1"}}>—</span>}</td>
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
    </div>
  );
}

// ─── 지출 섹션 ────────────────────────────────────────────

function ExpenseSection({
  costRows, sgaRows, year, month, criteria,
  editKey, editValue, inputRef,
  onStartEdit, onCommitEdit, onSetEditValue,
}: {
  costRows: CostRow[]; sgaRows: SgaRow[];
  year: number; month: number; criteria: string;
  editKey: string | null; editValue: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onStartEdit: (key: string, val: number) => void;
  onCommitEdit: () => void;
  onSetEditValue: (v: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (key: string) => setExpanded(prev => {
    const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next;
  });

  const directTotal = sumN(costRows.map(r => r.total));

  function sgaVal(cat: string) {
    if (cat === "직접매입(상품)") return directTotal;
    return sgaRows.find(r => r.month === month && r.category === cat && r.item === "합계")?.amount ?? 0;
  }
  const otherSgaTotal = sumN(SGA_CATEGORIES.filter(c => c !== "직접매입(상품)").map(sgaVal));
  const grandTotal    = directTotal + otherSgaTotal;
  // 매입은 항상 세금계산서 발행일 기준
  const dateLabel     = costDateLabel(criteria);

  function ChevronIcon({ open }: { open: boolean }) {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.5" strokeLinecap="round"
        style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)", transition:"transform 0.15s", flexShrink:0 }}>
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    );
  }

  const thDark = { ...S.thDark, background:"#475569", borderColor:"#64748B", fontSize:11, padding:"7px 8px" };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <p className="text-xs" style={{ color:"#94A3B8" }}>
          직접매입(상품)은 프로젝트 관리에서 자동 집계 · 판관비는 클릭하여 직접 입력
        </p>
      </div>
      <div className="rounded-xl overflow-hidden" style={{ border:"1px solid #E9EBEF" }}>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th style={{ ...S.thDark, textAlign:"left" as const, paddingLeft:16, width:"70%" }}>구분</th>
              <th style={{ ...S.thDark, textAlign:"right" as const, paddingRight:16 }}>금액</th>
            </tr>
          </thead>
          <tbody>
            {SGA_CATEGORIES.map(cat => {
              const isDirect  = cat === "직접매입(상품)";
              const val       = sgaVal(cat);
              const isOpen    = expanded.has(cat);
              const editK     = `sga__${cat}`;
              const isEditing = editKey === editK;

              return [
                <tr key={cat} onClick={() => toggle(cat)} style={{ cursor:"pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.background="rgba(49,130,246,0.03)")}
                  onMouseLeave={e => (e.currentTarget.style.background="transparent")}>
                  <td style={{ padding:"10px 14px", fontSize:13, fontWeight:600, color:"#191F28", border:"1px solid #E9EBEF" }}>
                    <div className="flex items-center gap-2">
                      <span style={{ color: isDirect ? "#3182F6" : "#6366F1" }}><ChevronIcon open={isOpen} /></span>
                      {cat}
                      {isDirect && <span style={{ fontSize:11, color:"#94A3B8", fontWeight:400 }}>(프로젝트 관리 자동 집계)</span>}
                    </div>
                  </td>
                  <td style={{ padding:"10px 14px", fontSize:13, fontWeight:600, textAlign:"right", border:"1px solid #E9EBEF",
                    color: val > 0 ? "#191F28" : "#CBD5E1" }}>
                    {val > 0 ? wonFmt(val) : "—"}
                  </td>
                </tr>,

                ...(isOpen ? [
                  isDirect ? (
                    // 직접매입(상품): project_costs 테이블 (읽기 전용)
                    <tr key={`${cat}-rows`}>
                      <td colSpan={2} style={{ padding:0, border:"1px solid #E9EBEF" }}>
                        <table className="w-full border-collapse" style={{ tableLayout:"fixed" }}>
                          <colgroup>
                            <col style={{ width:36 }} /><col style={{ width:76 }} />
                            <col style={{ width:76 }} /><col style={{ width:80 }} />
                            <col /><col />
                            <col style={{ width:96 }} /><col style={{ width:84 }} />
                            <col style={{ width:96 }} />
                          </colgroup>
                          <thead>
                            <tr>{["#","팀","담당자",dateLabel,"캠페인명","매입처","공급가","부가세","합계"].map(h => (
                              <th key={h} style={thDark}>{h}</th>
                            ))}</tr>
                          </thead>
                          <tbody>
                            {costRows.length === 0 ? (
                              <tr><td colSpan={9} style={{ ...S.tdData, textAlign:"center", padding:"20px", color:"#CBD5E1", fontSize:12 }}>
                                이 달의 매입 내역이 없습니다. 프로젝트 관리에서 입력해주세요.
                              </td></tr>
                            ) : costRows.map((r, i) => (
                              <tr key={r.id} style={{ background: i%2===0?"#FFFFFF":"#FAFBFC" }}>
                                <td style={{ ...S.tdLabel, fontSize:11 }}>{i+1}</td>
                                <td style={{ ...S.tdLabel, fontSize:11 }}>{r.assignedTeam||<span style={{color:"#CBD5E1"}}>—</span>}</td>
                                <td style={{ ...S.tdLabel, fontSize:11 }}>{r.assignee||<span style={{color:"#CBD5E1"}}>—</span>}</td>
                                <td style={{ ...S.tdData, textAlign:"center", fontSize:11 }}>{dateFmt(costDateVal(r, criteria))}</td>
                                <td style={{ ...S.tdData, textAlign:"left", fontSize:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.campaignName||<span style={{color:"#CBD5E1"}}>—</span>}</td>
                                <td style={{ ...S.tdData, textAlign:"left", fontSize:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.vendor||<span style={{color:"#CBD5E1"}}>—</span>}</td>
                                <td style={{ ...S.tdData, fontSize:11 }}>{won(r.supplyPrice)}</td>
                                <td style={{ ...S.tdData, fontSize:11 }}>{won(r.tax)}</td>
                                <td style={{ ...S.tdData, fontWeight:600, fontSize:11 }}>{won(r.total)}</td>
                              </tr>
                            ))}
                            {costRows.length > 0 && (
                              <tr style={S.trTotal}>
                                <td colSpan={6} style={{ ...S.tdLabel, textAlign:"right" as const, fontWeight:700, fontSize:12, color:"#475569" }}>소계</td>
                                <td style={{ ...S.tdTotal, fontSize:12 }}>{wonFmt(sumN(costRows.map(r=>r.supplyPrice)))}</td>
                                <td style={{ ...S.tdTotal, fontSize:12 }}>{wonFmt(sumN(costRows.map(r=>r.tax)))}</td>
                                <td style={{ ...S.tdTotal, fontSize:12, background:"rgba(49,130,246,0.14)" }}>{wonFmt(directTotal)}</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  ) : (
                    // 판관비: 클릭 편집
                    <tr key={`${cat}-edit`} style={{ background:"#F8FAFC" }}>
                      <td style={{ padding:"8px 14px 8px 42px", fontSize:12, color:"#64748B", border:"1px solid #E9EBEF" }}>
                        합계 <span style={{ fontSize:11, color:"#94A3B8" }}>(클릭하여 수정)</span>
                      </td>
                      <td style={{ padding: isEditing ? "4px 8px" : "8px 14px", textAlign:"right", border:"1px solid #E9EBEF" }}
                        onClick={e => { e.stopPropagation(); if (!isEditing) onStartEdit(editK, val); }}>
                        {isEditing ? (
                          <input ref={inputRef} type="text" value={editValue}
                            onChange={e => onSetEditValue(e.target.value)}
                            onBlur={onCommitEdit}
                            onKeyDown={e => { if(e.key==="Enter") onCommitEdit(); if(e.key==="Escape") onStartEdit("",0); }}
                            onClick={e => e.stopPropagation()}
                            className="w-full text-right text-sm outline-none rounded px-2 py-1"
                            style={{ border:"1.5px solid #3182F6", color:"#191F28", background:"#fff" }} />
                        ) : (
                          <span style={{ fontSize:13, color: val>0?"#3182F6":"#CBD5E1", cursor:"text",
                            padding:"2px 6px", borderRadius:6, border:"1px dashed",
                            borderColor: val>0?"#93C5FD":"#E9EBEF" }}>
                            {val > 0 ? wonFmt(val) : "+ 금액 입력"}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                ] : []),
              ];
            })}

            {/* 총 지출 */}
            <tr style={{ background:"#1E293B" }}>
              <td style={{ padding:"12px 16px", fontSize:13, fontWeight:700, color:"#fff", border:"1px solid #334155" }}>
                <div className="flex items-center gap-2">
                  <span style={{ fontSize:11, fontWeight:600, padding:"2px 7px", borderRadius:4,
                    background:"rgba(255,255,255,0.15)", color:"rgba(255,255,255,0.9)" }}>
                    직접매입(상품) {wonFmt(directTotal)} + 판관비 {wonFmt(otherSgaTotal)}
                  </span>
                  총 지출
                </div>
              </td>
              <td style={{ padding:"12px 16px", fontSize:16, fontWeight:900, color:"#FCD34D", textAlign:"right", border:"1px solid #334155" }}>
                {wonFmt(grandTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────

type DataTab = "revenue" | "expense";

export default function MonthlyManagePage() {
  const now = new Date();
  const [year,     setYear]     = useState(now.getFullYear());
  const [month,    setMonth]    = useState(now.getMonth() + 1);
  const [criteria, setCriteria] = useState("캠페인 시작날짜");
  const [dataTab,  setDataTab]  = useState<DataTab>("revenue");

  const [revRows,  setRevRows]  = useState<RevenueRow[]>([]);
  const [costRows, setCostRows] = useState<CostRow[]>([]);
  const [sgaRows,  setSgaRows]  = useState<SgaRow[]>([]);
  const [loading,  setLoading]  = useState(true);

  const [editKey,   setEditKey]   = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // 매출: 캠페인 시작 날짜 기준 / 매입: 계산서 발행 날짜 기준
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const load = useCallback(() => {
    setLoading(true);
    const q = `year=${year}&month=${month}&criteria=${encodeURIComponent(criteria)}`;
    fetch(`/api/operations/monthly?${q}`)
      .then(r => r.json())
      .then(({ revRows: rv, costRows: cs, sgaRows: sg }) => {
        setRevRows(rv ?? []);
        setCostRows(cs ?? []);
        setSgaRows(sg ?? []);
      })
      .finally(() => setLoading(false));
  }, [year, month, criteria]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (editKey && inputRef.current) inputRef.current.focus(); }, [editKey]);

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

  function startEdit(key: string, val: number) {
    if (!key) { setEditKey(null); return; }
    setEditKey(key); setEditValue(String(val));
  }

  async function commitEdit() {
    if (!editKey) return;
    const cat    = editKey.replace("sga__", "");
    const amount = parseNum(editValue);
    setSgaRows(prev => {
      const exists = prev.find(r => r.month === month && r.category === cat && r.item === "합계");
      if (exists) return prev.map(r => r.month === month && r.category === cat && r.item === "합계" ? { ...r, amount } : r);
      return [...prev, { category: cat, item: "합계", month, amount }];
    });
    setEditKey(null);
    await fetch("/api/annual/costs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, month, category: cat, item: "합계", amount }),
    });
  }

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color:"#191F28" }}>월간 손익관리</h1>
          <p className="text-xs mt-0.5" style={{ color:"#94A3B8" }}>{criteria === "통장" ? "매출: 입금 승인일 기준 · 매입: 승인일 기준" : criteria === "계산서날짜" ? "매출: 계산서 발행일 기준 · 매입: 계산서 발행일 기준" : "매출: 캠페인 시작일 기준 · 매입: 작업시작일 기준"}</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={criteria} onChange={e => setCriteria(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg border outline-none"
            style={{ borderColor:"#E9EBEF", color:"#475569", background:"#F8FAFC" }}>
            {CRITERIA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <div className="flex items-center gap-1 rounded-lg border px-1" style={{ borderColor:"#E9EBEF", background:"#F8FAFC" }}>
            <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white transition-colors">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span className="text-sm font-bold px-2 min-w-[80px] text-center" style={{ color:"#191F28" }}>{year}년 {month}월</span>
            <button onClick={nextMonth} disabled={isCurrentMonth}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white transition-colors disabled:opacity-30">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-32 text-center text-sm" style={{ color:"#CBD5E1" }}>불러오는 중...</div>
      ) : (
        <>
          <SummaryCards revRows={revRows} costRows={costRows} sgaRows={sgaRows} month={month} />

          {/* 탭 */}
          <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ background:"#F1F5F9" }}>
            {([
              { key:"revenue" as DataTab, label:"매출", count: revRows.length },
              { key:"expense" as DataTab, label:"지출" },
            ]).map(({ key, label, count }) => (
              <button key={key} onClick={() => setDataTab(key)}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: dataTab===key ? "#FFFFFF" : "transparent",
                  color:      dataTab===key ? "#191F28" : "#94A3B8",
                  boxShadow:  dataTab===key ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                }}>
                {label}
                {count !== undefined && (
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-md"
                    style={{ background: dataTab===key?"rgba(49,130,246,0.1)":"transparent", color: dataTab===key?"#3182F6":"#CBD5E1" }}>
                    {count}건
                  </span>
                )}
              </button>
            ))}
          </div>

          {dataTab === "revenue" ? (
            <RevenueSection rows={revRows} criteria={criteria} />
          ) : (
            <ExpenseSection
              costRows={costRows} sgaRows={sgaRows}
              year={year} month={month} criteria={criteria}
              editKey={editKey} editValue={editValue} inputRef={inputRef}
              onStartEdit={startEdit} onCommitEdit={commitEdit} onSetEditValue={setEditValue}
            />
          )}
        </>
      )}
    </div>
  );
}
