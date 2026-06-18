"use client";
/* eslint-disable react-hooks/static-components */

import { useState, useEffect, useCallback, useRef } from "react";

const MONTHS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

const SGA_CATEGORIES = [
  "급여","복리후생비","지급수수료","광고선전비",
  "도서인쇄비","임차료","통신비","직접매입(상품)",
  "판매수수료","외주용역비","기타 영업비용",
] as const;

const CRITERIA_OPTIONS = [
  { value: "캠페인 시작날짜", label: "캠페인 시작날짜 기준" },
  { value: "계산서날짜", label: "계산서날짜 기준" },
  { value: "공급가",     label: "공급가 기준" },
];

const TEAMS = ["전체","영업 1팀","영업 2팀"] as const;
type Team = typeof TEAMS[number];
const TEAM_COLORS: Record<string, string> = { "영업 1팀": "#6366F1", "영업 2팀": "#10B981" };

interface PersonRevenue { person: string; monthly: number[] }
interface TeamRevenue   { team: string; persons: PersonRevenue[] }
interface RevenueData   { teams: TeamRevenue[]; other: number[] }
type CostMap = Record<string, number>;

function wonFmt(n: number) { return n === 0 ? "₩0" : "₩" + n.toLocaleString(); }
function parseNum(s: string) { const n = parseInt(s.replace(/[^0-9]/g,""),10); return isNaN(n)?0:n; }
function sum(arr: number[]) { return arr.reduce((a,b)=>a+b,0); }
function costKey(cat: string, m: number) { return `${cat}__${m}`; }

/* ── 스타일 상수 ── */
const TH_BASE: React.CSSProperties = {
  background: "#1E293B", color: "#fff",
  padding: "11px 10px", fontSize: 11, fontWeight: 700,
  textAlign: "center", whiteSpace: "nowrap",
  border: "1px solid #334155", letterSpacing: "0.03em",
};
const TH_CUR:   React.CSSProperties = { ...TH_BASE, background: "#2563EB", border: "1px solid #1D4ED8" };
const TH_TOT:   React.CSSProperties = { ...TH_BASE, background: "#0F172A", border: "1px solid #0F172A" };
const TH_LABEL: React.CSSProperties = { ...TH_BASE, textAlign: "left", paddingLeft: 16 };

const TD_LABEL: React.CSSProperties = {
  background: "#F8FAFC", color: "#475569",
  padding: "8px 16px", fontSize: 12, fontWeight: 500,
  textAlign: "left", border: "1px solid #E9EBEF", whiteSpace: "nowrap",
};
const TD_DATA: React.CSSProperties = {
  background: "#fff", color: "#334155",
  padding: "8px 10px", fontSize: 12,
  textAlign: "right", border: "1px solid #E9EBEF",
};
const TD_DATA_CUR: React.CSSProperties = { ...TD_DATA, background: "#EFF6FF", borderColor: "#BFDBFE" };
const TD_TOT_COL:  React.CSSProperties = {
  background: "#F1F5F9", color: "#1E40AF",
  padding: "8px 10px", fontSize: 12, fontWeight: 700,
  textAlign: "right", border: "1px solid #E2E8F0",
};
const TD_SUM_LABEL: React.CSSProperties = {
  background: "#1E293B", color: "#fff",
  padding: "9px 16px", fontSize: 12, fontWeight: 700,
  textAlign: "left", border: "1px solid #334155",
};
const TD_SUM_DATA: React.CSSProperties = {
  background: "#F1F5F9", color: "#1E293B",
  padding: "9px 10px", fontSize: 12, fontWeight: 700,
  textAlign: "right", border: "1px solid #E2E8F0",
};

export default function AnnualProfitPage() {
  const now = new Date();
  const curMonth = now.getMonth();

  const [year,     setYear]     = useState(now.getFullYear());
  const [criteria, setCriteria] = useState("캠페인 시작날짜");
  const [team,     setTeam]     = useState<Team>("전체");
  const [revenue,  setRevenue]  = useState<RevenueData|null>(null);
  const [costs,    setCosts]    = useState<CostMap>({});
  const [loading,  setLoading]  = useState(true);

  const [editKey,   setEditKey]   = useState<string|null>(null);
  const [editValue, setEditValue] = useState("");
  const [hoverKey,  setHoverKey]  = useState<string|null>(null);
  const [savedKey,  setSavedKey]  = useState<string|null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/operations/annual?year=${year}&criteria=${encodeURIComponent(criteria)}`)
      .then(r => r.json())
      .then(({ teams, other, costs: costArr }) => {
        setRevenue({ teams: teams ?? [], other: other ?? new Array(12).fill(0) });
        const map: CostMap = {};
        for (const row of (costArr ?? [])) {
          if (row.item === "합계") map[costKey(row.category, row.month - 1)] = row.amount;
        }
        setCosts(map);
      })
      .finally(() => setLoading(false));
  }, [year, criteria]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{ load(); }, [load]);
  useEffect(()=>{ if(editKey && inputRef.current) inputRef.current.focus(); }, [editKey]);

  function startEdit(key: string) { setEditKey(key); setEditValue(String(costs[key]??0)); }
  async function commitEdit() {
    if (!editKey) return;
    const key = editKey;
    const [cat, mStr] = key.split("__");
    const month  = parseInt(mStr)+1;
    const amount = parseNum(editValue);
    setCosts(prev=>({...prev,[key]:amount}));
    setEditKey(null);
    setSavedKey(key);
    setTimeout(()=>setSavedKey(null),1800);
    await fetch("/api/annual/costs",{
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ year, month, category:cat, item:"합계", amount }),
    });
  }

  const allTeams      = revenue?.teams??[];
  const filteredTeams = team==="전체" ? allTeams : allTeams.filter(t=>t.team===team);
  function teamMonthly(t: TeamRevenue, m: number) { return t.persons.reduce((s,p)=>s+(p.monthly[m]??0),0); }
  function revMonthTotal(m: number) {
    return filteredTeams.reduce((s,t)=>s+teamMonthly(t,m),0)
      + (team==="전체" ? (revenue?.other[m]??0) : 0);
  }
  function costMonthTotal(m: number) {
    return SGA_CATEGORIES.reduce((s,cat)=>s+(costs[costKey(cat,m)]??0),0);
  }
  const revGrand  = Array.from({length:12},(_,m)=>revMonthTotal(m)).reduce((a,b)=>a+b,0);
  const costGrand = Array.from({length:12},(_,m)=>costMonthTotal(m)).reduce((a,b)=>a+b,0);
  const netGrand  = revGrand - costGrand;

  function teamAnnualRev(t: string) {
    const td = allTeams.find(x=>x.team===t);
    if (!td) return 0;
    return Array.from({length:12},(_,m)=>teamMonthly(td,m)).reduce((a,b)=>a+b,0);
  }

  const isCurYear = year === now.getFullYear();

  function MonthHeaders() {
    return (
      <>
        {MONTHS.map((m,i)=>(
          <th key={m} style={isCurYear && i===curMonth ? TH_CUR : TH_BASE}>{m}</th>
        ))}
        <th style={TH_TOT}>TOTAL</th>
      </>
    );
  }

  function SectionTitle({ children, note }: { children: React.ReactNode; note?: React.ReactNode }) {
    return (
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span style={{ width:3, height:16, borderRadius:2, background:"#3182F6", display:"inline-block", flexShrink:0 }}/>
          <h2 className="text-sm font-bold" style={{ color:"#1E293B" }}>{children}</h2>
        </div>
        {note}
      </div>
    );
  }

  function dash(v: number) {
    return v > 0 ? wonFmt(v) : <span style={{ color:"#CBD5E1" }}>—</span>;
  }

  return (
    <div className="space-y-7">

      {/* ── 헤더 ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color:"#1E293B" }}>연간 손익관리</h1>
          <p className="text-xs mt-0.5" style={{ color:"#94A3B8" }}>{year}년 전체 수익·비용 현황</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={criteria} onChange={e=>setCriteria(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg border outline-none"
            style={{ borderColor:"#E2E8F0", color:"#475569", background:"#F8FAFC" }}>
            {CRITERIA_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={year} onChange={e=>setYear(Number(e.target.value))}
            className="px-3 py-1.5 text-sm rounded-lg border outline-none"
            style={{ borderColor:"#E2E8F0", color:"#475569", background:"#F8FAFC" }}>
            {[2024,2025,2026,2027,2028].map(y=><option key={y} value={y}>{y}년</option>)}
          </select>
        </div>
      </div>

      {/* ── 팀 탭 ── */}
      <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ background:"#F1F5F9" }}>
        {TEAMS.map(t=>{
          const isActive = team===t;
          const color = TEAM_COLORS[t];
          const rev = t!=="전체" && !loading ? teamAnnualRev(t) : null;
          return (
            <button key={t} onClick={()=>setTeam(t)}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
              style={{ background:isActive?"#fff":"transparent", color:isActive?(color??"#1E293B"):"#94A3B8", boxShadow:isActive?"0 1px 3px rgba(0,0,0,0.08)":"none" }}>
              {color && <span className="w-2 h-2 rounded-full" style={{ background:isActive?color:"#CBD5E1" }}/>}
              {t}
              {rev!==null && (
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-md"
                  style={{ background:isActive?`${color}18`:"transparent", color:isActive?color:"#CBD5E1" }}>
                  ₩{rev.toLocaleString()}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="py-24 text-center text-sm" style={{ color:"#CBD5E1" }}>불러오는 중...</div>
      ) : (
        <>
          {/* ── KPI 카드 ── */}
          <div className="grid grid-cols-4 gap-4">
            {([
              { label:"연간 매출",  value:revGrand,  color:"#3182F6", bg:"rgba(49,130,246,0.06)",  bd:"rgba(49,130,246,0.15)"  },
              { label:"연간 지출",  value:costGrand, color:"#6366F1", bg:"rgba(99,102,241,0.06)",  bd:"rgba(99,102,241,0.15)"  },
              { label:"연간 순이익",value:netGrand,  color:netGrand>=0?"#10B981":"#EF4444", bg:netGrand>=0?"rgba(16,185,129,0.06)":"rgba(239,68,68,0.06)", bd:netGrand>=0?"rgba(16,185,129,0.15)":"rgba(239,68,68,0.15)" },
              { label:"이익률",     value:null,      color:"#F59E0B", bg:"rgba(245,158,11,0.06)",  bd:"rgba(245,158,11,0.15)", display:revGrand>0?`${Math.round((netGrand/revGrand)*100)}%`:"—" },
            ] as { label:string; value:number|null; color:string; bg:string; bd:string; display?:string }[]).map(kpi=>(
              <div key={kpi.label} className="rounded-2xl p-4" style={{ background:kpi.bg, border:`1px solid ${kpi.bd}` }}>
                <p className="text-xs font-semibold mb-1.5" style={{ color:kpi.color }}>{kpi.label}</p>
                <p className="text-xl font-black" style={{ color:kpi.color }}>
                  {kpi.display ?? wonFmt(kpi.value!)}
                </p>
                {kpi.value!==null && (
                  <p className="text-xs mt-0.5" style={{ color:`${kpi.color}99` }}>
                    ₩{kpi.value.toLocaleString()}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* ── 손익 요약 ── */}
          <section>
            <SectionTitle>손익 요약{team!=="전체"?` — ${team}`:""}</SectionTitle>
            <div className="overflow-x-auto rounded-xl" style={{ border:"1px solid #E2E8F0", boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
              <table className="w-full border-collapse" style={{ minWidth:900 }}>
                <thead><tr><th style={TH_LABEL}>항목</th><MonthHeaders/></tr></thead>
                <tbody>
                  <tr>
                    <td style={TD_LABEL}>매출</td>
                    {Array.from({length:12},(_,m)=>{
                      const v = revMonthTotal(m);
                      return <td key={m} style={isCurYear&&m===curMonth?TD_DATA_CUR:TD_DATA}>
                        {v>0?<span style={{color:"#3182F6",fontWeight:600}}>{wonFmt(v)}</span>:<span style={{color:"#CBD5E1"}}>—</span>}
                      </td>;
                    })}
                    <td style={{...TD_TOT_COL,color:"#1D4ED8"}}>{dash(revGrand)}</td>
                  </tr>
                  <tr>
                    <td style={TD_LABEL}>지출</td>
                    {Array.from({length:12},(_,m)=>{
                      const v = costMonthTotal(m);
                      return <td key={m} style={isCurYear&&m===curMonth?TD_DATA_CUR:TD_DATA}>
                        {v>0?wonFmt(v):<span style={{color:"#CBD5E1"}}>—</span>}
                      </td>;
                    })}
                    <td style={TD_TOT_COL}>{dash(costGrand)}</td>
                  </tr>
                  <tr>
                    <td style={TD_SUM_LABEL}>순이익</td>
                    {Array.from({length:12},(_,m)=>{
                      const net  = revMonthTotal(m)-costMonthTotal(m);
                      const has  = revMonthTotal(m)>0||costMonthTotal(m)>0;
                      return <td key={m} style={{
                        ...TD_SUM_DATA,
                        background: isCurYear&&m===curMonth?"#DBEAFE":"#F1F5F9",
                        color: !has?"#CBD5E1":net>=0?"#1D4ED8":"#EF4444",
                        fontWeight: has?700:400,
                      }}>
                        {has?wonFmt(net):"—"}
                      </td>;
                    })}
                    <td style={{...TD_SUM_DATA, background:"#E2E8F0", color:netGrand>=0?"#1E40AF":"#EF4444", fontSize:13}}>
                      {wonFmt(netGrand)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* ── 매출 상세 ── */}
          <section>
            <SectionTitle>매출 상세{team!=="전체"?` — ${team}`:""}</SectionTitle>
            <div className="overflow-x-auto rounded-xl" style={{ border:"1px solid #E2E8F0", boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
              <table className="w-full border-collapse" style={{ minWidth:900 }}>
                <thead><tr><th style={TH_LABEL}>팀</th><MonthHeaders/></tr></thead>
                <tbody>
                  {filteredTeams.map((t,ri)=>{
                    const rowTotal = sum(Array.from({length:12},(_,m)=>teamMonthly(t,m)));
                    const color = TEAM_COLORS[t.team];
                    return (
                      <tr key={t.team} style={{ background:ri%2===0?"#fff":"#FAFBFC" }}>
                        <td style={{...TD_LABEL,fontWeight:700}}>
                          <span className="flex items-center gap-2">
                            {color && <span className="w-2 h-2 rounded-full shrink-0" style={{background:color}}/>}
                            <span style={{color:color??"#475569"}}>{t.team}</span>
                          </span>
                        </td>
                        {Array.from({length:12},(_,m)=>{
                          const v = teamMonthly(t,m);
                          return <td key={m} style={isCurYear&&m===curMonth?TD_DATA_CUR:TD_DATA}>
                            {v>0?<span style={{color:color??"#334155",fontWeight:600}}>{wonFmt(v)}</span>:<span style={{color:"#E2E8F0"}}>—</span>}
                          </td>;
                        })}
                        <td style={{...TD_TOT_COL,color:color??"#1E40AF"}}>{dash(rowTotal)}</td>
                      </tr>
                    );
                  })}
                  {team==="전체" && (
                    <tr style={{background:"#FAFBFC"}}>
                      <td style={{...TD_LABEL,color:"#94A3B8"}}>기타</td>
                      {(revenue?.other??new Array(12).fill(0)).map((v,m)=>(
                        <td key={m} style={isCurYear&&m===curMonth?TD_DATA_CUR:TD_DATA}>
                          {v>0?wonFmt(v):<span style={{color:"#E2E8F0"}}>—</span>}
                        </td>
                      ))}
                      <td style={{...TD_TOT_COL,color:"#94A3B8"}}>{dash(sum(revenue?.other??[]))}</td>
                    </tr>
                  )}
                  <tr>
                    <td style={TD_SUM_LABEL}>TOTAL</td>
                    {Array.from({length:12},(_,m)=>{
                      const v = revMonthTotal(m);
                      return <td key={m} style={{...TD_SUM_DATA, background:isCurYear&&m===curMonth?"#DBEAFE":"#F1F5F9", color:v>0?"#1D4ED8":"#CBD5E1"}}>
                        {v>0?wonFmt(v):"—"}
                      </td>;
                    })}
                    <td style={{...TD_SUM_DATA,background:"#E2E8F0",color:"#1E40AF",fontSize:13}}>{dash(revGrand)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* ── 판매비와 관리비 ── */}
          <section>
            <SectionTitle
              note={
                <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg"
                  style={{ background:"rgba(49,130,246,0.07)", color:"#3182F6", border:"1px solid rgba(49,130,246,0.2)" }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  셀을 클릭하여 금액 입력
                </span>
              }
            >
              판매비와 관리비
            </SectionTitle>
            <div className="overflow-x-auto rounded-xl" style={{ border:"1px solid #E2E8F0", boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
              <table className="w-full border-collapse" style={{ minWidth:900 }}>
                <thead><tr><th style={TH_LABEL}>항목</th><MonthHeaders/></tr></thead>
                <tbody>
                  {SGA_CATEGORIES.map((cat,ri)=>{
                    const isDirect = cat==="직접매입(상품)";
                    const rowTotal = sum(Array.from({length:12},(_,m)=>costs[costKey(cat,m)]??0));
                    return (
                      <tr key={cat} style={{ background:ri%2===0?"#fff":"#FAFBFC" }}>
                        <td style={{...TD_LABEL, color:isDirect?"#94A3B8":"#475569"}}>
                          <span className="flex items-center gap-2">
                            {cat}
                            {isDirect && (
                              <span style={{ background:"#F1F5F9", color:"#94A3B8", fontSize:10, fontWeight:600, padding:"1px 6px", borderRadius:4 }}>
                                자동집계
                              </span>
                            )}
                          </span>
                        </td>
                        {Array.from({length:12},(_,m)=>{
                          const key = costKey(cat,m);
                          const val = costs[key]??0;
                          const isEditing = editKey===key;
                          const isHovered = hoverKey===key;
                          const isSaved   = savedKey===key;
                          const isCur     = isCurYear&&m===curMonth;

                          if (isDirect) {
                            return (
                              <td key={m} style={{...TD_DATA, background:isCur?"#EFF6FF":"#FAFBFC", borderColor:isCur?"#BFDBFE":"#E9EBEF", color:val>0?"#6366F1":"#CBD5E1"}}>
                                {val>0?wonFmt(val):"—"}
                              </td>
                            );
                          }
                          return (
                            <td key={m}
                              style={{
                                ...TD_DATA,
                                cursor:"text",
                                padding: isEditing?"2px 4px":undefined,
                                background: isEditing?"#EFF6FF":isSaved?"rgba(16,185,129,0.06)":isHovered?"rgba(49,130,246,0.04)":isCur?"#EFF6FF":"#fff",
                                borderColor: isEditing?"#3182F6":isSaved?"rgba(16,185,129,0.4)":isHovered?"#93C5FD":isCur?"#BFDBFE":"#E9EBEF",
                                transition:"background 0.12s, border-color 0.12s",
                              }}
                              onClick={()=>!isEditing&&startEdit(key)}
                              onMouseEnter={()=>!isEditing&&setHoverKey(key)}
                              onMouseLeave={()=>setHoverKey(null)}
                            >
                              {isEditing ? (
                                <input ref={inputRef} type="text" value={editValue}
                                  onChange={e=>setEditValue(e.target.value)}
                                  onBlur={commitEdit}
                                  onKeyDown={e=>{ if(e.key==="Enter")commitEdit(); if(e.key==="Escape")setEditKey(null); }}
                                  className="w-full text-right text-xs outline-none rounded px-2 py-1"
                                  style={{ border:"1.5px solid #3182F6", color:"#191F28", background:"#fff", minWidth:64 }}/>
                              ) : isSaved ? (
                                <span className="flex items-center justify-end gap-1" style={{color:"#10B981"}}>
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                                  {val>0?wonFmt(val):"₩0"}
                                </span>
                              ) : isHovered ? (
                                <span className="flex items-center justify-end gap-1.5">
                                  <span style={{color:val>0?"#334155":"#CBD5E1"}}>{val>0?wonFmt(val):"입력"}</span>
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#3182F6" strokeWidth="2.5" strokeLinecap="round" style={{flexShrink:0}}>
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                  </svg>
                                </span>
                              ) : (
                                val>0?<span style={{color:"#334155"}}>{wonFmt(val)}</span>:<span style={{color:"#CBD5E1"}}>—</span>
                              )}
                            </td>
                          );
                        })}
                        <td style={{...TD_TOT_COL, color:isDirect?"#6366F1":rowTotal>0?"#1E40AF":"#CBD5E1"}}>
                          {rowTotal>0?wonFmt(rowTotal):"—"}
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td style={TD_SUM_LABEL}>TOTAL</td>
                    {Array.from({length:12},(_,m)=>{
                      const v = costMonthTotal(m);
                      return <td key={m} style={{...TD_SUM_DATA, background:isCurYear&&m===curMonth?"#DBEAFE":"#F1F5F9", color:v>0?"#1D4ED8":"#CBD5E1"}}>
                        {v>0?wonFmt(v):"—"}
                      </td>;
                    })}
                    <td style={{...TD_SUM_DATA,background:"#E2E8F0",color:"#1E40AF",fontSize:13}}>{dash(costGrand)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
