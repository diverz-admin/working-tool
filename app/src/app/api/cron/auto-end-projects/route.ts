import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectGroups } from "@/db/schema";
import { and, eq, lt, gte, ne, isNotNull, inArray, sql } from "drizzle-orm";

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
    // 날짜 컬럼(date)은 시간대 개념이 없다. 서버(Vercel)는 UTC 로 도니까 로컬 달력 값을 쓰면
    // 00~09시 KST 구간에서 하루가 어긋난다. 한국 기준 달력 값을 그대로 포맷한다.
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });

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

    // 반대 방향도 맞춰준다. 종료 처리는 자동인데 되돌리는 경로가 없어서, 종료된 캠페인의 기간을
    // 연장해도 계속 "종료" 로 남아 있었다. 종료일이 아직 남은 캠페인은 다시 진행중으로 되돌린다.
    const reopenedProjects = await db
      .update(projects)
      .set({ status: "진행", updatedAt: sql`now()` })
      .where(
        and(
          eq(projects.status, "종료"),
          isNotNull(projects.endDate),
          gte(projects.endDate, today)
        )
      )
      .returning({ id: projects.id, campaignName: projects.campaignName, projectGroupId: projects.projectGroupId });

    // 진행중 캠페인이 생긴 그룹은 그룹도 다시 열어야 목록의 진행중 탭에 나타난다.
    const reopenGroupIds = [...new Set(reopenedProjects.map(p => p.projectGroupId).filter((v): v is string => Boolean(v)))];

    let reopenedGroups: { id: string; name: string }[] = [];
    if (reopenGroupIds.length > 0) {
      reopenedGroups = await db
        .update(projectGroups)
        .set({ status: "진행", updatedAt: new Date() })
        .where(and(inArray(projectGroups.id, reopenGroupIds), eq(projectGroups.status, "종료")))
        .returning({ id: projectGroups.id, name: projectGroups.name });
    }

    return NextResponse.json({
      today,
      updated: endedProjects.length,
      projects: endedProjects.map(p => ({ id: p.id, campaignName: p.campaignName })),
      updatedGroups: endedGroups.length,
      groups: endedGroups,
      reopened: reopenedProjects.length,
      reopenedProjects: reopenedProjects.map(p => ({ id: p.id, campaignName: p.campaignName })),
      reopenedGroups: reopenedGroups.length,
      reopenedGroupList: reopenedGroups,
    });
  } catch (err) {
    console.error("[auto-end-projects]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
