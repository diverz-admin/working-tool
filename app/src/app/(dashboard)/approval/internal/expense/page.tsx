"use client";

import { useState } from "react";

type Status = "대기" | "승인" | "반려";

interface ExpenseItem {
  id: string;
  title: string;
  requester: string;
  amount?: string;
  requestedAt: string;
  status: Status;
  note?: string;
}

const SAMPLE: ExpenseItem[] = [
  { id: "1", title: "외부 교육비 지원 요청 — 디지털 마케팅 과정", requester: "김민준", amount: "₩150,000", requestedAt: "2026-05-28", status: "대기", note: "네이버 광고 공식 교육 수강료" },
  { id: "3", title: "출장 경비 정산 — 부산 클라이언트 미팅", requester: "박지훈", amount: "₩92,000", requestedAt: "2026-05-26", status: "대기" },
];

const STATUS_STYLE: Record<Status, { bg: string; color: string; border: string }> = {
  대기: { bg: "rgba(234,179,8,0.1)",  color: "#CA8A04", border: "rgba(234,179,8,0.25)" },
  승인: { bg: "rgba(16,185,129,0.1)", color: "#059669", border: "rgba(16,185,129,0.25)" },
  반려: { bg: "rgba(239,68,68,0.1)",  color: "#DC2626", border: "rgba(239,68,68,0.25)" },
};

export default function ExpensePage() {
  const [items, setItems]       = useState<ExpenseItem[]>(SAMPLE);
  const [filterStatus, setStatus] = useState<Status | "전체">("전체");
  const [selected, setSelected] = useState<ExpenseItem | null>(null);

  const counts = {
    전체: items.length,
    대기: items.filter((i) => i.status === "대기").length,
    승인: items.filter((i) => i.status === "승인").length,
    반려: items.filter((i) => i.status === "반려").length,
  };

  const filtered = filterStatus === "전체" ? items : items.filter((i) => i.status === filterStatus);

  function updateStatus(id: string, status: Status) {
    setItems((p) => p.map((i) => i.id === id ? { ...i, status } : i));
    setSelected(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "#191F28" }}>내부지출</h1>
          <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>내부 지출 결재 요청을 관리합니다. 대기 {counts["대기"]}건</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90"
          style={{ background: "#3182F6" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          결재 요청
        </button>
      </div>

      <div className="flex items-center gap-1 p-0.5 rounded-xl self-start" style={{ background: "#F1F5F9" }}>
        {(["전체", "대기", "승인", "반려"] as const).map((s) => {
          const isActive = filterStatus === s;
          const style = s !== "전체" ? STATUS_STYLE[s] : null;
          return (
            <button key={s} onClick={() => setStatus(s)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
              style={{ background: isActive ? "#fff" : "transparent", color: isActive ? (style?.color ?? "#191F28") : "#94A3B8", boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}>
              {s}
              <span className="font-bold" style={{ color: isActive ? (style?.color ?? "#191F28") : "#CBD5E1" }}>
                {counts[s as keyof typeof counts] ?? items.length}
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: "1px solid #E9EBEF" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "#F8FAFC" }}>
              {["제목", "요청자", "금액", "요청일", "상태", ""].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-xs font-semibold whitespace-nowrap" style={{ color: "#64748B" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => {
              const ss = STATUS_STYLE[item.status];
              return (
                <tr key={item.id}
                  className="border-t cursor-pointer group"
                  style={{ borderColor: "#F1F5F9" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(49,130,246,0.03)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                  onClick={() => setSelected(item)}
                >
                  <td className="px-5 py-3.5 font-semibold text-xs" style={{ color: "#191F28" }}>{item.title}</td>
                  <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>{item.requester}</td>
                  <td className="px-5 py-3.5 text-xs font-medium" style={{ color: item.amount ? "#3182F6" : "#CBD5E1" }}>{item.amount ?? "—"}</td>
                  <td className="px-5 py-3.5 text-xs" style={{ color: "#94A3B8" }}>{item.requestedAt}</td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: ss.bg, color: ss.color, border: `1px solid ${ss.border}` }}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-3 py-3.5">
                    {item.status === "대기" && (
                      <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); updateStatus(item.id, "반려"); }}
                          className="text-xs font-semibold px-2 py-1 rounded-lg"
                          style={{ background: "rgba(239,68,68,0.1)", color: "#DC2626" }}>반려</button>
                        <button onClick={(e) => { e.stopPropagation(); updateStatus(item.id, "승인"); }}
                          className="text-xs font-semibold px-2 py-1 rounded-lg text-white"
                          style={{ background: "#3182F6" }}>승인</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="py-16 text-center text-sm" style={{ color: "#94A3B8" }}>요청 내역이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(25,31,40,0.45)" }} onClick={() => setSelected(null)}>
          <div className="rounded-2xl w-full max-w-md mx-4 overflow-hidden" style={{ background: "#fff", boxShadow: "0 20px 60px rgba(22,31,51,0.18)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #F1F5F9" }}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(49,130,246,0.1)", color: "#3182F6" }}>내부지출</span>
                <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
                  style={{ background: STATUS_STYLE[selected.status].bg, color: STATUS_STYLE[selected.status].color, border: `1px solid ${STATUS_STYLE[selected.status].border}` }}>
                  {selected.status}
                </span>
              </div>
              <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <h3 className="text-base font-bold" style={{ color: "#191F28" }}>{selected.title}</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs mb-1" style={{ color: "#94A3B8" }}>요청자</p><p className="font-semibold" style={{ color: "#191F28" }}>{selected.requester}</p></div>
                <div><p className="text-xs mb-1" style={{ color: "#94A3B8" }}>요청일</p><p className="font-medium" style={{ color: "#191F28" }}>{selected.requestedAt}</p></div>
                {selected.amount && (
                  <div><p className="text-xs mb-1" style={{ color: "#94A3B8" }}>금액</p><p className="font-bold" style={{ color: "#3182F6" }}>{selected.amount}</p></div>
                )}
              </div>
              {selected.note && (
                <div className="px-4 py-3 rounded-xl text-sm" style={{ background: "#F8FAFC", color: "#475569" }}>{selected.note}</div>
              )}
            </div>
            {selected.status === "대기" && (
              <div className="flex gap-2 px-6 py-4" style={{ borderTop: "1px solid #F1F5F9" }}>
                <button onClick={() => updateStatus(selected.id, "반려")}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90"
                  style={{ background: "rgba(239,68,68,0.1)", color: "#DC2626" }}>반려</button>
                <button onClick={() => updateStatus(selected.id, "승인")}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90"
                  style={{ background: "#3182F6" }}>승인</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
