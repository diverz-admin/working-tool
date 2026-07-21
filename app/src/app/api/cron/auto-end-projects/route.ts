import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectGroups } from "@/db/schema";
import { and, eq, lt, ne, isNotNull, inArray, sql } from "drizzle-orm";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // CRON_SECRET 이 비어 있으면 기대값이 "Bearer undefined" 가 되어 모든 호출이 401 로 막힌다.
  // 조용히 401 을 내면 크론이 도는데도 아무 일이 안 일어나는 것처럼 보이므로, 원인을 분명히 알린다.
  if (!process.env.CRON_SECRET) {
    console.error("[auto-end-projects] CRON_SECRET 이 설정되지 않아 실행할 수 없습니다");
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 날짜 컬럼(date)은 시간대 개념이 없다. toISOString() 을 쓰면 KST 가 UTC 로 당겨져
    // 실행 시각에 따라 하루가 어긋나므로 로컬 달력 값을 그대로 포맷한다.
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const endedProjects = await db
      .update(projects)
      .set({ status: "종료", updatedAt: sql`now()` })
      .where(
        and(
          eq(projects.status, "진행"),
          isNotNull(projects.endDate),
          lt(projects.endDate, today)
        )
      )
      .returning({ id: projects.id, campaignName: projects.campaignName, projectGroupId: projects.projectGroupId });

    // 캠페인만 종료시키면 프로젝트 목록의 전체/진행중/종료 탭은 그룹 status 로 거르기 때문에
    // 모든 캠페인이 끝난 그룹도 계속 "진행중" 으로 남는다. 그룹도 함께 닫는다.
    const touchedGroupIds = [...new Set(endedProjects.map(p => p.projectGroupId).filter((v): v is string => Boolean(v)))];

    let endedGroups: { id: string; name: string }[] = [];
    if (touchedGroupIds.length > 0) {
      // 아직 종료되지 않은 캠페인이 남아 있는 그룹은 제외
      const stillActive = await db
        .selectDistinct({ groupId: projects.projectGroupId })
        .from(projects)
        .where(and(
          inArray(projects.projectGroupId, touchedGroupIds),
          ne(projects.status, "종료"),
        ));
      const activeIds = new Set(stillActive.map(r => r.groupId));
      const closable = touchedGroupIds.filter(id => !activeIds.has(id));

      if (closable.length > 0) {
        endedGroups = await db
          .update(projectGroups)
          .set({ status: "종료", updatedAt: new Date() })
          .where(and(inArray(projectGroups.id, closable), ne(projectGroups.status, "종료")))
          .returning({ id: projectGroups.id, name: projectGroups.name });
      }
    }

    return NextResponse.json({
      today,
      updated: endedProjects.length,
      projects: endedProjects.map(p => ({ id: p.id, campaignName: p.campaignName })),
      updatedGroups: endedGroups.length,
      groups: endedGroups,
    });
  } catch (err) {
    console.error("[auto-end-projects]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
