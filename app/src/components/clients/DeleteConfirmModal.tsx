"use client";

interface Props {
  companyName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteConfirmModal({ companyName, onConfirm, onCancel }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(22,31,51,0.5)", backdropFilter: "blur(2px)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6"
        style={{ background: "#FFFFFF", boxShadow: "0 20px 60px rgba(22,31,51,0.2)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 아이콘 */}
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: "rgba(239,68,68,0.1)" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </div>

        {/* 텍스트 */}
        <h3 className="text-base font-bold text-center mb-2" style={{ color: "#191F28" }}>
          정말 삭제하시겠습니까?
        </h3>
        <p className="text-sm text-center mb-6" style={{ color: "#64748B" }}>
          <span className="font-semibold" style={{ color: "#191F28" }}>{companyName}</span> 고객사가
          영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
        </p>

        {/* 버튼 */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 text-sm font-medium rounded-xl border transition-colors hover:bg-slate-50"
            style={{ borderColor: "#E9EBEF", color: "#64748B" }}
          >
            아니오
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 text-sm font-semibold rounded-xl text-white transition-opacity hover:opacity-90"
            style={{ background: "#EF4444" }}
          >
            예, 삭제합니다
          </button>
        </div>
      </div>
    </div>
  );
}
