import { db } from "@/db";
import { products } from "@/db/schema";
import { resolveVendorBankAccount, type AccountCandidate } from "@/lib/vendor-account";

/** 상품관리 계좌 목록 — 조회 실패는 빈 목록으로 삼켜 결재 화면 자체가 깨지지 않게 한다 */
async function accountCatalog(): Promise<AccountCandidate[]> {
  try {
    return await db
      .select({ name: products.name, vendor: products.vendor, vendorBankAccount: products.vendorBankAccount })
      .from(products);
  } catch {
    return [];
  }
}

/** 요청 한 건의 계좌를 상품관리에서 찾아본다 (요청 생성 시 스냅샷용) */
export async function lookupVendorBankAccount(
  productName: string | null | undefined,
  vendor: string | null | undefined,
): Promise<string | null> {
  return resolveVendorBankAccount(productName, vendor, await accountCatalog());
}

/** 계좌 스냅샷이 비어 있는 요청을 상품관리의 현재 등록 계좌로 채운다.
 *  상품관리에 계좌를 나중에 등록해도 이미 올라간 요청에 바로 반영되도록 조회 시점에 보정한다. */
export async function fillVendorBankAccounts<
  T extends { productName: string | null; vendor: string | null; vendorBankAccount: string | null },
>(rows: T[]): Promise<T[]> {
  if (!rows.some((r) => !(r.vendorBankAccount ?? "").trim())) return rows;
  const catalog = await accountCatalog();
  if (!catalog.length) return rows;
  return rows.map((r) =>
    (r.vendorBankAccount ?? "").trim()
      ? r
      : { ...r, vendorBankAccount: resolveVendorBankAccount(r.productName, r.vendor, catalog) },
  );
}
