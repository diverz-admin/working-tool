const SEARCH_URL = "https://search.naver.com/search.naver";

function decodeNaverName(raw: string): string {
  // \\uXXXX 이스케이프 디코딩
  const unescaped = raw.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
  // HTML 태그 제거 (<mark>, </mark> 등)
  return unescaped.replace(/<[^>]+>/g, "").trim();
}

function extractPlaceList(html: string): { id: string; name: string }[] {
  // 가장 큰 <script> 블록에 place 데이터가 포함됨
  const scriptBlocks = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(
    (m) => m[1]
  );
  const bigScript = scriptBlocks
    .filter((s) => s.length > 10000)
    .sort((a, b) => b.length - a.length)[0] ?? "";

  const results: { id: string; name: string }[] = [];
  const pattern = /"id":"(\d{7,})"[^}]{0,400}?"name":"(.*?)"/g;
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(bigScript)) !== null) {
    const name = decodeNaverName(m[2]);
    if (name) results.push({ id: m[1], name });
  }

  return results;
}

function matchesTarget(
  item: { id: string; name: string },
  targetType: string,
  targetValue: string
): boolean {
  const val = targetValue.toLowerCase().trim();
  switch (targetType) {
    case "place_name":
      return item.name.toLowerCase().includes(val);
    case "place_id":
      return item.id === targetValue.trim();
    default:
      return false;
  }
}

export async function findPlaceRank(
  keyword: string,
  targetType: string,
  targetValue: string
): Promise<{ rank: number | null; totalResults: number; notFound?: boolean }> {
  const url = `${SEARCH_URL}?query=${encodeURIComponent(keyword)}&where=place`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "ko-KR,ko;q=0.9",
      "Referer": "https://search.naver.com/",
    },
  });

  if (!res.ok) {
    throw new Error(`네이버 검색 오류 ${res.status}`);
  }

  const html = await res.text();
  const places = extractPlaceList(html);
  const totalResults = places.length;

  for (let i = 0; i < places.length; i++) {
    if (matchesTarget(places[i], targetType, targetValue)) {
      return { rank: i + 1, totalResults };
    }
  }

  return { rank: null, totalResults, notFound: true };
}
