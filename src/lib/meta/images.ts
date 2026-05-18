import { getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import type { Locale } from "@/i18n/locales";
import { getFreshAccessToken } from "./client";

/**
 * Upload an image to Meta's ad library. Returns the `hash` used in
 * creative `image_hash` fields.
 *
 * Meta /adimages endpoint accepts multipart form-data; we proxy from
 * the browser → our server → Meta to keep the access token server-side.
 */

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png"]);

export type UploadResult = {
  hash: string;
  width: number;
  height: number;
};

export async function uploadAdImage(params: {
  tenantId: string;
  metaAccountId: string;
  file: File;
  /** Locale used to format user-facing validation errors. */
  locale: Locale;
}): Promise<UploadResult> {
  const t = await getTranslations({ locale: params.locale, namespace: "api.metaImages" });
  if (!ALLOWED_TYPES.has(params.file.type)) {
    throw new Error(t("mustBeJpgPng"));
  }
  if (params.file.size > MAX_IMAGE_BYTES) {
    throw new Error(
      t("tooLarge", { sizeMb: (params.file.size / 1024 / 1024).toFixed(1) }),
    );
  }

  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId: params.tenantId },
    select: {
      id: true,
      tenantId: true,
      accessTokenEncrypted: true,
      tokenExpiresAt: true,
      metaUserId: true,
      metaUserName: true,
      status: true,
      connectedAt: true,
      lastSyncedAt: true,
    },
  });
  if (!connection) throw new Error("No Meta connection");
  const accessToken = await getFreshAccessToken(connection);

  const version = process.env.META_GRAPH_VERSION ?? "v23.0";
  const url = new URL(
    `https://graph.facebook.com/${version}/${params.metaAccountId}/adimages`,
  );
  url.searchParams.set("access_token", accessToken);

  // Meta expects multipart with a `filename` key per file. Pass through
  // the browser's File directly — Node's fetch supports FormData with
  // Blob entries since 18+.
  const form = new FormData();
  form.append("filename", params.file, params.file.name || "image.jpg");

  const res = await fetch(url.toString(), {
    method: "POST",
    body: form,
  });
  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = null; }

  if (!res.ok) {
    const err = json as { error?: { error_user_msg?: string; message?: string } } | null;
    const msg = err?.error?.error_user_msg ?? err?.error?.message ?? `Upload failed (${res.status})`;
    throw new Error(msg);
  }

  // Response shape: { images: { "<filename>": { hash, width, height, url, ... } } }
  const data = (json as { images?: Record<string, { hash: string; width: number; height: number }> }).images;
  if (!data) throw new Error("Meta returned no images");
  const entry = Object.values(data)[0];
  if (!entry?.hash) throw new Error("Meta returned no image hash");

  return { hash: entry.hash, width: entry.width, height: entry.height };
}
