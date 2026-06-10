/**
 * Google Sheets → Supabase client_accounts 테이블 import 스크립트
 * 실행: node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-accounts-from-sheets.ts
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { clients, clientAccounts } from "../src/db/schema";

const SHEET_ID = "1droYZUQ5ZLbo8Vn4P5GX7EG086-LWguGljGoBFA2bfE";
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

// 수동 매핑: 시트 상호명 → DB 고객사명 (자동 매칭이 불가한 경우)
const MANUAL_MAP: Record<string, string> = {
  "송도 광천 지압 안마원":         "광천지압안마원",
  "안산 마음약손 마사지":           "마음약손 마사지",
  "인계동 힐링타임마사지":          "힐링타임마사지",
  "인천 엘리트자동차공업사":        "엘리트자동차공업사 인천",
  "창원 본테라피앤마사지":          "본테라피앤마사지 창원상남점",
  "살롱드하루 3호점":              "살롱드하루 서면3호점",
  "도곡동 공인중개사 사무소":       "도곡동 부동산",
  "씰리 경기광주점":              "씰리침대 경기광주점",
  "씰리침대 기흥리빙파워센터점":    "씰리침대 기흥점",
  "모노커스 용산 아이파크몰점":     "모노커스 용산점",
  "강변테크노마트 아시안데코":      "아시안데코",
  "더쏀패러글라이딩":             "더쎈패러글라이딩",
  "미사 중국 약손마사지":         "태전동 미사중국 테라피",
  "우다다댕산 애견호텔":          "우다다댕산 애견호텔&애견유치원 대전점",
};

function normalize(name: string): string {
  return name.replace(/\s/g, "").toLowerCase();
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

  console.log("📥 Google Sheets에서 계정 데이터 불러오는 중...");
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`Sheets fetch 실패: ${res.status}`);

  const text = await res.text();
  const rows = parseCsv(text);

  const dataRows = rows.slice(1).filter((r) => {
    const no = r[0];
    const name = r[1];
    return name && name.length > 0 && no && !isNaN(Number(no));
  });

  console.log(`✅ 시트에서 ${dataRows.length}개 계정 행 발견`);

  const allClients = await db.select({ id: clients.id, companyName: clients.companyName }).from(clients);
  console.log(`📋 DB에 등록된 고객사 ${allClients.length}개\n`);

  // 정확 매핑 맵 + 공백제거 정규화 맵
  const exactMap = new Map(allClients.map((c) => [c.companyName.trim(), c.id]));
  const normalMap = new Map(allClients.map((c) => [normalize(c.companyName), c.id]));

  const toInsert: Array<{ clientId: string; platform: string; username: string; password: string }> = [];
  const matched: Array<{ sheet: string; db: string; username: string }> = [];
  const unmatched: string[] = [];

  for (const r of dataRows) {
    const sheetName = r[1].trim();
    const username = r[2].trim();
    const password = r[3].trim();

    let clientId: string | undefined;
    let matchedDbName = "";

    // 1순위: 정확 매칭
    if (exactMap.has(sheetName)) {
      clientId = exactMap.get(sheetName);
      matchedDbName = sheetName;
    }
    // 2순위: 공백 제거 정규화 매칭
    else if (normalMap.has(normalize(sheetName))) {
      clientId = normalMap.get(normalize(sheetName));
      matchedDbName = allClients.find((c) => normalize(c.companyName) === normalize(sheetName))?.companyName ?? "";
    }
    // 3순위: 수동 매핑
    else if (MANUAL_MAP[sheetName]) {
      const mappedName = MANUAL_MAP[sheetName];
      clientId = exactMap.get(mappedName);
      matchedDbName = mappedName;
    }

    if (!clientId) {
      unmatched.push(sheetName);
      continue;
    }

    toInsert.push({ clientId, platform: "네이버 플레이스", username, password });
    matched.push({ sheet: sheetName, db: matchedDbName, username });
  }

  console.log(`✅ 매칭 성공 (${matched.length}개):`);
  matched.forEach((m) =>
    m.sheet === m.db
      ? console.log(`   ✓ ${m.sheet} → ${m.username}`)
      : console.log(`   ✓ [시트] ${m.sheet} → [DB] ${m.db} → ${m.username}`)
  );

  if (unmatched.length > 0) {
    console.log(`\n⚠️  DB 매칭 실패 — 건너뜀 (${unmatched.length}개):`);
    unmatched.forEach((n) => console.log(`   - ${n}`));
  }

  if (toInsert.length === 0) {
    console.log("\n❌ 삽입할 데이터가 없습니다.");
    await sql.end();
    return;
  }

  console.log(`\n💾 ${toInsert.length}개 계정 정보 저장 중...`);
  await db.insert(clientAccounts).values(toInsert);
  console.log(`🎉 완료! ${toInsert.length}개 계정 정보가 Supabase에 저장됐습니다.`);

  await sql.end();
}

main().catch((e) => {
  console.error("❌ 오류:", e.message);
  process.exit(1);
});
