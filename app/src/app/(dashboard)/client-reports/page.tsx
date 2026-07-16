"use client";

import { useState, useEffect, useCallback } from "react";
import { KeywordPerformance, type KeywordItem, type KeywordSummary } from "@/components/client-report/KeywordPerformance";

interface ClientOpt { id: string; companyName: string; storeName: string | null; trackerCount: number; }
interface SavedReport {
  id: string; managerName: string | null; summary: string | null;
  activityContent: string; nextPlanContent: string; comment: string | null;
  updatedAt: string;
}
interface ReportData {
  client: { id: string; companyName: string; storeName: string | null; industry: string | null };
  report: SavedReport | null;
  keyword: { items: KeywordItem[]; summary: KeywordSummary };
}

const now = new Date();
const YEARS = [now.getFullYear(), now.getFullYear() - 1];
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

const inputCls = "w-full px-3 py-2 text-sm rounded-xl outline-none border transition-colors focus:border-[#3182F6]";
const inputStyle = { background: "#F8FAFC", borderColor: "#E9EBEF", color: "#191F28" };
const labelCls = "block text-xs font-semibold mb-1.5";
const labelStyle = { color: "#64748B" };

export default function ClientReportsPage() {
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [clientId, setClientId] = useState("");
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [data, setData]       = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // 수기 폼
  const [manager, setManager]   = useState("");
  const [summary, setSummary]   = useState("");
  const [activity, setActivity] = useState("");
  const [nextPlan, setNextPlan] = useState("");
  const [comment, setComment]   = useState("");

  useEffect(() => {
    fetch("/api/client-reports/clients").then(r => r.json()).then(d => {
      const list: ClientOpt[] = d.clients ?? [];
      setClients(list);
      if (!clientId && list.length) setClientId(list[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = useCallback(() => {
    if (!clientId) return;
    setLoading(true);
    fetch(`/api/client-reports/data?clientId=${clientId}&year=${year}&month=${month}`)
      .then(r => r.json())
      .then((d: ReportData) => {
        setData(d);
        setManager(d.report?.managerName ?? "");
        setSummary(d.report?.summary ?? "");
        setActivity(d.report?.activityContent ?? "");
        setNextPlan(d.report?.nextPlanContent ?? "");
        setComment(d.report?.comment ?? "");
      })
      .finally(() => setLoading(false));
  }, [clientId, year, month]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadData(); }, [loadData]);

  async function handleSave() {
    if (!clientId) return;
    setSaving(true);
    const res = await fetch("/api/client-reports", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, year, month, managerName: manager, summary, activityContent: activity, nextPlanContent: nextPlan, comment }),
    });
    if (res.ok) {
      const { report } = await res.json();
      setData(d => d ? { ...d, report } : d);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } else {
      alert("저장에 실패했습니다.");
    }
    setSaving(false);
  }

  function openPdf() {
    if (!clientId) return;
    window.open(`/client-report-print?clientId=${clientId}&year=${year}&month=${month}`, "_blank");
  }

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "#191F28" }}>클라이언트 리포트</h1>
          <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>광고주에게 제공할 월별 성과 리포트를 작성하고 PDF로 내보냅니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSave} disabled={saving || !clientId}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: savedFlash ? "#10B981" : "linear-gradient(135deg,#3182F6,#2462D8)" }}>
            {saving ? "저장 중..." : savedFlash ? "저장됨 ✓" : "저장"}
          </button>
          <button onClick={openPdf} disabled={!clientId}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors hover:bg-slate-50 disabled:opacity-50"
            style={{ borderColor: "#E9EBEF", color: "#3182F6" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
            PDF 리포트 열기
          </button>
        </div>
      </div>

      {/* 선택 */}
      <div className="rounded-2xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
        <div>
          <label className={labelCls} style={labelStyle}>광고주</label>
          <select value={clientId} onChange={e => setClientId(e.target.value)} className={inputCls} style={inputStyle}>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.companyName}{c.trackerCount > 0 ? ` · 키워드 ${c.trackerCount}` : ""}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} style={labelStyle}>연도</label>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className={inputCls} style={inputStyle}>
            {YEARS.map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} style={labelStyle}>월</label>
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className={inputCls} style={inputStyle}>
            {MONTHS.map(m => <option key={m} value={m}>{m}월</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl p-10 text-center text-sm" style={{ background: "#fff", border: "1px solid #E9EBEF", color: "#CBD5E1" }}>불러오는 중...</div>
      ) : data ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* 왼쪽: 자동 — 키워드 성과 미리보기 */}
          <div className="rounded-2xl p-5 space-y-3" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold" style={{ color: "#191F28" }}>키워드 순위 성과 <span className="font-normal text-xs" style={{ color: "#94A3B8" }}>(자동)</span></h3>
              <span className="text-xs" style={{ color: "#94A3B8" }}>{data.client.companyName} · {year}년 {month}월</span>
            </div>
            <KeywordPerformance items={data.keyword.items} summary={data.keyword.summary} />
          </div>

          {/* 오른쪽: 수기 입력 */}
          <div className="rounded-2xl p-5 space-y-4" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
            <h3 className="text-sm font-bold" style={{ color: "#191F28" }}>리포트 내용 <span className="font-normal text-xs" style={{ color: "#94A3B8" }}>(수기 작성)</span></h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} style={labelStyle}>담당자</label>
                <input value={manager} onChange={e => setManager(e.target.value)} placeholder="이름" className={inputCls} style={inputStyle} />
              </div>
              <div>
                <label className={labelCls} style={labelStyle}>한 줄 요약</label>
                <input value={summary} onChange={e => setSummary(e.target.value)} placeholder="이번 달 핵심 요약" className={inputCls} style={inputStyle} />
              </div>
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>이번 달 활동</label>
              <textarea value={activity} onChange={e => setActivity(e.target.value)} rows={7}
                placeholder={"이번 달 진행한 마케팅 활동을 정리하세요.\n\n예)\n• 네이버 쇼핑 키워드 최적화\n• 상세페이지 개편\n• 리뷰 이벤트 진행"}
                className={`${inputCls} resize-none leading-relaxed`} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>다음 달 계획</label>
              <textarea value={nextPlan} onChange={e => setNextPlan(e.target.value)} rows={5}
                placeholder={"다음 달 진행 예정 계획을 정리하세요."}
                className={`${inputCls} resize-none leading-relaxed`} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>담당자 코멘트 <span className="font-normal" style={{ color: "#B0B8C1" }}>(선택)</span></label>
              <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3}
                placeholder="광고주에게 전할 코멘트" className={`${inputCls} resize-none leading-relaxed`} style={inputStyle} />
            </div>
            {data.report?.updatedAt && (
              <p className="text-xs" style={{ color: "#B0B8C1" }}>최종 저장 {new Date(data.report.updatedAt).toLocaleString("ko-KR")}</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
