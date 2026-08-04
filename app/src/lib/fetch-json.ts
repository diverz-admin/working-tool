/**
 * JSON API 호출 헬퍼.
 *
 * `fetch(...).then(r => r.json())` 은 응답 status를 보지 않기 때문에,
 * 500 응답 본문({ error: ... })까지 그대로 파싱되어 목록이 빈 배열이 되고
 * 화면에는 "데이터 없음"으로 표시된다. 서버 오류가 정상 데이터로 둔갑하는 셈이라
 * 매출·매입처럼 금액을 다루는 화면에서는 치명적이다.
 *
 * 이 함수는 실패를 반드시 예외로 만들어, 호출부가 빈 데이터 대신 오류를 보여주도록 강제한다.
 */
/** 세션이 끊겼을 때 보여줄 안내. 새 탭 로그인만으로 쿠키가 복구되므로 입력 내용을 잃지 않는다. */
export const SESSION_EXPIRED_MESSAGE =
  "로그인이 만료되었습니다. 새 탭에서 다시 로그인한 뒤 저장을 다시 눌러주세요.";

/**
 * 저장 실패 응답을 사용자에게 보여줄 문구로 바꾼다.
 *
 * 이전에는 status와 무관하게 "저장에 실패했습니다."만 띄웠다. 세션 만료(401)로 저장이
 * 막힌 경우에도 원인을 알 수 없어, 사용자는 같은 저장을 반복하다 입력을 잃었다.
 * 401은 재로그인을 안내하고, 나머지는 서버 메시지와 상태 코드를 함께 노출한다.
 */
export async function saveErrorMessage(res: Response, fallback = "저장에 실패했습니다."): Promise<string> {
  if (res.status === 401) return SESSION_EXPIRED_MESSAGE;
  let detail = "";
  try {
    const body = await res.json();
    if (body?.error) detail = String(body.error).slice(0, 150);
  } catch { /* 본문이 JSON이 아니면 무시 */ }
  return detail || `${fallback} (HTTP ${res.status})`;
}

export async function fetchJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    throw new Error("서버에 연결하지 못했습니다. 네트워크 상태를 확인해주세요.");
  }

  if (!res.ok) {
    if (res.status === 401) throw new Error(SESSION_EXPIRED_MESSAGE);
    let detail = "";
    try {
      const body = await res.json();
      if (body?.error) detail = ` — ${String(body.error).slice(0, 150)}`;
    } catch { /* 본문이 JSON이 아니면 무시 */ }
    throw new Error(`데이터를 불러오지 못했습니다 (HTTP ${res.status})${detail}`);
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new Error("서버 응답 형식이 올바르지 않습니다");
  }
}
