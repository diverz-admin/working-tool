"use client";

import dynamic from "next/dynamic";

/**
 * 이 화면은 클라이언트 전용으로 렌더한다.
 *
 * ProjectsInner 는 useSearchParams() 를 쓰는데, 서버 HTML 을 만든 뒤 하드 내비게이션
 * (URL 직접 입력·새로고침)으로 진입하면 클라이언트에서 Suspense 경계가 계속 서스펜드된 채
 * 풀리지 않았다. 그 결과 하이드레이션에 실패한 SSR HTML 만 화면에 남아
 * "프로젝트 0개 · 데이터를 불러오는 중" 상태로 멈췄다(사이드바 링크로 이동하면 정상).
 * SSR 을 끄면 서버 HTML 자체가 없어 이 불일치가 생기지 않는다.
 * 어차피 데이터·상태가 전부 클라이언트에 있어 SSR 로 얻는 이득도 없다.
 */
const ProjectsInner = dynamic(() => import("./ProjectsInner"), {
  ssr: false,
  loading: () => (
    <div className="py-16 text-center text-sm" style={{ color: "#94A3B8" }}>
      데이터를 불러오는 중...
    </div>
  ),
});

export default function ProjectsPage() {
  return <ProjectsInner />;
}
