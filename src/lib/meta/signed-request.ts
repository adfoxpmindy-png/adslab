import { createHmac, timingSafeEqual } from "node:crypto";

export type SignedRequestPayload = {
  user_id: string;
  algorithm: string;
  issued_at: number;
  expires?: number;
};

/**
 * Decode and verify a Meta `signed_request` parameter using the app secret.
 * Used for the data deletion and deauthorization webhooks.
 *
 * Throws if the signature is invalid or the algorithm is unsupported.
 * See https://developers.facebook.com/docs/facebook-login/data-deletion-callback
 */
export function parseSignedRequest(signedRequest: string, appSecret: string): SignedRequestPayload {
  const parts = signedRequest.split(".");
  if (parts.length !== 2) {
    throw new Error("signed_request must have 2 parts");
  }
  const [sigEncoded, payloadEncoded] = parts;

  const expected = createHmac("sha256", appSecret).update(payloadEncoded).digest();
  const provided = Buffer.from(sigEncoded, "base64url");

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new Error("signed_request signature mismatch");
  }

  const payload = JSON.parse(Buffer.from(payloadEncoded, "base64url").toString("utf8"));

  if (payload.algorithm !== "HMAC-SHA256") {
    throw new Error(`unsupported algorithm: ${payload.algorithm}`);
  }
  if (!payload.user_id) {
    throw new Error("signed_request payload missing user_id");
  }

  return payload as SignedRequestPayload;
}
