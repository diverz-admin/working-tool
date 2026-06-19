"use client";

import { useState } from "react";

type Status = "대기" | "승인" | "반려";
type LeaveType = "연차" | "반차" | "병가" | "기타";

interface LeaveItem {
  id: string;
  title: string;
  leaveType: LeaveType;
  requester: string;
  startDate: string;
  endDate?: string;
  requestedAt: string;
  status: Status;
  rejectReason?: string;
  note?: string;
}

const SAMPLE: LeaveItem[] = [
  { id: "1", title: "연차 휴가 신청 (6/25~6/26)", leaveType: "연차", requester: "양지훈", startDate: "2026-06-25", endDate: "2026-06-26", requestedAt: "2026-06-18", status: "대기" },
  { id: "2", title: "반차 신청 (6/20 오후)", leaveType: "반차", requester: "조하늘", startDate: "2026-06-20", requestedAt: "2026-06-17", status: "대기", note: "개인 사정으로 조기 퇴근 필요합니다." },
  { id: "3", title: "연차 휴가 신청 (6/10~6/11)", leaveType: "연차", requester: "이서연", startDate: "2026-06-10", endDate: "2026-06-11", requestedAt: "2026-05-27", status: "승인" },
  { id: "4", title: "병가 신청 (5/29)", leaveType: "병가", requester: "박준혁", startDate: "2026-05-29", requestedAt: "2026-05-28", status: "반려", rejectReason: "팀 일정 조율 필요" },
];

const STATUS_STYLE: Record<Status, { bg: string; color: string; border: string }> = {
  대기: { bg: "rgba(234,179,8,0.1)",  color: "#CA8A04", border: "rgba(234,179,8,0.25)" },
  승인: { bg: "rgba(16,185,129,0.1)", color: "#059669", border: "rgba(16,185,129,0.25)" },
  반려: { bg: "rgba(239,68,68,0.1)",  color: "#DC2626", border: "rgba(239,68,68,0.25)" },
};

const LEAVE_TYPE_STYLE: Record<LeaveType, { bg: string; color: string }> = {
  연차: { bg: "rgba(139,92,246,0.1)", color: "#8B5CF6" },
  반차: { bg: "rgba(99,102,241,0.1)", color: "#6366F1" },
  병가: { bg: "rgba(249,115,22,0.1)", color: "#F97316" },
  기타: { bg: "rgba(148,163,184,0.1)", color: "#64748B" },
};

function RejectModal({ onClose, onConfirm }: {
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    onConfirm(reason.trim());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(25,31,40,0.45)" }} onClick={onClose}>
      <div className="rounded-2xl w-full max-w-sm mx-4 overflow-hidden" style={{ background: "#fff", boxShadow: "0 20px 60px rgba(22,31,51,0.18)" }} onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4" style={{ borderBottom: "1px solid #F1F5F9" }}>
          <h2 className="text-sm font-bold" style={{ color: "#191F28" }}>반려 사유 입력</h2>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="반려 사유를 입력하세요"
            rows={4}
            required
            autoFocus
            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
            style={{ background: "#F8FAFC", border: "1px solid #E9EBEF", color: "#191F28" }}
          />
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold hover:opacity-80"
              style={{ background: "#F1F5F9", color: "#64748B" }}>취소</button>
            <button type="submit" disabled={!reason.trim()}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              style={{ background: "#EF4444" }}>반려</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DetailModal({ item, onClose, onAction }: {
  item: LeaveItem;
  onClose: () => void;
  onAction: (id: string, status: Status, reason?: string) => void;
}) {
  const [showReject, setShowReject] = useState(false);
  const ss = STATUS_STYLE[item.status];
  const lt = LEAVE_TYPE_STYLE[item.leaveType];
  const period = item.endDate && item.endDate !== item.startDate
    ? `${item.startDate} ~ ${item.endDate}`
    : item.startDate;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(25,31,40,0.45)" }} onClick={onClose}>
        <div className="rounded-2xl w-full max-w-md mx-4 overflow-hidden" style={{ background: "#fff", boxShadow: "0 20px 60px rgba(22,31,51,0.18)" }} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #F1F5F9" }}>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: lt.bg, color: lt.color }}>{item.leaveType}</span>
              <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: ss.bg, color: ss.color, border: `1px solid ${ss.border}` }}>
                {item.status}
              </span>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <div className="px-6 py-5 space-y-4">
            <h3 className="text-base font-bold" style={{ color: "#191F28" }}>{item.title}</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs mb-1" style={{ color: "#94A3B8" }}>요청자</p>
                <p className="font-semibold" style={{ color: "#191F28" }}>{item.requester}</p>
              </div>
              <div>
                <p className="text-xs mb-1" style={{ color: "#94A3B8" }}>요청일</p>
                <p className="font-medium" style={{ color: "#191F28" }}>{item.requestedAt}</p>
              </div>
              <div>
                <p className="text-xs mb-1" style={{ color: "#94A3B8" }}>휴가기간</p>
                <p className="font-medium" style={{ color: "#191F28" }}>{period}</p>
              </div>
            </div>
            {item.note && (
              <div className="px-4 py-3 rounded-xl text-sm whitespace-pre-wrap" style={{ background: "#F8FAFC", color: "#475569" }}>
                {item.note}
              </div>
            )}
            {item.rejectReason && (
              <div className="px-4 py-3 rounded-xl text-sm" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)", color: "#DC2626" }}>
                <span className="font-semibold">반려 사유: </span>{item.rejectReason}
              </div>
            )}
          </div>

          {item.status === "대기" && (
            <div className="flex gap-2 px-6 py-4" style={{ borderTop: "1px solid #F1F5F9" }}>
              <button onClick={() => setShowReject(true)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90"
                style={{ background: "rgba(239,68,68,0.1)", color: "#DC2626" }}>반려</button>
              <button onClick={() => onAction(item.id, "승인")}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90"
                style={{ background: "#8B5CF6" }}>승인</button>
            </div>
          )}
        </div>
      </div>

      {showReject && (
        <RejectModal
          onClose={() => setShowReject(false)}
          onConfirm={(reason) => { onAction(item.id, "반려", reason); setShowReject(false); }}
        />
      )}
    </>
  );
}

export default function LeaveConfirmPage() {
  const [items, setItems]         = useState<LeaveItem[]>(SAMPLE);
  const [filterStatus, setStatus] = useState<Status | "전체">("대기");
  const [selected, setSelected]   = useState<LeaveItem | null>(null);

  const counts = {
    전체: items.length,
    대기: items.filter((i) => i.status === "대기").length,
    승인: items.filter((i) => i.status === "승인").length,
    반려: items.filter((i) => i.status === "반려").length,
  };

  const filtered = filterStatus === "전체" ? items : items.filter((i) => i.status === filterStatus);

  function handleAction(id: string, status: Status, rejectReason?: string) {
    setItems((p) => p.map((i) => i.id === id ? { ...i, status, rejectReason: rejectReason ?? i.rejectReason } : i));
    setSelected(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "#191F28" }}>휴가 결재확인</h1>
          <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>휴가·반차 결재 요청을 검토하고 승인 또는 반려합니다. 대기 {counts["대기"]}건</p>
        </div>
      </div>

      <div className="flex items-center gap-1 p-0.5 rounded-xl self-start" style={{ background: "#F1F5F9" }}>
        {(["대기", "승인", "반려", "전체"] as const).map((s) => {
          const isActive = filterStatus === s;
          const style = s !== "전체" ? STATUS_STYLE[s] : null;
          return (
            <button key={s} onClick={() => setStatus(s)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: isActive ? "#fff" : "transparent",
                color: isActive ? (style?.color ?? "#191F28") : "#94A3B8",
                boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}>
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
              {["구분", "제목", "요청자", "휴가기간", "요청일", "상태", ""].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-xs font-semibold whitespace-nowrap" style={{ color: "#64748B" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="py-16 text-center text-sm" style={{ color: "#94A3B8" }}>
                {filterStatus === "대기" ? "검토 대기 중인 요청이 없습니다." : "요청 내역이 없습니다."}
              </td></tr>
            ) : filtered.map((item) => {
              const ss = STATUS_STYLE[item.status];
              const lt = LEAVE_TYPE_STYLE[item.leaveType];
              const period = item.endDate && item.endDate !== item.startDate
                ? `${item.startDate} ~ ${item.endDate}`
                : item.startDate;
              return (
                <tr key={item.id}
                  className="border-t cursor-pointer group"
                  style={{ borderColor: "#F1F5F9" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.03)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                  onClick={() => setSelected(item)}>
                  <td className="px-5 py-3.5">
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: lt.bg, color: lt.color }}>{item.leaveType}</span>
                  </td>
                  <td className="px-5 py-3.5 font-semibold text-xs" style={{ color: "#191F28" }}>{item.title}</td>
                  <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>{item.requester}</td>
                  <td className="px-5 py-3.5 text-xs whitespace-nowrap" style={{ color: "#475569" }}>{period}</td>
                  <td className="px-5 py-3.5 text-xs" style={{ color: "#94A3B8" }}>{item.requestedAt}</td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: ss.bg, color: ss.color, border: `1px solid ${ss.border}` }}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-3 py-3.5">
                    {item.status === "대기" && (
                      <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); setSelected(item); }}
                          className="text-xs font-semibold px-3 py-1 rounded-lg text-white"
                          style={{ background: "#8B5CF6" }}>검토</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <DetailModal
          item={selected}
          onClose={() => setSelected(null)}
          onAction={handleAction}
        />
      )}
    </div>
  );
}
