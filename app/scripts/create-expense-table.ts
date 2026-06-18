import { db } from "../src/db/index.ts";
import { sql } from "drizzle-orm";

async function run() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS internal_expense_requests (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title         TEXT NOT NULL,
      assigned_team TEXT,
      requester     TEXT NOT NULL,
      requested_at  DATE NOT NULL,
      amount        INTEGER,
      content       TEXT,
      attachments   TEXT,
      status        TEXT NOT NULL DEFAULT '대기',
      reject_reason TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log("internal_expense_requests table created OK");
  process.exit(0);
}
run().catch((e) => { console.error(e); process.exit(1); });
