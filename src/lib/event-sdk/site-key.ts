import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * SDK site keys identify a (tenant, pixel) pair publicly without
 * revealing the underlying IDs. They appear in the install snippet
 * and in the URL the SDK fetches its config from.
 *
 * Format: <base32(payload)>.<base32(hmac10)>
 *
 *   payload = "<tenantId>:<pixelId>" base32-encoded
 *   hmac    = first 10 bytes of HMAC-SHA256(SDK_SECRET, payload)
 *
 * Why this shape:
 *   - Reversible: the server decodes tenant+pixel from the key
 *     directly — no extra DB lookup needed for the SDK's hot path
 *     (config fetched on every page view of every customer site).
 *   - Tamper-proof: HMAC tag rejects forged keys before we hit the DB.
 *   - Short enough to paste into a <script> tag readably (~50 chars).
 *
 * SDK_SECRET is required in env; rotating it invalidates every install
 * — only do that for compromise, with a re-key migration path.
 */

const SECRET_KEY = "SDK_SITE_KEY_SECRET";
const HMAC_SIZE = 10; // 80 bits — collision resistance plenty for this scope

function getSecret(): string {
  const s = process.env[SECRET_KEY] ?? process.env.SESSION_SECRET;
  if (!s) {
    throw new Error(`${SECRET_KEY} or SESSION_SECRET must be set`);
  }
  return s;
}

// RFC 4648 base32 (no padding) — URL-safe, case-insensitive friendly.
// We avoid base64url here because some embed contexts strip "-" / "_".
const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += B32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return out;
}

function base32Decode(str: string): Buffer {
  const cleaned = str.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of cleaned) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error("invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hmac(payload: string): Buffer {
  return createHmac("sha256", getSecret()).update(payload).digest().subarray(0, HMAC_SIZE);
}

export function generateSiteKey(tenantId: string, pixelId: string): string {
  if (!tenantId || !pixelId) throw new Error("tenantId + pixelId required");
  const payload = `${tenantId}:${pixelId}`;
  const payloadEncoded = base32Encode(Buffer.from(payload, "utf8"));
  const tagEncoded = base32Encode(hmac(payload));
  return `${payloadEncoded}.${tagEncoded}`;
}

export type DecodedSiteKey = { tenantId: string; pixelId: string };

/**
 * Verify + decode a siteKey. Returns null for any tamper / format issue
 * — callers should treat null as "not found" without leaking the reason.
 */
export function verifySiteKey(siteKey: string): DecodedSiteKey | null {
  if (!siteKey || typeof siteKey !== "string") return null;
  const parts = siteKey.split(".");
  if (parts.length !== 2) return null;

  let payloadBuf: Buffer;
  let tagBuf: Buffer;
  try {
    payloadBuf = base32Decode(parts[0]);
    tagBuf = base32Decode(parts[1]);
  } catch {
    return null;
  }
  if (tagBuf.length !== HMAC_SIZE) return null;

  const payload = payloadBuf.toString("utf8");
  const expectedTag = hmac(payload);
  if (expectedTag.length !== tagBuf.length) return null;
  if (!timingSafeEqual(expectedTag, tagBuf)) return null;

  const sep = payload.indexOf(":");
  if (sep < 0) return null;
  const tenantId = payload.slice(0, sep);
  const pixelId = payload.slice(sep + 1);
  if (!tenantId || !pixelId) return null;
  return { tenantId, pixelId };
}
