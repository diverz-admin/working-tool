"use client";

// 첨부파일을 Supabase Storage(비공개 버킷)에 브라우저에서 직접 업로드하고,
// 저장된 경로를 서명 URL로 변환해 미리보기/다운로드에 사용한다.
//
// - 업로드 본문이 우리 API(/api 라우트, Vercel 함수 4.5MB 한도)를 거치지 않으므로
//   큰 PDF도 안정적으로 저장된다.
// - DB에는 base64 대신 스토리지 "경로"만 저장한다. (예: "meeting-notes/uuid.pdf")
// - 기존 데이터(data:… base64, http(s) URL)는 그대로 하위호환한다.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export const ATTACHMENT_BUCKET = "attachments";

/** data:… 또는 http(s) URL 등 즉시 렌더 가능한 레거시 값인가 */
export function isDirectSrc(value: string | null | undefined): boolean {
  return !!value && (value.startsWith("data:") || value.startsWith("http://") || value.startsWith("https://"));
}

/** 저장 값이 PDF인지 판별 (레거시 data: / 스토리지 경로 / 파일명 모두 대응) */
export function isPdfValue(value: string | null | undefined, name?: string | null): boolean {
  if (!value) return false;
  if (value.startsWith("data:")) return value.startsWith("data:application/pdf");
  const s = (name || value).toLowerCase();
  return s.endsWith(".pdf");
}

/** 저장 값이 이미지인지 판별 */
export function isImageValue(value: string | null | undefined, name?: string | null): boolean {
  if (!value) return false;
  if (value.startsWith("data:")) return value.startsWith("data:image/");
  const s = (name || value).toLowerCase();
  return /\.(png|jpe?g|webp|gif|bmp|svg)$/.test(s);
}

function extFromName(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

/**
 * 파일을 스토리지에 업로드하고 저장용 경로를 반환한다.
 * @param folder 버킷 내 하위 폴더 (예: "meeting-notes", "clients")
 * @throws 업로드 실패 시 Error (한글 메시지)
 */
export async function uploadAttachment(file: File, folder: string): Promise<string> {
  const supabase = createClient();
  const ext = extFromName(file.name);
  const rand = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.round(Math.random() * 1e9)}`);
  const path = `${folder}/${rand}${ext ? "." + ext : ""}`;

  const { error } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) {
    const msg = error.message || "";
    if (/exceeded the maximum allowed size|Payload too large|too large/i.test(msg)) {
      throw new Error("파일이 너무 큽니다. 최대 50MB까지 업로드할 수 있습니다.");
    }
    if (/mime type|not supported/i.test(msg)) {
      throw new Error("지원하지 않는 파일 형식입니다. (PDF·이미지만 가능)");
    }
    throw new Error(`업로드 실패: ${msg}`);
  }
  return path;
}

/** 저장된 스토리지 경로를 삭제한다. 레거시(data:/http) 값은 무시. best-effort. */
export async function removeAttachment(value: string | null | undefined): Promise<void> {
  if (!value || isDirectSrc(value)) return;
  try {
    const supabase = createClient();
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([value]);
  } catch {
    /* best-effort: 실패해도 무시 */
  }
}

// 서명 URL 캐시 (경로 → { url, 만료시각 })
const signedCache = new Map<string, { url: string; exp: number }>();
const SIGNED_TTL_MS = 60 * 60 * 1000; // 1시간

/**
 * 저장 값을 렌더 가능한 src로 변환한다.
 * - data:/http(s) 레거시 값은 그대로 반환
 * - 스토리지 경로는 서명 URL로 변환 (1시간 유효, 메모리 캐시)
 */
export async function resolveFileSrc(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  if (isDirectSrc(value)) return value;

  const now = Date.now();
  const cached = signedCache.get(value);
  if (cached && cached.exp > now + 60_000) return cached.url;

  const supabase = createClient();
  const { data, error } = await supabase.storage.from(ATTACHMENT_BUCKET).createSignedUrl(value, 3600);
  if (error || !data?.signedUrl) return null;
  signedCache.set(value, { url: data.signedUrl, exp: now + SIGNED_TTL_MS });
  return data.signedUrl;
}

/**
 * React 훅: 저장 값(경로/레거시)을 렌더 가능한 src로 비동기 변환.
 * 레거시 값은 즉시 반환, 스토리지 경로는 서명 URL이 준비되면 갱신.
 */
export function useFileSrc(value: string | null | undefined): string | null {
  const [src, setSrc] = useState<string | null>(() => (isDirectSrc(value) ? (value as string) : null));

  useEffect(() => {
    let alive = true;
    /* eslint-disable react-hooks/set-state-in-effect -- 외부(스토리지) 값과 동기화하는 필수 setState */
    if (!value) { setSrc(null); return; }
    if (isDirectSrc(value)) { setSrc(value); return; }
    setSrc(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    resolveFileSrc(value).then((u) => { if (alive) setSrc(u); });
    return () => { alive = false; };
  }, [value]);

  return src;
}
