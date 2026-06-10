/**
 * Google Sheets → Supabase clients 테이블 import 스크립트
 * 실행: npm run db:import
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { clients } from "../src/db/schema";

const SHEET_ID = "19nsWQ3hoycd6ffdt61yV7ri7P0OUQFl87cDd0mXA6Qs";
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

function parseWon(value: string): number | undefined {
  if (!value) return undefined;
  const num = parseInt(value.replace(/[₩,\s]/g, ""), 10);
  return isNaN(num) ? undefined : num;
}

function parseStatus(raw: string): "리드" | "진행" | "종료" {
  if (raw === "진행중") return "진행";
  if (raw === "종료") return "종료";
  return "리드";
}

function parseProducts(raw: string): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function parseDate(raw: string): string | undefined {
  if (!raw) return undefined;
  // "2024.01.15" → "2024-01-15" 형식으로 변환
  const normalized = raw.replace(/\./g, "-");
  return normalized || undefined;
}

function parseCsv(text: string): string[][] {
  return text.split("\n").map((r) => {
    const cells: string[] = [];
    let current = "";
    let inQuote = false;
    for (let i = 0; i < r.length; i++) {
      const ch = r[i];
      if (ch === '"') {
        inQuote = !inQuote;
      } else if (ch === "," && !inQuote) {
        cells.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  });
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(sql);

  console.log("📥 Google Sheets에서 데이터 불러오는 중...");
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`Sheets fetch 실패: ${res.status}`);

  const text = await res.text();
  const rows = parseCsv(text);

  // rows[0] = 제목행, rows[1] = 헤더행, rows[2+] = 데이터
  const dataRows = rows.slice(2).filter((r) => {
    const num = r[0];
    const name = r[3];
    return name && name.length > 0 && num !== "예시" && !isNaN(Number(num));
  });

  console.log(`✅ ${dataRows.length}개 행 발견`);

  const records = dataRows.map((r) => ({
    status:      parseStatus(r[2]),
    companyName: r[3] || "이름없음",
    industry:    r[4] || null,
    contactName: r[5] || null,
    contactPhone:r[6] || null,
    products:    parseProducts(r[7]),
    monthlyAvg:  parseWon(r[8]) ?? null,
    inboundDate: parseDate(r[1]) ?? null,
    inboundRoute:r[9] || null,
    endReason:   r[10] || null,
    endDate:     parseDate(r[11]) ?? null,
  }));

  console.log("💾 Supabase에 저장 중...");
  await db.insert(clients).values(records);

  console.log(`🎉 완료! ${records.length}개 고객사 데이터가 Supabase에 저장됐습니다.`);
  console.log("\n저장된 데이터 샘플:");
  records.slice(0, 3).forEach((r) =>
    console.log(`  - [${r.status}] ${r.companyName} / ${r.contactName ?? "담당자 없음"}`)
  );

  await sql.end();
}

main().catch((e) => {
  console.error("❌ 오류:", e.message);
  process.exit(1);
});
