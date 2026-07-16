"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { KeywordPerformance, type KeywordItem, type KeywordSummary } from "@/components/client-report/KeywordPerformance";

interface ReportData {
  client: { id: string; companyName: string; storeName: string | null; industry: string | null };
  report: {
    managerName: string | null; summary: string | null;
    activityContent: string; nextPlanContent: string; comment: string | null;
    updatedAt: string;
  } | null;
  keyword: { items: KeywordItem[]; summary: KeywordSummary };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="report-section" style={{ marginTop: 28 }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
        <span style={{ width: 4, height: 16, borderRadius: 2, background: "#3182F6", display: "inline-block" }} />
        <h2 style={{ fontSize: 16, fontWeight: 800, color: "#191F28" }}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function ReportBody() {
  const sp = useSearchParams();
  const clientId = sp.get("clientId") ?? "";
  const year  = sp.get("year") ?? "";
  const month = sp.get("month") ?? "";

  const [data, setData]     = useState<ReportData | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!clientId || !year || !month) { setError("잘못된 접근입니다."); setLoading(false); return; }
    fetch(`/api/client-reports/data?clientId=${clientId}&year=${year}&month=${month}`)
      .then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "불러오기 실패"); return r.json(); })
      .then((d: ReportData) => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [clientId, year, month]);

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "#CBD5E1" }}>불러오는 중...</div>;
  if (error || !data) return <div style={{ padding: 60, textAlign: "center", color: "#EF4444" }}>{error ?? "데이터 없음"}</div>;

  const { client, report, keyword } = data;
  const kw = keyword.summary;
  const highlight = keyword.items.length
    ? `추적 키워드 ${kw.trackerCount}개 중 ${kw.top10Count}개가 10위권에 노출 중이며, ${kw.improvedCount}개 키워드가 순위 상승·신규 진입했습니다.`
    : null;

  return (
    <>
      {/* 인쇄 버튼 (인쇄 시 숨김) */}
      <div className="no-print" style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", justifyContent: "center", gap: 8, padding: "12px", background: "#F1F3F5", borderBottom: "1px solid #E5E8EB" }}>
        <button onClick={() => window.print()}
          style={{ padding: "10px 20px", borderRadius: 12, background: "linear-gradient(135deg,#3182F6,#2462D8)", color: "#fff", fontWeight: 700, fontSize: 14, border: "none", cursor: "pointer" }}>
          PDF로 저장 (인쇄)
        </button>
        <span style={{ alignSelf: "center", fontSize: 12, color: "#8B95A1" }}>인쇄 대화상자에서 &ldquo;PDF로 저장&rdquo;을 선택하세요.</span>
      </div>

      {/* A4 리포트 */}
      <div className="report-page" style={{ maxWidth: 800, margin: "0 auto", padding: "40px 44px", background: "#fff", color: "#191F28" }}>
        {/* 표지 헤더 */}
        <div style={{ borderBottom: "2px solid #191F28", paddingBottom: 18, marginBottom: 8 }}>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.5px" }}>DIVERZ</span>
            <span style={{ fontSize: 12, color: "#94A3B8" }}>{year}년 {month}월 마케팅 리포트</span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 900, marginTop: 18, letterSpacing: "-0.5px" }}>{client.companyName}</h1>
          <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 13, color: "#64748B", flexWrap: "wrap" }}>
            {client.storeName && <span>{client.storeName}</span>}
            {client.industry && <span>· {client.industry}</span>}
            <span>· 리포트 기간 {year}.{String(month).padStart(2, "0")}</span>
            {report?.managerName && <span>· 담당 {report.managerName}</span>}
          </div>
        </div>

        {/* 한 줄 요약 */}
        {report?.summary && (
          <div style={{ marginTop: 16, padding: "14px 18px", borderRadius: 12, background: "rgba(49,130,246,0.06)", border: "1px solid rgba(49,130,246,0.15)" }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#1E40AF", lineHeight: 1.6 }}>{report.summary}</p>
          </div>
        )}

        {/* 키워드 순위 성과 */}
        <Section title="키워드 순위 성과">
          {highlight && <p style={{ fontSize: 13, color: "#475569", marginBottom: 12, lineHeight: 1.6 }}>{highlight}</p>}
          <KeywordPerformance items={keyword.items} summary={keyword.summary} />
        </Section>

        {/* 이번 달 활동 */}
        {report?.activityContent?.trim() && (
          <Section title="이번 달 활동">
            <p style={{ fontSize: 14, lineHeight: 1.75, color: "#334155", whiteSpace: "pre-wrap" }}>{report.activityContent}</p>
          </Section>
        )}

        {/* 다음 달 계획 */}
        {report?.nextPlanContent?.trim() && (
          <Section title="다음 달 계획">
            <p style={{ fontSize: 14, lineHeight: 1.75, color: "#334155", whiteSpace: "pre-wrap" }}>{report.nextPlanContent}</p>
          </Section>
        )}

        {/* 코멘트 */}
        {report?.comment?.trim() && (
          <Section title="담당자 코멘트">
            <div style={{ padding: "14px 18px", borderRadius: 12, background: "#F8FAFC", border: "1px solid #E9EBEF" }}>
              <p style={{ fontSize: 14, lineHeight: 1.75, color: "#334155", whiteSpace: "pre-wrap" }}>{report.comment}</p>
            </div>
          </Section>
        )}

        {/* 푸터 */}
        <div style={{ marginTop: 40, paddingTop: 16, borderTop: "1px solid #E9EBEF", display: "flex", justifyContent: "space-between", fontSize: 11, color: "#B0B8C1" }}>
          <span>DIVERZ · Dive Deep Rise Fast</span>
          <span>본 리포트는 {client.companyName}님을 위해 작성되었습니다.</span>
        </div>
      </div>

      <style>{`
        body { background: #F1F3F5; }
        @media print {
          @page { size: A4; margin: 12mm; }
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .report-page { max-width: none !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; }
          .report-section { break-inside: avoid; }
          table { break-inside: auto; }
          tr { break-inside: avoid; }
        }
      `}</style>
    </>
  );
}

export default function ClientReportPrintPage() {
  return (
    <Suspense fallback={<div style={{ padding: 60, textAlign: "center", color: "#CBD5E1" }}>불러오는 중...</div>}>
      <ReportBody />
    </Suspense>
  );
}
