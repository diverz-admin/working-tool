"use client";

import { useState, useEffect, useCallback } from "react";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { fetchJson } from "@/lib/fetch-json";

// ─── 타입 & 상수 ─────────────────────────────────────────────
type Tab = "meta" | "instagram" | "blog";

const TABS: { key: Tab; label: string; icon: React.ReactNode; color: string }[] = [
  {
    key: "meta", label: "메타광고", color: "#1877F2",
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.04C6.5 2.04 2 6.53 2 12.06C2 17.06 5.66 21.21 10.44 21.96V14.96H7.9V12.06H10.44V9.85C10.44 7.34 11.93 5.96 14.22 5.96C15.31 5.96 16.45 6.15 16.45 6.15V8.62H15.19C13.95 8.62 13.56 9.39 13.56 10.18V12.06H16.34L15.89 14.96H13.56V21.96A10 10 0 0 0 22 12.06C22 6.53 17.5 2.04 12 2.04Z"/></svg>,
  },
  {
    key: "instagram", label: "인스타그램 운영", color: "#E1306C",
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>,
  },
  {
    key: "blog", label: "블로그 발행", color: "#03C75A",
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5C3.9 3 3 3.9 3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>,
  },
];

const MONTHS = ["1월","2월","3월","4월","5월","6월"];

// ─── 메타광고 데이터 ──────────────────────────────────────────
const META_MONTHLY = [
  { month: "1월", 광고비: 320000, 노출: 128000, 클릭: 3840, 전환: 192 },
  { month: "2월", 광고비: 290000, 노출: 116000, 클릭: 3480, 전환: 174 },
  { month: "3월", 광고비: 380000, 노출: 152000, 클릭: 4560, 전환: 228 },
  { month: "4월", 광고비: 350000, 노출: 140000, 클릭: 4200, 전환: 210 },
  { month: "5월", 광고비: 420000, 노출: 168000, 클릭: 5040, 전환: 252 },
  { month: "6월", 광고비: 390000, 노출: 156000, 클릭: 4680, 전환: 234 },
];
const META_CAMPAIGNS = [
  { name: "여름 프로모션", 광고비: 150000, 클릭: 1800, 전환: 90,  ROAS: 4.2 },
  { name: "브랜드 인지도", 광고비: 120000, 클릭: 1440, 전환: 72,  ROAS: 3.8 },
  { name: "리타겟팅",      광고비:  80000, 클릭:  960, 전환: 48,  ROAS: 5.1 },
  { name: "신규 유입",     광고비:  40000, 클릭:  480, 전환: 24,  ROAS: 3.2 },
];
const cur = META_MONTHLY[META_MONTHLY.length - 1];
const prev = META_MONTHLY[META_MONTHLY.length - 2];
const META_KPI = [
  { label: "총 광고비",   value: `₩${cur.광고비.toLocaleString()}`, sub: `전월比 ${cur.광고비 >= prev.광고비 ? "▲" : "▼"}${Math.abs(Math.round((cur.광고비 - prev.광고비) / prev.광고비 * 100))}%`, color: "#1877F2", up: cur.광고비 >= prev.광고비 },
  { label: "총 노출수",   value: `${(cur.노출 / 1000).toFixed(0)}K`,  sub: `CTR ${(cur.클릭 / cur.노출 * 100).toFixed(2)}%`, color: "#6366F1" },
  { label: "클릭수",      value: cur.클릭.toLocaleString(),           sub: `CPC ₩${Math.round(cur.광고비 / cur.클릭).toLocaleString()}`, color: "#8B5CF6" },
  { label: "전환수",      value: cur.전환.toString(),                 sub: `전환율 ${(cur.전환 / cur.클릭 * 100).toFixed(1)}%`, color: "#10B981" },
  { label: "ROAS",        value: `${(cur.광고비 / (cur.전환 * 2000) ).toFixed(1)}x`,  sub: "광고 수익률", color: "#F59E0B" },
];

// ─── 인스타그램 데이터 ───────────────────────────────────────
const IG_MONTHLY = [
  { month: "1월", 팔로워: 3240, 신규: 180, 도달: 28400, 좋아요: 1920, 댓글: 384 },
  { month: "2월", 팔로워: 3410, 신규: 170, 도달: 26800, 좋아요: 1840, 댓글: 368 },
  { month: "3월", 팔로워: 3620, 신규: 210, 도달: 32600, 좋아요: 2240, 댓글: 448 },
  { month: "4월", 팔로워: 3850, 신규: 230, 도달: 35200, 좋아요: 2560, 댓글: 512 },
  { month: "5월", 팔로워: 4120, 신규: 270, 도달: 39800, 좋아요: 2880, 댓글: 576 },
  { month: "6월", 팔로워: 4380, 신규: 260, 도달: 42100, 좋아요: 3040, 댓글: 608 },
];
const IG_POSTS = [
  { title: "여름 신상품 소개",     date: "6/24", 좋아요: 482, 댓글: 67, 저장: 124, 도달: 6840 },
  { title: "뒤태 촬영 비하인드",   date: "6/19", 좋아요: 371, 댓글: 43, 저장: 89,  도달: 5120 },
  { title: "브랜드 스토리 #1",     date: "6/17", 좋아요: 298, 댓글: 31, 저장: 76,  도달: 4380 },
  { title: "프로모션 안내",         date: "6/15", 좋아요: 245, 댓글: 28, 저장: 52,  도달: 3760 },
  { title: "팀 소개 릴스",          date: "6/10", 좋아요: 612, 댓글: 89, 저장: 201, 도달: 9240 },
];
const igCur = IG_MONTHLY[IG_MONTHLY.length - 1];
const igPrev = IG_MONTHLY[IG_MONTHLY.length - 2];
const IG_KPI = [
  { label: "팔로워",         value: igCur.팔로워.toLocaleString(),   sub: `+${igCur.신규} 신규`, color: "#E1306C" },
  { label: "팔로워 증가",    value: `+${igCur.신규}`,                sub: `전월比 ${igCur.신규 >= igPrev.신규 ? "▲" : "▼"}${Math.abs(Math.round((igCur.신규 - igPrev.신규) / igPrev.신규 * 100))}%`, color: "#6366F1", up: igCur.신규 >= igPrev.신규 },
  { label: "도달",           value: `${(igCur.도달 / 1000).toFixed(1)}K`, sub: "이번달 총 도달", color: "#8B5CF6" },
  { label: "인게이지먼트율", value: `${((igCur.좋아요 + igCur.댓글) / igCur.도달 * 100).toFixed(2)}%`, sub: "좋아요+댓글 / 도달", color: "#10B981" },
  { label: "이번달 게시물",  value: "9건",                            sub: "릴스 3 · 피드 6", color: "#F59E0B" },
];

// ─── 블로그 데이터 ───────────────────────────────────────────
const BLOG_MONTHLY = [
  { month: "1월", 발행: 4, 방문자: 1240, 페이지뷰: 2480, 체류: 132 },
  { month: "2월", 발행: 4, 방문자: 1380, 페이지뷰: 2760, 체류: 148 },
  { month: "3월", 발행: 5, 방문자: 1820, 페이지뷰: 3640, 체류: 164 },
  { month: "4월", 발행: 4, 방문자: 2040, 페이지뷰: 4080, 체류: 171 },
  { month: "5월", 발행: 5, 방문자: 2460, 페이지뷰: 4920, 체류: 185 },
  { month: "6월", 발행: 4, 방문자: 2820, 페이지뷰: 5640, 체류: 192 },
];
const BLOG_POSTS = [
  { title: "여름철 마케팅 전략 A to Z",     date: "6/25", 방문자: 841, 페이지뷰: 1248, 체류: "3:24", top: true },
  { title: "SNS 콘텐츠 기획하는 방법",       date: "6/18", 방문자: 692, 페이지뷰: 980,  체류: "2:58" },
  { title: "메타광고 초보자 가이드",          date: "6/16", 방문자: 584, 페이지뷰: 836,  체류: "4:12", top: true },
  { title: "인스타그램 팔로워 늘리는 법",    date: "6/11", 방문자: 421, 페이지뷰: 612,  체류: "2:41" },
];
const blogCur = BLOG_MONTHLY[BLOG_MONTHLY.length - 1];
const blogPrev = BLOG_MONTHLY[BLOG_MONTHLY.length - 2];
const BLOG_KPI = [
  { label: "발행 수",     value: `${blogCur.발행}건`,                 sub: "이번달 신규 포스팅", color: "#03C75A" },
  { label: "방문자",      value: blogCur.방문자.toLocaleString(),     sub: `전월比 ▲${Math.round((blogCur.방문자 - blogPrev.방문자) / blogPrev.방문자 * 100)}%`, color: "#3182F6", up: true },
  { label: "페이지뷰",    value: blogCur.페이지뷰.toLocaleString(),   sub: `방문당 ${(blogCur.페이지뷰 / blogCur.방문자).toFixed(1)}p`, color: "#6366F1" },
  { label: "평균 체류",   value: `${Math.floor(blogCur.체류 / 60)}:${String(blogCur.체류 % 60).padStart(2,"0")}`, sub: "분:초", color: "#F59E0B" },
  { label: "누적 포스팅", value: "26건",                               sub: "2026년 총합", color: "#94A3B8" },
];

// ─── 공통 컴포넌트 ────────────────────────────────────────────
function KpiCard({ label, value, sub, color, up }: { label: string; value: string; sub: string; color: string; up?: boolean }) {
  const isUp = up === undefined ? true : up;
  const subHasArrow = sub.includes("▲") || sub.includes("▼");
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-2" style={{ background: "#FFFFFF", border: "1px solid #E9EBEF" }}>
      <p className="text-xs font-semibold" style={{ color: "#94A3B8" }}>{label}</p>
      <p className="text-2xl font-black tracking-tight" style={{ color: "#191F28" }}>{value}</p>
      <p className="text-xs" style={{ color: subHasArrow ? (isUp ? "#10B981" : "#EF4444") : "#94A3B8" }}>{sub}</p>
    </div>
  );
}

const TOOLTIP_STYLE = {
  background: "#191F28", border: "none", borderRadius: 10, fontSize: 12,
  color: "#fff", boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
};

// ─── 메타광고 탭 ──────────────────────────────────────────────
function MetaTab() {
  return (
    <div className="space-y-5">
      {/* KPI */}
      <div className="grid grid-cols-5 gap-4">
        {META_KPI.map((k) => <KpiCard key={k.label} {...k} />)}
      </div>

      {/* 차트 2열 */}
      <div className="grid grid-cols-2 gap-5">
        {/* 광고비 추이 */}
        <div className="rounded-2xl p-5" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
          <h3 className="text-sm font-bold mb-4" style={{ color: "#191F28" }}>월별 광고비 추이</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={META_MONTHLY}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: unknown) => [`₩${(v as number).toLocaleString()}`, "광고비"]} />
              <Line type="monotone" dataKey="광고비" stroke="#1877F2" strokeWidth={2.5} dot={{ r: 4, fill: "#1877F2" }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 클릭/전환 추이 */}
        <div className="rounded-2xl p-5" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
          <h3 className="text-sm font-bold mb-4" style={{ color: "#191F28" }}>클릭 · 전환 추이</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={META_MONTHLY} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="클릭" fill="#6366F1" radius={[3, 3, 0, 0]} maxBarSize={24} />
              <Bar dataKey="전환" fill="#10B981" radius={[3, 3, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 캠페인 테이블 */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
        <div className="px-5 py-4" style={{ borderBottom: "1px solid #F1F5F9" }}>
          <h3 className="text-sm font-bold" style={{ color: "#191F28" }}>캠페인별 성과 (이번달)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "#F8FAFC" }}>
                {["캠페인명","광고비","클릭수","전환수","ROAS","상태"].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold" style={{ color: "#64748B" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {META_CAMPAIGNS.map((c, i) => (
                <tr key={i} className="border-t" style={{ borderColor: "#F1F5F9" }}>
                  <td className="px-5 py-3.5 font-semibold text-xs" style={{ color: "#191F28" }}>{c.name}</td>
                  <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>₩{c.광고비.toLocaleString()}</td>
                  <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>{c.클릭.toLocaleString()}</td>
                  <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>{c.전환}</td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs font-bold" style={{ color: c.ROAS >= 4 ? "#10B981" : "#F59E0B" }}>{c.ROAS}x</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(49,130,246,0.1)", color: "#3182F6" }}>진행중</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── 인스타그램 타입 ──────────────────────────────────────────
interface IgProfile { id: string; username: string; name?: string; biography?: string; followers_count: number; follows_count?: number; media_count: number; profile_picture_url?: string; }
interface IgMedia   { id: string; caption?: string; media_type: string; timestamp: string; like_count?: number; comments_count?: number; thumbnail_url?: string; media_url?: string; permalink?: string; }
interface IgStats   { connected: boolean; error?: string; profile?: IgProfile; media?: IgMedia[]; monthlyInsights?: { month: string; 도달: number; 노출: number }[]; thisMonth?: { posts: number; likes: number; comments: number }; tokenExpiresAt?: string | null; }

// ─── 인스타그램 탭 ────────────────────────────────────────────
function InstagramTab() {
  const [stats, setStats]         = useState<IgStats | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [token, setToken]         = useState("");
  const [userId, setUserId]       = useState("");
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState("");

  const fetchStats = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchJson<IgStats>("/api/instagram/stats")
      .then((d) => { setStats(d); setLoading(false); })
      // 실패를 "미연결"로 보여주면 안 된다 — 오류를 그대로 노출한다
      .catch((e: Error) => { setError(e.message); setStats(null); setLoading(false); });
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  async function handleConnect() {
    setSaving(true); setSaveError("");
    const res = await fetch("/api/instagram/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: token, igUserId: userId }),
    });
    const data = await res.json();
    if (!res.ok) { setSaveError(data.error ?? "연결 실패"); setSaving(false); return; }
    setShowSetup(false); setToken(""); setUserId("");
    fetchStats();
    setSaving(false);
  }

  async function handleDisconnect() {
    if (!confirm("Instagram 계정 연결을 해제할까요?")) return;
    await fetch("/api/instagram/connect", { method: "DELETE" });
    fetchStats();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E1306C" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        <span className="ml-3 text-sm" style={{ color: "#94A3B8" }}>Instagram 데이터 불러오는 중...</span>
      </div>
    );
  }

  // ── 조회 실패 ───────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <p className="text-sm font-semibold" style={{ color: "#EF4444" }}>{error}</p>
        <p className="text-xs" style={{ color: "#94A3B8" }}>데이터가 없는 것으로 잘못 보이지 않도록 표시를 중단했습니다.</p>
        <button onClick={fetchStats} className="px-4 py-1.5 text-sm font-semibold rounded-lg text-white" style={{ background: "linear-gradient(135deg, #E1306C, #833AB4)" }}>다시 시도</button>
      </div>
    );
  }

  // ── 미연결 상태 ─────────────────────────────────────────────
  if (!stats?.connected) {
    return (
      <div className="space-y-5">
        {/* 연결 안내 카드 */}
        <div className="rounded-2xl p-8 flex flex-col items-center gap-4 text-center" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #E1306C, #833AB4)" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="5"/>
              <circle cx="12" cy="12" r="4"/>
              <circle cx="17.5" cy="6.5" r="1" fill="white" stroke="none"/>
            </svg>
          </div>
          <div>
            <p className="text-base font-bold mb-1" style={{ color: "#191F28" }}>Instagram 계정을 연결하세요</p>
            <p className="text-sm" style={{ color: "#64748B" }}>실시간 팔로워, 게시물 성과, 도달 데이터를 자동으로 불러옵니다.</p>
          </div>
          <button onClick={() => setShowSetup(true)}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90 transition-opacity"
            style={{ background: "linear-gradient(135deg, #E1306C, #833AB4)" }}>
            계정 연결하기
          </button>
          {stats?.error && <p className="text-xs" style={{ color: "#EF4444" }}>오류: {stats.error}</p>}
        </div>

        {/* 설정 모달 */}
        {showSetup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.4)" }}>
            <div className="rounded-2xl p-6 w-full max-w-md mx-4" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
              <h3 className="text-base font-bold mb-1" style={{ color: "#191F28" }}>Instagram 계정 연결</h3>
              <p className="text-xs mb-5" style={{ color: "#94A3B8" }}>Meta Graph API 액세스 토큰을 입력하세요.</p>

              {/* 토큰 발급 안내 */}
              <div className="rounded-xl p-4 mb-4 text-xs space-y-1.5" style={{ background: "#F8FAFC", border: "1px solid #E9EBEF" }}>
                <p className="font-bold" style={{ color: "#475569" }}>토큰 발급 방법</p>
                <p style={{ color: "#64748B" }}>① <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" className="underline" style={{ color: "#3182F6" }}>developers.facebook.com</a> → 앱 만들기 → 비즈니스</p>
                <p style={{ color: "#64748B" }}>② 제품 추가 → Instagram Graph API 선택</p>
                <p style={{ color: "#64748B" }}>③ Graph API Explorer → 앱 선택 → 사용자 토큰 생성</p>
                <p style={{ color: "#64748B" }}>④ 권한 추가: <code className="px-1 rounded" style={{ background: "#E9EBEF" }}>instagram_basic, instagram_manage_insights, pages_show_list</code></p>
                <p style={{ color: "#64748B" }}>⑤ 장기 토큰 교환: Settings → 장기 액세스 토큰으로 변환 (60일)</p>
                <p style={{ color: "#64748B" }}>⑥ Instagram 계정 ID: 비즈니스 설정 → 계정 → Instagram → 계정 ID 복사</p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>Instagram 계정 ID (숫자)</label>
                  <input value={userId} onChange={(e) => setUserId(e.target.value)}
                    placeholder="예: 17841400000000000"
                    className="w-full px-3 py-2 text-sm rounded-xl outline-none border focus:border-[#E1306C]"
                    style={{ background: "#F8FAFC", borderColor: "#E9EBEF", color: "#191F28" }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>장기 액세스 토큰</label>
                  <textarea value={token} onChange={(e) => setToken(e.target.value)}
                    rows={3} placeholder="EAAxxxxxx..."
                    className="w-full px-3 py-2 text-sm rounded-xl outline-none border resize-none focus:border-[#E1306C]"
                    style={{ background: "#F8FAFC", borderColor: "#E9EBEF", color: "#191F28" }} />
                </div>
                {saveError && <p className="text-xs" style={{ color: "#EF4444" }}>{saveError}</p>}
              </div>

              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => { setShowSetup(false); setSaveError(""); }}
                  className="px-4 py-2 rounded-xl text-sm font-semibold border"
                  style={{ borderColor: "#E9EBEF", color: "#64748B" }}>취소</button>
                <button onClick={handleConnect} disabled={saving || !token || !userId}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #E1306C, #833AB4)" }}>
                  {saving ? "연결 중..." : "연결하기"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── 연결된 상태 ─────────────────────────────────────────────
  const { profile, media = [], monthlyInsights = [], thisMonth } = stats;
  const recentPosts = [...media].sort((a, b) => (b.like_count ?? 0) - (a.like_count ?? 0)).slice(0, 10);
  const totalLikes    = thisMonth?.likes ?? 0;
  const totalComments = thisMonth?.comments ?? 0;
  const engRate = profile && totalLikes + totalComments > 0 && media.length > 0
    ? ((totalLikes + totalComments) / media.length / 100).toFixed(2)
    : "—";

  const daysLeft = stats.tokenExpiresAt
    ? Math.max(0, Math.round((new Date(stats.tokenExpiresAt).getTime() - Date.now()) / 86400000))
    : null;

  return (
    <div className="space-y-5">
      {/* 계정 헤더 */}
      <div className="rounded-2xl p-5 flex items-center justify-between" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
        <div className="flex items-center gap-4">
          {profile?.profile_picture_url ? (
            <img src={profile.profile_picture_url} alt={profile.username} className="w-12 h-12 rounded-full object-cover" />
          ) : (
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-black"
              style={{ background: "linear-gradient(135deg, #E1306C, #833AB4)" }}>
              {profile?.username?.[0]?.toUpperCase() ?? "I"}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <p className="text-base font-bold" style={{ color: "#191F28" }}>@{profile?.username}</p>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(225,48,108,0.1)", color: "#E1306C" }}>
                실시간 연동
              </span>
            </div>
            {profile?.biography && <p className="text-xs mt-0.5 truncate max-w-sm" style={{ color: "#64748B" }}>{profile.biography}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {daysLeft !== null && daysLeft <= 15 && (
            <span className="text-xs px-2 py-1 rounded-lg font-semibold" style={{ background: "rgba(245,158,11,0.1)", color: "#D97706" }}>
              토큰 만료 D-{daysLeft}
            </span>
          )}
          <button onClick={() => setShowSetup(true)}
            className="text-xs px-3 py-1.5 rounded-xl border transition-colors hover:bg-slate-50"
            style={{ borderColor: "#E9EBEF", color: "#64748B" }}>토큰 갱신</button>
          <button onClick={handleDisconnect}
            className="text-xs px-3 py-1.5 rounded-xl transition-colors"
            style={{ background: "rgba(239,68,68,0.07)", color: "#EF4444" }}>연결 해제</button>
        </div>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-5 gap-4">
        <KpiCard label="팔로워" value={(profile?.followers_count ?? 0).toLocaleString()} sub={`팔로잉 ${(profile?.follows_count ?? 0).toLocaleString()}`} color="#E1306C" />
        <KpiCard label="총 게시물" value={(profile?.media_count ?? 0).toLocaleString()} sub="누적 게시물 수" color="#833AB4" />
        <KpiCard label="이번달 게시물" value={`${thisMonth?.posts ?? 0}건`} sub={`최근 30일 기준`} color="#F59E0B" />
        <KpiCard label="이번달 좋아요" value={(totalLikes).toLocaleString()} sub="이번달 게시물 합계" color="#6366F1" up={true} />
        <KpiCard label="이번달 댓글" value={(totalComments).toLocaleString()} sub={`평균 인게이지먼트 ${engRate}`} color="#10B981" up={true} />
      </div>

      {/* 차트 2열 */}
      <div className="grid grid-cols-2 gap-5">
        {/* 도달/노출 추이 */}
        <div className="rounded-2xl p-5" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
          <h3 className="text-sm font-bold mb-4" style={{ color: "#191F28" }}>월별 도달·노출 추이</h3>
          {monthlyInsights.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={monthlyInsights}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: unknown, n: unknown) => [Number(v).toLocaleString(), n as string]} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="도달" stroke="#E1306C" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="노출" stroke="#833AB4" strokeWidth={2} strokeDasharray="4 2" dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center flex-col gap-2">
              <p className="text-xs font-semibold" style={{ color: "#94A3B8" }}>인사이트 데이터 없음</p>
              <p className="text-xs" style={{ color: "#CBD5E1" }}>instagram_manage_insights 권한이 필요합니다</p>
            </div>
          )}
        </div>

        {/* 최근 게시물 좋아요/댓글 */}
        <div className="rounded-2xl p-5" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
          <h3 className="text-sm font-bold mb-4" style={{ color: "#191F28" }}>최근 게시물 인게이지먼트</h3>
          {media.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={media.slice(0, 8).reverse().map((m) => ({
                날짜: new Date(m.timestamp).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }),
                좋아요: m.like_count ?? 0,
                댓글: m.comments_count ?? 0,
              }))} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="날짜" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="좋아요" fill="#E1306C" radius={[3, 3, 0, 0]} maxBarSize={20} />
                <Bar dataKey="댓글"   fill="#833AB4" radius={[3, 3, 0, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center">
              <p className="text-xs" style={{ color: "#94A3B8" }}>게시물이 없습니다</p>
            </div>
          )}
        </div>
      </div>

      {/* 게시물 성과 테이블 */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid #F1F5F9" }}>
          <h3 className="text-sm font-bold" style={{ color: "#191F28" }}>최근 게시물 성과 (좋아요 순)</h3>
          <span className="text-xs" style={{ color: "#94A3B8" }}>최근 {Math.min(recentPosts.length, 10)}개</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "#F8FAFC" }}>
                {["","게시물 내용","유형","날짜","좋아요","댓글","인게이지먼트"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: "#64748B" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentPosts.map((p, i) => {
                const thumbnail = p.thumbnail_url ?? (p.media_type !== "VIDEO" ? p.media_url : undefined);
                const caption   = p.caption ? p.caption.slice(0, 50) + (p.caption.length > 50 ? "…" : "") : "(캡션 없음)";
                const likes     = p.like_count ?? 0;
                const comments  = p.comments_count ?? 0;
                const eng       = likes + comments > 0 ? `${likes + comments}` : "—";
                return (
                  <tr key={p.id} className="border-t hover:bg-slate-50 transition-colors" style={{ borderColor: "#F1F5F9" }}>
                    <td className="px-4 py-3">
                      {thumbnail ? (
                        <img src={thumbnail} alt="" className="w-10 h-10 rounded-lg object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "rgba(225,48,108,0.1)" }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E1306C" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="2" width="20" height="20" rx="4"/><circle cx="12" cy="12" r="4"/></svg>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-[220px]">
                      {p.permalink ? (
                        <a href={p.permalink} target="_blank" rel="noreferrer"
                          className="text-xs font-medium hover:underline" style={{ color: "#191F28" }}>{caption}</a>
                      ) : (
                        <span className="text-xs font-medium" style={{ color: "#191F28" }}>{caption}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-1.5 py-0.5 rounded font-semibold"
                        style={{ background: p.media_type === "VIDEO" || p.media_type === "REELS" ? "rgba(99,102,241,0.1)" : "rgba(225,48,108,0.1)",
                                 color: p.media_type === "VIDEO" || p.media_type === "REELS" ? "#6366F1" : "#E1306C" }}>
                        {p.media_type === "VIDEO" ? "영상" : p.media_type === "CAROUSEL_ALBUM" ? "카루셀" : p.media_type === "REELS" ? "릴스" : "이미지"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#94A3B8" }}>{new Date(p.timestamp).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}</td>
                    <td className="px-4 py-3 text-xs font-bold" style={{ color: "#E1306C" }}>{likes.toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#475569" }}>{comments.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-bold" style={{ color: i === 0 ? "#E1306C" : "#475569" }}>
                        {i === 0 && <span className="mr-1 text-xs px-1 py-0.5 rounded" style={{ background: "rgba(225,48,108,0.1)", color: "#E1306C" }}>TOP</span>}
                        {eng}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 토큰 갱신 모달 */}
      {showSetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.4)" }}>
          <div className="rounded-2xl p-6 w-full max-w-md mx-4" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
            <h3 className="text-base font-bold mb-4" style={{ color: "#191F28" }}>토큰 갱신</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>Instagram 계정 ID</label>
                <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder={profile?.id ?? ""}
                  className="w-full px-3 py-2 text-sm rounded-xl outline-none border focus:border-[#E1306C]"
                  style={{ background: "#F8FAFC", borderColor: "#E9EBEF", color: "#191F28" }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "#64748B" }}>새 액세스 토큰</label>
                <textarea value={token} onChange={(e) => setToken(e.target.value)} rows={3} placeholder="EAAxxxxxx..."
                  className="w-full px-3 py-2 text-sm rounded-xl outline-none border resize-none focus:border-[#E1306C]"
                  style={{ background: "#F8FAFC", borderColor: "#E9EBEF", color: "#191F28" }} />
              </div>
              {saveError && <p className="text-xs" style={{ color: "#EF4444" }}>{saveError}</p>}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => { setShowSetup(false); setSaveError(""); }}
                className="px-4 py-2 rounded-xl text-sm font-semibold border"
                style={{ borderColor: "#E9EBEF", color: "#64748B" }}>취소</button>
              <button onClick={handleConnect} disabled={saving || !token || !userId}
                className="px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #E1306C, #833AB4)" }}>
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 블로그 탭 ────────────────────────────────────────────────
function BlogTab() {
  return (
    <div className="space-y-5">
      {/* KPI */}
      <div className="grid grid-cols-5 gap-4">
        {BLOG_KPI.map((k) => <KpiCard key={k.label} {...k} />)}
      </div>

      {/* 차트 2열 */}
      <div className="grid grid-cols-2 gap-5">
        {/* 방문자 추이 */}
        <div className="rounded-2xl p-5" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
          <h3 className="text-sm font-bold mb-4" style={{ color: "#191F28" }}>방문자 · 페이지뷰 추이</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={BLOG_MONTHLY}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: unknown, n: unknown) => [Number(v).toLocaleString(), n as string]} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="방문자"   stroke="#03C75A" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="페이지뷰" stroke="#6366F1" strokeWidth={2} strokeDasharray="4 2" dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 월별 발행 수 */}
        <div className="rounded-2xl p-5" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
          <h3 className="text-sm font-bold mb-4" style={{ color: "#191F28" }}>월별 발행 수</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={BLOG_MONTHLY}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: unknown) => [`${v}건`, "발행 수"]} />
              <Bar dataKey="발행" fill="#03C75A" radius={[4, 4, 0, 0]} maxBarSize={36} label={{ position: "top", fontSize: 11, fill: "#94A3B8" }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 게시물 목록 */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
        <div className="px-5 py-4" style={{ borderBottom: "1px solid #F1F5F9" }}>
          <h3 className="text-sm font-bold" style={{ color: "#191F28" }}>이번달 발행 포스팅</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "#F8FAFC" }}>
                {["포스팅 제목","발행일","방문자","페이지뷰","평균 체류","비고"].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold" style={{ color: "#64748B" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {BLOG_POSTS.map((p, i) => (
                <tr key={i} className="border-t" style={{ borderColor: "#F1F5F9" }}>
                  <td className="px-5 py-3.5 font-semibold text-xs" style={{ color: "#191F28" }}>
                    <div className="flex items-center gap-2">
                      {p.top && <span className="text-xs px-1.5 py-0.5 rounded font-bold shrink-0" style={{ background: "rgba(3,199,90,0.1)", color: "#03C75A" }}>인기</span>}
                      {p.title}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-xs" style={{ color: "#94A3B8" }}>{p.date}</td>
                  <td className="px-5 py-3.5 text-xs font-medium" style={{ color: "#03C75A" }}>{p.방문자.toLocaleString()}</td>
                  <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>{p.페이지뷰.toLocaleString()}</td>
                  <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>{p.체류}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 rounded-full" style={{ background: "#F1F5F9" }}>
                        <div className="h-1.5 rounded-full" style={{ width: `${Math.min(p.방문자 / 10, 100)}%`, background: "#03C75A" }} />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── 메인 페이지 ─────────────────────────────────────────────
export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("meta");
  const [monthIdx, setMonthIdx] = useState(5); // 6월

  const activeTab = TABS.find((t) => t.key === tab)!;

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "#191F28" }}>마케팅 리포트</h1>
          <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>메타광고 · 인스타그램 운영 · 블로그 발행 성과를 확인합니다.</p>
        </div>
        {/* 월 선택 */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl" style={{ background: "#F8FAFC", border: "1px solid #E9EBEF" }}>
          <button onClick={() => setMonthIdx((m) => Math.max(0, m - 1))} disabled={monthIdx === 0}
            className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white transition-colors disabled:opacity-30">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span className="text-sm font-bold min-w-[40px] text-center" style={{ color: "#191F28" }}>{MONTHS[monthIdx]}</span>
          <button onClick={() => setMonthIdx((m) => Math.min(5, m + 1))} disabled={monthIdx === 5}
            className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white transition-colors disabled:opacity-30">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-2">
        {TABS.map((t) => {
          const isActive = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: isActive ? t.color : "#F8FAFC",
                color:      isActive ? "#fff"   : "#64748B",
                border:     isActive ? `1px solid ${t.color}` : "1px solid #E9EBEF",
                boxShadow:  isActive ? `0 4px 12px ${t.color}40` : "none",
              }}>
              <span style={{ color: isActive ? "#fff" : t.color }}>{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 구분선 */}
      <div className="flex items-center gap-3 px-5 py-3 rounded-2xl"
        style={{ background: `${activeTab.color}08`, border: `1px solid ${activeTab.color}25` }}>
        <span style={{ color: activeTab.color }}>{activeTab.icon}</span>
        <span className="text-sm font-bold" style={{ color: activeTab.color }}>{activeTab.label}</span>
        <span className="text-xs" style={{ color: "#94A3B8" }}>2026년 {MONTHS[monthIdx]} 기준</span>
        <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-semibold"
          style={{ background: `${activeTab.color}15`, color: activeTab.color }}>
          샘플 데이터
        </span>
      </div>

      {/* 탭 콘텐츠 */}
      {tab === "meta"      && <MetaTab />}
      {tab === "instagram" && <InstagramTab />}
      {tab === "blog"      && <BlogTab />}
    </div>
  );
}
