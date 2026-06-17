import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL!;

if (!DATABASE_URL) {
  console.error("Error: DATABASE_URL env is missing");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });

async function run() {
  console.log("Starting direct index migration...");

  const queries = [
    // 1. 컬럼 추가 (존재하지 않는 경우에만 추가)
    `ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "biz_reg_file_url" text;`,
    `ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "biz_reg_file_name" text;`,
    `ALTER TABLE "project_costs" ADD COLUMN IF NOT EXISTS "setting_date" date;`,
    `ALTER TABLE "project_revenues" ADD COLUMN IF NOT EXISTS "section_label" text;`,
    `ALTER TABLE "project_revenues" ADD COLUMN IF NOT EXISTS "setting_date" date;`,
    `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "kpi_supply" integer;`,
    `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "kpi_tax" integer;`,
    `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "work_phone" text;`,

    // 2. 인덱스 추가 (존재하지 않는 경우에만 추가)
    `CREATE INDEX IF NOT EXISTS "user_todos_user_id_idx" ON "user_todos" USING btree ("user_id");`,
    `CREATE INDEX IF NOT EXISTS "work_daily_logs_revenue_id_idx" ON "work_daily_logs" USING btree ("revenue_id");`,
    `CREATE INDEX IF NOT EXISTS "keyword_rankings_tracker_id_idx" ON "keyword_rankings" USING btree ("tracker_id");`,
    `CREATE INDEX IF NOT EXISTS "keyword_trackers_client_id_idx" ON "keyword_trackers" USING btree ("client_id");`,
    `CREATE INDEX IF NOT EXISTS "keyword_trackers_project_id_idx" ON "keyword_trackers" USING btree ("project_id");`,
    `CREATE INDEX IF NOT EXISTS "project_costs_project_id_idx" ON "project_costs" USING btree ("project_id");`,
    `CREATE INDEX IF NOT EXISTS "project_costs_is_approved_idx" ON "project_costs" USING btree ("is_approved");`,
    `CREATE INDEX IF NOT EXISTS "project_groups_client_id_idx" ON "project_groups" USING btree ("client_id");`,
    `CREATE INDEX IF NOT EXISTS "project_groups_status_idx" ON "project_groups" USING btree ("status");`,
    `CREATE INDEX IF NOT EXISTS "project_revenues_project_id_idx" ON "project_revenues" USING btree ("project_id");`,
    `CREATE INDEX IF NOT EXISTS "project_revenues_payment_date_idx" ON "project_revenues" USING btree ("payment_date");`,
    `CREATE INDEX IF NOT EXISTS "project_revenues_invoice_date_idx" ON "project_revenues" USING btree ("invoice_date");`,
    `CREATE INDEX IF NOT EXISTS "projects_project_group_id_idx" ON "projects" USING btree ("project_group_id");`,
    `CREATE INDEX IF NOT EXISTS "projects_client_id_idx" ON "projects" USING btree ("client_id");`,
    `CREATE INDEX IF NOT EXISTS "projects_status_idx" ON "projects" USING btree ("status");`,
    `CREATE INDEX IF NOT EXISTS "projects_start_date_idx" ON "projects" USING btree ("start_date");`
  ];

  for (const q of queries) {
    try {
      console.log(`Executing: ${q}`);
      await sql.unsafe(q);
      console.log("Success");
    } catch (err) {
      console.error(`Failed executing: ${q}\nReason:`, err);
    }
  }

  console.log("Index migration completed!");
  await sql.end();
}

run().catch((err) => {
  console.error("Migration script crashed:", err);
  process.exit(1);
});
