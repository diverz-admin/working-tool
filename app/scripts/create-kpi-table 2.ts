import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS kpi_targets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      team TEXT NOT NULL,
      target INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log("kpi_targets table created");
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
