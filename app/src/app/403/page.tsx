"use client";

import { useRouter } from "next/navigation";

export default function ForbiddenPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#F2F4F6" }}>
      <div className="text-center space-y-4">
        <div className="text-5xl font-black" style={{ color: "#E9EBEF" }}>403</div>
        <p className="text-base font-bold" style={{ color: "#191F28" }}>접근 권한이 없습니다</p>
        <p className="text-sm" style={{ color: "#94A3B8" }}>Manager 이상 권한이 필요한 페이지입니다.</p>
        <button
          onClick={() => router.back()}
          className="mt-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
          style={{ background: "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" }}
        >
          뒤로 가기
        </button>
      </div>
    </div>
  );
}
