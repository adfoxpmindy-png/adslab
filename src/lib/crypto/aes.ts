import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption for sensitive values at rest (e.g. Meta access tokens).
 *
 * Key derivation:
 *   key = HKDF-SHA256(SESSION_SECRET, salt="adslab-meta-token-v1", info="")
 *
 * We derive a dedicated key per purpose rather than using SESSION_SECRET
 * directly so rotation of one secret doesn't compromise the other domain,
 * and so the same secret can support multiple encryption domains.
 *
 * Output format (single base64 string):
 *   [12 bytes IV] [16 bytes auth tag] [ciphertext]
 */

const ALGORITHM = "aes-256-gcm";
const KEY_SIZE = 32; // 256 bits
const IV_SIZE = 12; // GCM standard
const TAG_SIZE = 16; // GCM auth tag

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set in environment");
  }
  cachedKey = Buffer.from(
    hkdfSync("sha256", Buffer.from(secret), Buffer.from("adslab-meta-token-v1"), Buffer.alloc(0), KEY_SIZE),
  );
  return cachedKey;
}

export function encrypt(plaintext: string): string {
  if (!plaintext) throw new Error("encrypt: plaintext is empty");

  const iv = randomBytes(IV_SIZE);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Pack as [iv][tag][ciphertext] then base64.
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decrypt(encoded: string): string {
  if (!encoded) throw new Error("decrypt: input is empty");

  const buf = Buffer.from(encoded, "base64");
  if (buf.length < IV_SIZE + TAG_SIZE) {
    throw new Error("decrypt: ciphertext too short");
  }

  const iv = buf.subarray(0, IV_SIZE);
  const tag = buf.subarray(IV_SIZE, IV_SIZE + TAG_SIZE);
  const ciphertext = buf.subarray(IV_SIZE + TAG_SIZE);

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
