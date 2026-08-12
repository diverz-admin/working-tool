/* 매입 입금계좌 해석 — 상품관리(products)에 등록된 계좌를 찾아준다.

   품명이 드롭다운이 아니라 직접 입력이 되면서, 매입 행의 품명이 상품관리의 품명과
   글자 단위로 어긋나는 경우가 생긴다(예: 상품은 "야무진리워드(신복1)", 행은 "야무진리워드").
   이름만으로 매칭하면 계좌가 멀쩡히 등록돼 있어도 결재 화면에 "미등록"으로 뜬다.

   좁은 단서부터 순서대로 시도하되, 다른 매입처의 계좌를 잘못 끌어오지 않도록
   "품명+매입처가 정확히 일치하는 상품이 있는데 그 상품에 계좌가 없다"면 거기서 멈춘다. */

export interface AccountCandidate {
  name: string;
  vendor: string | null;
  vendorBankAccount: string | null;
}

const norm = (v: string | null | undefined) => (v ?? "").trim();

/** "-", "—" 같은 자리표시자는 계좌가 아니라 빈 값으로 본다 */
const account = (v: string | null | undefined) => {
  const s = norm(v);
  return /^[-—–.]*$/.test(s) ? "" : s;
};

/** 계좌가 하나로 모아지면 그 값, 후보가 없거나 서로 다르면 null */
function soleAccount(rows: AccountCandidate[]): string | null {
  const accounts = [...new Set(rows.map((r) => account(r.vendorBankAccount)).filter(Boolean))];
  return accounts.length === 1 ? accounts[0] : null;
}

export function resolveVendorBankAccount(
  productName: string | null | undefined,
  vendor: string | null | undefined,
  products: AccountCandidate[],
): string | null {
  const pn = norm(productName);
  const vd = norm(vendor);
  if (!pn && !vd) return null;

  // 1) 품명 + 매입처 정확 일치 — 이 상품이 곧 정답이므로 계좌가 없으면 "미등록"이 맞다
  const exact = pn && vd ? products.filter((p) => norm(p.name) === pn && norm(p.vendor) === vd) : [];
  if (exact.length) return soleAccount(exact);

  // 2) 품명만 일치 — 한쪽 매입처가 비어 있을 때만. 매입처가 서로 다른 동명 상품의
  //    계좌를 끌어오면 엉뚱한 곳으로 입금될 수 있으므로 제외한다.
  const byName = pn
    ? products.filter((p) => norm(p.name) === pn && (!vd || !norm(p.vendor)))
    : [];
  if (byName.length) return soleAccount(byName);

  // 3) 품명이 상품관리와 다르게 적힌 경우(직접 입력) — 같은 매입처의 계좌가 하나로 모아질 때만
  const byVendor = vd ? products.filter((p) => norm(p.vendor) === vd) : [];
  return byVendor.length ? soleAccount(byVendor) : null;
}
