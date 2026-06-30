import postgres from "postgres";

// 결재확인 로드 및 손익/매출 통계 속도 개선용 인덱스 (멱등 — 여러 번 실행해도 안전)
const STATEMENTS = [
  // confirm_requests — 초기 로드 정렬 + 통계 EXISTS(project_id, row_key) + 상태 필터
  `CREATE INDEX IF NOT EXISTS confirm_requests_project_row_idx ON confirm_requests (project_id, row_key)`,
  `CREATE INDEX IF NOT EXISTS confirm_requests_status_idx     ON confirm_requests (status)`,
  `CREATE INDEX IF NOT EXISTS confirm_requests_created_at_idx ON confirm_requests (created_at)`,
  // payment_requests — 초기 로드 정렬 + 프로젝트/상태 조회
  `CREATE INDEX IF NOT EXISTS payment_requests_project_id_idx  ON payment_requests (project_id)`,
  `CREATE INDEX IF NOT EXISTS payment_requests_status_idx      ON payment_requests (status)`,
  `CREATE INDEX IF NOT EXISTS payment_requests_created_at_idx  ON payment_requests (created_at)`,
  // project_costs — 통장(purchase_date)/계산서(invoice_date) 기준 집계
  `CREATE INDEX IF NOT EXISTS project_costs_invoice_date_idx   ON project_costs (invoice_date)`,
  `CREATE INDEX IF NOT EXISTS project_costs_purchase_date_idx  ON project_costs (purchase_date)`,
];

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  for (const stmt of STATEMENTS) {
    process.stdout.write(`→ ${stmt}\n`);
    await sql.unsafe(stmt);
  }
  await sql.end();
  process.stdout.write("✅ 인덱스 적용 완료\n");
}

main().catch((e) => {
  console.error("❌ 실패:", e);
  process.exit(1);
});
