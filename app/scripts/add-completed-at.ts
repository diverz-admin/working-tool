import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`
    ALTER TABLE project_revenues
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
  `);
  console.log("completed_at column added to project_revenues");
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
