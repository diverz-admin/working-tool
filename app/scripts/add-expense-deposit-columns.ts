import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`
    ALTER TABLE internal_expense_requests
    ADD COLUMN IF NOT EXISTS deposit_bank     TEXT,
    ADD COLUMN IF NOT EXISTS deposit_holder   TEXT,
    ADD COLUMN IF NOT EXISTS deposit_account  TEXT,
    ADD COLUMN IF NOT EXISTS deposit_deadline TEXT;
  `);
  console.log("deposit columns added to internal_expense_requests");
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
