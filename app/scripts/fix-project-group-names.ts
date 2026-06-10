import { db } from "../src/db";
import { projectGroups, clients } from "../src/db/schema";
import { eq, isNotNull, sql } from "drizzle-orm";

async function main() {
  // clientId가 연결된 프로젝트 그룹의 이름을 clients.companyName으로 업데이트
  const rows = await db
    .select({ id: projectGroups.id, name: projectGroups.name, companyName: clients.companyName })
    .from(projectGroups)
    .innerJoin(clients, eq(clients.id, projectGroups.clientId))
    .where(isNotNull(projectGroups.clientId));

  console.log("업데이트 대상:");
  for (const r of rows) {
    console.log(`  ${r.name} → ${r.companyName}`);
  }

  await db.execute(sql`
    UPDATE project_groups
    SET name = clients.company_name
    FROM clients
    WHERE project_groups.client_id = clients.id
  `);

  console.log(`\n${rows.length}개 프로젝트 그룹 이름 업데이트 완료`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
