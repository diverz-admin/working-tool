/**
 * 프로젝트 그룹(광고주 단위) 마이그레이션 스크립트
 * - project_groups 테이블 생성
 * - projects에 project_group_id 컬럼 추가
 * - 기존 projects를 clientId 기준으로 그룹화하여 project_groups 생성
 * 실행: npm run db:migrate-groups
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql, eq, isNull } from "drizzle-orm";
import { projectGroups, projects } from "../src/db/schema";

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

async function run() {
  console.log("▶ project_groups 테이블 생성...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS project_groups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
      assigned_team TEXT,
      assigned_person TEXT,
      status TEXT NOT NULL DEFAULT '진행',
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  console.log("▶ projects에 project_group_id 컬럼 추가...");
  await db.execute(sql`
    ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS project_group_id UUID REFERENCES project_groups(id) ON DELETE CASCADE
  `);

  // 이미 그룹이 있는 경우 스킵
  const existing = await db.select().from(projectGroups);
  if (existing.length > 0) {
    console.log(`✓ 이미 ${existing.length}개 project_groups 존재. 마이그레이션 스킵.`);
    await client.end();
    return;
  }

  console.log("▶ 기존 프로젝트(캠페인) 조회...");
  const allProjects = await db.select().from(projects);
  console.log(`   ${allProjects.length}개 캠페인 발견`);

  // clientId 기준으로 그룹화
  const byClient = new Map<string, typeof allProjects>();
  const noClient: typeof allProjects = [];

  for (const p of allProjects) {
    if (p.clientId) {
      const arr = byClient.get(p.clientId) ?? [];
      arr.push(p);
      byClient.set(p.clientId, arr);
    } else {
      noClient.push(p);
    }
  }

  let created = 0;

  // clientId가 있는 캠페인들 → 같은 clientId끼리 하나의 project_group으로
  for (const [clientId, projs] of byClient) {
    const representative = projs[0];
    const [group] = await db.insert(projectGroups).values({
      name: representative.advertiser || "미지정 프로젝트",
      clientId,
      assignedTeam: representative.assignedTeam,
      assignedPerson: representative.assignedPerson,
      status: projs.some((p) => p.status === "진행") ? "진행" : "종료",
      notes: null,
    }).returning();

    for (const p of projs) {
      await db.update(projects).set({ projectGroupId: group.id }).where(eq(projects.id, p.id));
    }
    created++;
    console.log(`   ✓ 그룹 생성: "${group.name}" (캠페인 ${projs.length}개)`);
  }

  // clientId 없는 캠페인 → advertiser 기준으로 그룹화
  const byAdvertiser = new Map<string, typeof allProjects>();
  for (const p of noClient) {
    const key = p.advertiser?.trim() || `__individual_${p.id}`;
    const arr = byAdvertiser.get(key) ?? [];
    arr.push(p);
    byAdvertiser.set(key, arr);
  }

  for (const [, projs] of byAdvertiser) {
    const representative = projs[0];
    const [group] = await db.insert(projectGroups).values({
      name: representative.advertiser || representative.campaignName || "미지정 프로젝트",
      clientId: null,
      assignedTeam: representative.assignedTeam,
      assignedPerson: representative.assignedPerson,
      status: projs.some((p) => p.status === "진행") ? "진행" : "종료",
      notes: null,
    }).returning();

    for (const p of projs) {
      await db.update(projects).set({ projectGroupId: group.id }).where(eq(projects.id, p.id));
    }
    created++;
    console.log(`   ✓ 그룹 생성: "${group.name}" (캠페인 ${projs.length}개)`);
  }

  console.log(`\n✅ 마이그레이션 완료: project_groups ${created}개 생성`);
  await client.end();
}

run().catch((e) => { console.error(e); process.exit(1); });
