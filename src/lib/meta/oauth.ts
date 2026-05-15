import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { graphFetch } from "./graph-api";
import type { MetaTokenResponse, MetaUser } from "./types";

/**
 * Permissions requested at OAuth time. Keep in sync with Meta App Review.
 *
 * Note on `pages_manage_ads`: Meta rejects this scope for apps that
 * haven't explicitly enabled it via App Dashboard → Use Cases. For
 * boost-post creation we rely instead on `ads_management` +
 * `business_management` — the Page must be claimed by the same
 * Business Manager that owns the ad account, then the user's BM-level
 * permissions cover the page-post → ad linkage.
 */
export const META_SCOPES = [
  "ads_read",
  "ads_management",
  "business_management",
  "pages_read_engagement",
  "pages_show_list",
];

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export type OAuthStatePayload = {
  tenantId: string;
  userId: string;
  nonce: string;
  expiresAt: number;
};

function getStateSecret(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return Buffer.from(secret);
}

/** Build a signed `state` value to embed in the OAuth URL (CSRF protection). */
export function signOAuthState(payload: Omit<OAuthStatePayload, "nonce" | "expiresAt">): string {
  const full: OAuthStatePayload = {
    ...payload,
    nonce: randomBytes(8).toString("base64url"),
    expiresAt: Date.now() + STATE_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  const sig = createHmac("sha256", getStateSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** Verify a signed `state` value. Throws if invalid or expired. */
export function verifyOAuthState(state: string): OAuthStatePayload {
  const parts = state.split(".");
  if (parts.length !== 2) throw new Error("Invalid state format");
  const [body, sig] = parts;

  const expected = createHmac("sha256", getStateSecret()).update(body).digest();
  const provided = Buffer.from(sig, "base64url");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new Error("State signature mismatch");
  }

  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthStatePayload;
  if (Date.now() > payload.expiresAt) {
    throw new Error("State expired");
  }
  return payload;
}

/**
 * Build the OAuth URL the user is redirected to so they can authorize the
 * app on Facebook. Meta hosts the consent screen — we never see the user's
 * Facebook credentials.
 */
export function buildOAuthUrl(state: string): string {
  const appId = process.env.META_APP_ID;
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const version = process.env.META_GRAPH_VERSION ?? "v23.0";
  const configId = process.env.META_CONFIG_ID;
  if (!appId) throw new Error("META_APP_ID is not set");

  const url = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", `${appUrl}/api/meta/oauth/callback`);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  // Facebook Login for Business: configuration on Meta's side defines
  // which permissions + assets are requested, so we send config_id and
  // omit the scope parameter. Falls back to legacy scope-based OAuth
  // when META_CONFIG_ID is unset (useful for older Meta apps).
  if (configId) {
    url.searchParams.set("config_id", configId);
  } else {
    url.searchParams.set("scope", META_SCOPES.join(","));
  }
  return url.toString();
}

/** Exchange the `code` returned by Meta for a short-lived user access token. */
export async function exchangeCodeForToken(code: string): Promise<MetaTokenResponse> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  if (!appId || !appSecret) throw new Error("META_APP_ID/META_APP_SECRET not set");

  return graphFetch<MetaTokenResponse>("/oauth/access_token", {
    method: "GET",
    searchParams: {
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: `${appUrl}/api/meta/oauth/callback`,
      code,
    },
  });
}

/** Exchange the short-lived token for a long-lived (~60 day) user access token. */
export async function exchangeForLongLivedToken(shortToken: string): Promise<MetaTokenResponse> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw new Error("META_APP_ID/META_APP_SECRET not set");

  return graphFetch<MetaTokenResponse>("/oauth/access_token", {
    method: "GET",
    searchParams: {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortToken,
    },
  });
}

/** Fetch the Facebook user profile for the supplied access token. */
export async function fetchMetaUser(accessToken: string): Promise<MetaUser> {
  return graphFetch<MetaUser>("/me", {
    accessToken,
    searchParams: { fields: "id,name" },
  });
}
