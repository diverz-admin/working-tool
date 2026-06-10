// Node.js crypto 기반 비밀번호 해시 (API route 전용, Edge Runtime 사용 불가)
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf  = (await scryptAsync(plain, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [hash, salt] = stored.split(".");
  if (!hash || !salt) return false;
  const buf      = (await scryptAsync(plain, salt, 64)) as Buffer;
  const hashBuf  = Buffer.from(hash, "hex");
  if (buf.length !== hashBuf.length) return false;
  return timingSafeEqual(buf, hashBuf);
}
