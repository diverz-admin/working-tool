const BASE_URL = "https://openapi.naver.com/v1/search/local.json";
const DISPLAY = 5; // 네이버 로컬 검색 API 최대값 (페이징 불가, start=1 고정)

interface NaverLocalItem {
  title: string;       // HTML 태그 포함
  link: string;        // 업체 페이지 URL (place ID 포함)
  category: string;
  address: string;
  roadAddress: string;
  telephone: string;
  mapx: string;
  mapy: string;
}

interface NaverLocalResponse {
  total: number;
  start: number;
  display: number;
  items: NaverLocalItem[];
}

function stripHtml(str: string) {
  return str.replace(/<[^>]+>/g, "");
}

function extractPlaceId(link: string): string | null {
  const m = link.match(/\/(\d+)(?:[?#]|$)/);
  return m ? m[1] : null;
}

function matchesTarget(item: NaverLocalItem, targetType: string, targetValue: string): boolean {
  const val = targetValue.toLowerCase().trim();
  switch (targetType) {
    case "place_name":
      return stripHtml(item.title).toLowerCase().includes(val);
    case "place_id": {
      const id = extractPlaceId(item.link);
      return id === targetValue.trim();
    }
    default:
      return false;
  }
}

export async function findPlaceRank(
  keyword: string,
  targetType: string,
  targetValue: string
): Promise<{ rank: number | null; totalResults: number; notFound?: boolean }> {
  const clientId     = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수가 없습니다.");
  }

  // 네이버 로컬 검색 API는 start=1 고정, display 최대 5개
  const url = `${BASE_URL}?query=${encodeURIComponent(keyword)}&display=${DISPLAY}&start=1`;
  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id":     clientId,
      "X-Naver-Client-Secret": clientSecret,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Naver Place API 오류 ${res.status}: ${text}`);
  }

  const data: NaverLocalResponse = await res.json();
  const totalResults = data.total;

  for (let i = 0; i < data.items.length; i++) {
    if (matchesTarget(data.items[i], targetType, targetValue)) {
      return { rank: i + 1, totalResults };
    }
  }

  // 5개 결과 내에 없음 (API 한계상 최대 5개만 조회 가능)
  return { rank: null, totalResults, notFound: true };
}
