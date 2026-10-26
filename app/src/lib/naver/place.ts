const SEARCH_URL = "https://search.naver.com/search.naver";

function decodeNaverName(raw: string): string {
  // \\uXXXX 이스케이프 디코딩
  const unescaped = raw.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
  // HTML 태그 제거 (<mark>, </mark> 등)
  return unescaped.replace(/<[^>]+>/g, "").trim();
}

/** `start`가 가리키는 `{`부터 짝이 맞는 `}`까지 잘라 JSON으로 읽는다. 문자열 안의 괄호는 세지 않는다. */
function readJsonObject(text: string, start: number): unknown {
  let depth = 0;
  let inStr = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

type ApolloEntry = { __typename?: string; id?: unknown; name?: unknown };

/**
 * 검색 결과 플레이스 목록(광고 제외)을 화면 순서대로 꺼낸다.
 *
 * 페이지에 박힌 Apollo 상태(__APOLLO_STATE__)를 JSON으로 읽고, ROOT_QUERY 안에서
 * `items: [{__ref}]` 꼴 목록 중 업체(숫자 id + 이름)로 이뤄진 가장 긴 것을 고른다.
 * 그 배열 순서가 곧 검색 노출 순서다.
 *
 * 예전에는 "가장 큰 <script>"를 정규식으로 훑었는데 두 가지로 깨졌다.
 *   - 2026-10-16 무렵부터 이와 무관한 더 큰 스크립트가 붙어 목록을 0건으로 읽었다(이후 순위가 전부 "순위 밖").
 *   - 업체 항목 안에 쿠폰 같은 중첩 객체가 있으면 id와 name 사이에 `}`가 끼어 그 업체를 건너뛰었다.
 * 광고(…AdSummary, adBusinesses)는 순위가 아니므로 뺀다. 업종마다 항목 타입이 달라(일반·음식점·숙박)
 * 타입 이름을 고정하지 않는다.
 */
function extractPlaceList(html: string): { id: string; name: string }[] {
  let best: { id: string; name: string }[] = [];

  const collect = (node: unknown, state: Record<string, ApolloEntry>) => {
    if (Array.isArray(node)) { node.forEach(n => collect(n, state)); return; }
    if (!node || typeof node !== "object") return;
    const items = (node as { items?: unknown }).items;
    if (Array.isArray(items) && items.length && items.every(x => x && typeof x === "object" && "__ref" in x)) {
      const list = items
        .map(x => state[(x as { __ref: string }).__ref])
        .filter((e): e is ApolloEntry =>
          !!e && typeof e.id === "string" && /^\d{5,}$/.test(e.id) && typeof e.name === "string"
          && !(e.__typename ?? "").includes("Ad"))
        .map(e => ({ id: e.id as string, name: decodeNaverName(e.name as string) }));
      if (list.length > best.length) best = list;
    }
    Object.values(node).forEach(v => collect(v, state));
  };

  for (const m of html.matchAll(/__APOLLO_STATE__\s*=\s*/g)) {
    const state = readJsonObject(html, m.index + m[0].length) as Record<string, ApolloEntry> | null;
    const root = state?.ROOT_QUERY as Record<string, unknown> | undefined;
    if (!state || !root) continue;
    for (const [key, value] of Object.entries(root)) {
      if (key.startsWith("adBusinesses")) continue;
      collect(value, state);
    }
  }
  return best;
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
