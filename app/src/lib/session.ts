// Edge Runtime + Node.js 양쪽에서 동작하는 Web Crypto 기반 세션 유틸리티

export const SESSION_COOKIE = "dw_session";
const SECRET = process.env.SESSION_SECRET ?? "dev-secret-change-in-production";

export interface SessionPayload {
  id: string;
  name: string;
  role: string;
  exp: number;
}

function toBase64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let bin = "";
  bytes.forEach(b => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(str: string): Uint8Array {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

async function getKey(usage: "sign" | "verify") {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

export async function createSession(
  payload: Omit<SessionPayload, "exp">,
): Promise<string> {
  const data: SessionPayload = {
    ...payload,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const encoded = toBase64url(new TextEncoder().encode(JSON.stringify(data)));
  const key = await getKey("sign");
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded));
  return `${encoded}.${toBase64url(sig)}`;
}

// Decode WITHOUT signature check — use only behind middleware that already verified.
export function decodeSession(token: string): SessionPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  try {
    const payload = JSON.parse(
      new TextDecoder().decode(fromBase64url(token.slice(0, dot))),
    ) as SessionPayload;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const encoded = token.slice(0, dot);
  const sigStr  = token.slice(dot + 1);
  try {
    const key   = await getKey("verify");
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64url(sigStr).buffer as ArrayBuffer,
      new TextEncoder().encode(encoded),
    );
    if (!valid) return null;
    const payload = JSON.parse(
      new TextDecoder().decode(fromBase64url(encoded)),
    ) as SessionPayload;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
