import { db } from "../src/db";
import { sql } from "drizzle-orm";

// 회의록 개편 — 팀별 기록·참석자 칸, 업체 관리 상태, 캠페인 연장 상태, 팀 할 일 캘린더
async function main() {
  await db.execute(sql`ALTER TABLE report_meetings ADD COLUMN IF NOT EXISTS team_notes JSONB`);
  await db.execute(sql`ALTER TABLE report_meetings ADD COLUMN IF NOT EXISTS attendees JSONB`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS client_care (
      client_id UUID PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
      satisfaction TEXT,
      note TEXT NOT NULL DEFAULT '',
      checked_at DATE,
      updated_by TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS campaign_renewals (
      project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      updated_by TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS team_tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team TEXT NOT NULL,
      task_date DATE NOT NULL,
      title TEXT NOT NULL,
      assignee TEXT,
      done BOOLEAN NOT NULL DEFAULT FALSE,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS team_tasks_team_date_idx ON team_tasks (team, task_date)`);

  const cols = await db.execute(sql`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE (table_name = 'report_meetings' AND column_name IN ('team_notes', 'attendees'))
       OR table_name IN ('client_care', 'campaign_renewals', 'team_tasks')
    ORDER BY table_name, ordinal_position
  `);
  console.log(cols.map((r: Record<string, unknown>) => `${r.table_name}.${r.column_name}`).join("\n"));
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
