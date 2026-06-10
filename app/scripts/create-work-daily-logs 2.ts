import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS work_daily_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      revenue_id UUID NOT NULL REFERENCES project_revenues(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      qty INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log("work_daily_logs table created");
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
