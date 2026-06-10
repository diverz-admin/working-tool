const BASE_URL = "https://openapi.naver.com/v1/search/shop.json";
const MAX_RANK_CHECK = 300; // 최대 300위까지 추적

interface NaverShoppingItem {
  title: string;        // HTML 태그 포함
  link: string;
  image: string;
  lprice: string;
  hprice: string;
  mallName: string;
  productId: string;
  productType: string;
  brand: string;
  maker: string;
  category1: string;
  category2: string;
  category3: string;
  category4: string;
}

interface NaverShoppingResponse {
  total: number;
  start: number;
  display: number;
  items: NaverShoppingItem[];
}

function stripHtml(str: string) {
  return str.replace(/<[^>]+>/g, "");
}

function extractStoreProductId(link: string): string | null {
  const m = link.match(/\/products\/(\d+)/);
  return m ? m[1] : null;
}

function matchesTarget(item: NaverShoppingItem, targetType: string, targetValue: string): boolean {
  const val = targetValue.trim();
  switch (targetType) {
    case "mall":
      return item.mallName.toLowerCase().includes(val.toLowerCase());
    case "product_id":
      return item.productId === val;
    case "product_name":
      return stripHtml(item.title).toLowerCase().includes(val.toLowerCase());
    case "nstore_id": {
      // 스마트스토어 상품 ID — link URL의 /products/{id} 로 매칭
      const storeId = extractStoreProductId(item.link);
      return storeId === val;
    }
    default:
      return false;
  }
}

export async function findShoppingRank(
  keyword: string,
  targetType: string,
  targetValue: string
): Promise<{ rank: number | null; totalResults: number }> {
  const clientId     = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수가 없습니다.");
  }

  const DISPLAY = 100;
  let totalResults = 0;

  for (let start = 1; start <= MAX_RANK_CHECK; start += DISPLAY) {
    const url = `${BASE_URL}?query=${encodeURIComponent(keyword)}&display=${DISPLAY}&start=${start}&sort=sim`;
    const res = await fetch(url, {
      headers: {
        "X-Naver-Client-Id":     clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Naver API 오류 ${res.status}: ${text}`);
    }

    const data: NaverShoppingResponse = await res.json();
    if (start === 1) totalResults = data.total;

    for (let i = 0; i < data.items.length; i++) {
      if (matchesTarget(data.items[i], targetType, targetValue)) {
        return { rank: start + i, totalResults };
      }
    }

    // 결과가 DISPLAY보다 적으면 더 이상 페이지가 없음
    if (data.items.length < DISPLAY) break;
  }

  return { rank: null, totalResults };
}
