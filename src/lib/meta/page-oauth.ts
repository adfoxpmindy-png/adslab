/**
 * OAuth for the separate "AdsLab Page" Meta app (App ID 2010104606257244).
 * Distinct from src/lib/meta/oauth.ts which handles the ads-only app.
 *
 * Why the split: the AdsLab Marketing-API app can't add the
 * "Manage Page" use case. See memory/reference_meta_app_type_constraint.md.
 *
 * Env vars (separate from the ads app):
 *   META_PAGE_APP_ID
 *   META_PAGE_APP_SECRET
 *   META_PAGE_CONFIG_ID   (Facebook Login for Business configuration id)
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { graphFetch } from "./graph-api";
import type { MetaTokenResponse, MetaUser } from "./types";

export const PAGE_META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "pages_manage_engagement",
];

const STATE_TTL_MS = 10 * 60 * 1000;

export type PageOAuthStatePayload = {
  tenantId: string;
  userId: string;
  nonce: string;
  expiresAt: number;
  /** "page" discriminator so a state token from the ads OAuth can't be reused here. */
  kind: "page";
};

function getStateSecret(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return Buffer.from(secret);
}

export function signPageOAuthState(
  payload: Omit<PageOAuthStatePayload, "nonce" | "expiresAt" | "kind">,
): string {
  const full: PageOAuthStatePayload = {
    ...payload,
    nonce: randomBytes(8).toString("base64url"),
    expiresAt: Date.now() + STATE_TTL_MS,
    kind: "page",
  };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  const sig = createHmac("sha256", getStateSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyPageOAuthState(state: string): PageOAuthStatePayload {
  const parts = state.split(".");
  if (parts.length !== 2) throw new Error("Invalid state format");
  const [body, sig] = parts;
  const expected = createHmac("sha256", getStateSecret()).update(body).digest();
  const provided = Buffer.from(sig, "base64url");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new Error("State signature mismatch");
  }
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PageOAuthStatePayload;
  if (Date.now() > payload.expiresAt) throw new Error("State expired");
  if (payload.kind !== "page") throw new Error("Wrong state kind");
  return payload;
}

export function buildPageOAuthUrl(state: string): string {
  const appId = process.env.META_PAGE_APP_ID;
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const version = process.env.META_GRAPH_VERSION ?? "v23.0";
  const configId = process.env.META_PAGE_CONFIG_ID;
  if (!appId) throw new Error("META_PAGE_APP_ID is not set");

  const url = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", `${appUrl}/api/meta/page-oauth/callback`);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  if (configId) {
    url.searchParams.set("config_id", configId);
  } else {
    url.searchParams.set("scope", PAGE_META_SCOPES.join(","));
  }
  return url.toString();
}

export async function exchangeCodeForPageToken(code: string): Promise<MetaTokenResponse> {
  const appId = process.env.META_PAGE_APP_ID;
  const appSecret = process.env.META_PAGE_APP_SECRET;
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  if (!appId || !appSecret) throw new Error("META_PAGE_APP_ID/META_PAGE_APP_SECRET not set");

  return graphFetch<MetaTokenResponse>("/oauth/access_token", {
    method: "GET",
    searchParams: {
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: `${appUrl}/api/meta/page-oauth/callback`,
      code,
    },
  });
}

export async function exchangeForLongLivedPageToken(
  shortToken: string,
): Promise<MetaTokenResponse> {
  const appId = process.env.META_PAGE_APP_ID;
  const appSecret = process.env.META_PAGE_APP_SECRET;
  if (!appId || !appSecret) throw new Error("META_PAGE_APP_ID/META_PAGE_APP_SECRET not set");

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

export async function fetchPageMetaUser(accessToken: string): Promise<MetaUser> {
  return graphFetch<MetaUser>("/me", {
    accessToken,
    searchParams: { fields: "id,name" },
  });
}
