/**
 * Compose + schedule organic page posts. Pattern proven by
 * scripts/schedule-fana-posts.ts on 2026-05-16; this module wraps that
 * Graph API flow with DB persistence + tenant-scoped Vercel Blob.
 *
 * Three Meta endpoints depending on media kind:
 *   - single photo  → /{PAGE_ID}/photos      with caption + scheduled_publish_time
 *   - album         → /{PAGE_ID}/photos×N (published=false) + /{PAGE_ID}/feed
 *                     with attached_media[] + scheduled_publish_time
 *   - single video  → /{PAGE_ID}/videos      with description + scheduled_publish_time
 */
import { put, del } from "@vercel/blob";
import { getTranslations } from "next-intl/server";

import { type Locale, FALLBACK_LOCALE } from "@/i18n/locales";
import { prisma } from "@/lib/prisma";
import { graphFetch } from "./graph-api";
import { getManagedPageAccessToken } from "./page-client";

async function getServerErrors(locale: Locale | undefined) {
  return getTranslations({
    locale: locale ?? FALLBACK_LOCALE,
    namespace: "pages.posts.serverErrors",
  });
}

const GRAPH_VERSION = "v23.0";

const ALLOWED_IMAGE = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const ALLOWED_VIDEO = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100MB
const MIN_LEAD_TIME_MS = 10 * 60_000; // Meta requires ≥ 10 minutes
const MAX_LEAD_TIME_MS = 180 * 24 * 60 * 60_000; // 6 months
const MAX_CAPTION_LENGTH = 5000;

export type UploadMediaInput = {
  tenantId: string;
  file: File;
  locale?: Locale;
};

export type UploadMediaResult =
  | { ok: true; url: string; pathname: string; contentType: string; sizeBytes: number }
  | { ok: false; error: string };

export async function uploadMediaToBlob(input: UploadMediaInput): Promise<UploadMediaResult> {
  const { tenantId, file, locale } = input;
  const t = await getServerErrors(locale);
  const isImage = ALLOWED_IMAGE.has(file.type);
  const isVideo = ALLOWED_VIDEO.has(file.type);
  if (!isImage && !isVideo) {
    return { ok: false, error: t("unsupportedFileType", { type: file.type }) };
  }
  const maxBytes = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (file.size > maxBytes) {
    return { ok: false, error: t("fileTooLarge", { maxMb: maxBytes / 1024 / 1024 }) };
  }
  const safeName = file.name.replace(/[^\w.-]+/g, "_");
  const pathname = `posts/${tenantId}/${Date.now()}-${safeName}`;
  try {
    const blob = await put(pathname, file, {
      access: "public",
      contentType: file.type,
      addRandomSuffix: false,
    });
    return {
      ok: true,
      url: blob.url,
      pathname: blob.pathname,
      contentType: file.type,
      sizeBytes: file.size,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export type SchedulePostInput = {
  tenantId: string;
  /** Meta page id (digit string). Must be a page in MetaManagedPage for this tenant. */
  metaPageId: string;
  caption: string;
  mediaUrls: string[]; // public HTTPS URLs (typically from uploadMediaToBlob)
  /** When to publish — must be ≥ 10 min and ≤ 6 months from now. */
  scheduledAt: Date;
  createdByUserId?: string | null;
  conversationId?: string | null;
  locale?: Locale;
};

export type SchedulePostResult =
  | { ok: true; pagePostId: string; metaPostId: string }
  | { ok: false; error: string; pagePostId?: string };

function detectKind(mediaUrls: string[]): "PHOTO" | "ALBUM" | "VIDEO" {
  if (mediaUrls.length === 0) throw new Error("mediaUrls is empty");
  // Use the URL extension as a crude detector; we trust the uploader.
  const first = mediaUrls[0].toLowerCase();
  const isVideo = /\.(mp4|mov|webm)(?:\?|$)/.test(first);
  if (isVideo) {
    if (mediaUrls.length > 1) {
      throw new Error("Video posts can only contain one video file");
    }
    return "VIDEO";
  }
  return mediaUrls.length > 1 ? "ALBUM" : "PHOTO";
}

export async function schedulePagePost(input: SchedulePostInput): Promise<SchedulePostResult> {
  const t = await getServerErrors(input.locale);
  // 1. Validate
  if (!input.caption || input.caption.length === 0) {
    return { ok: false, error: t("captionEmpty") };
  }
  if (input.caption.length > MAX_CAPTION_LENGTH) {
    return { ok: false, error: t("captionTooLong", { max: MAX_CAPTION_LENGTH }) };
  }
  if (input.mediaUrls.length === 0) {
    return { ok: false, error: t("mediaRequired") };
  }
  const leadMs = input.scheduledAt.getTime() - Date.now();
  if (leadMs < MIN_LEAD_TIME_MS) {
    return { ok: false, error: t("scheduleTooSoon") };
  }
  if (leadMs > MAX_LEAD_TIME_MS) {
    return { ok: false, error: t("scheduleTooFar") };
  }

  let postKind: "PHOTO" | "ALBUM" | "VIDEO";
  try {
    postKind = detectKind(input.mediaUrls);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  // 2. Resolve managed page + verify ownership
  const managedPage = await prisma.metaManagedPage.findFirst({
    where: {
      metaPageId: input.metaPageId,
      connection: { tenantId: input.tenantId },
    },
    select: { id: true, metaPageId: true },
  });
  if (!managedPage) {
    return {
      ok: false,
      error: t("pageNotConnected", { pageId: input.metaPageId }),
    };
  }

  // 3. Create the PENDING DB row first so we have an audit trail even if Meta fails.
  const pending = await prisma.pagePost.create({
    data: {
      tenantId: input.tenantId,
      managedPageId: managedPage.id,
      metaPageId: managedPage.metaPageId,
      caption: input.caption,
      mediaUrls: input.mediaUrls as unknown as object,
      postKind,
      scheduledAt: input.scheduledAt,
      status: "PENDING",
      conversationId: input.conversationId ?? null,
      createdByUserId: input.createdByUserId ?? null,
    },
    select: { id: true },
  });

  // 4. Call Meta
  const pageToken = await getManagedPageAccessToken(input.tenantId, input.metaPageId);
  const scheduledUnix = Math.floor(input.scheduledAt.getTime() / 1000);

  try {
    let metaPostId: string;
    if (postKind === "PHOTO") {
      const res = await graphFetch<{ id?: string; post_id?: string }>(
        `/${input.metaPageId}/photos`,
        {
          method: "POST",
          accessToken: pageToken,
          body: {
            url: input.mediaUrls[0],
            caption: input.caption,
            published: false,
            scheduled_publish_time: scheduledUnix,
          },
        },
      );
      metaPostId = res.post_id ?? res.id ?? "";
    } else if (postKind === "VIDEO") {
      const res = await graphFetch<{ id?: string }>(`/${input.metaPageId}/videos`, {
        method: "POST",
        accessToken: pageToken,
        body: {
          file_url: input.mediaUrls[0],
          description: input.caption,
          published: false,
          scheduled_publish_time: scheduledUnix,
        },
      });
      metaPostId = res.id ?? "";
    } else {
      // ALBUM — upload each photo unpublished, then post a feed entry that attaches them.
      const photoIds: string[] = [];
      for (const url of input.mediaUrls) {
        const r = await graphFetch<{ id?: string }>(`/${input.metaPageId}/photos`, {
          method: "POST",
          accessToken: pageToken,
          body: { url, published: false },
        });
        if (!r.id) throw new Error("Photo upload returned no id");
        photoIds.push(r.id);
      }
      const feedBody: Record<string, unknown> = {
        message: input.caption,
        published: false,
        scheduled_publish_time: scheduledUnix,
      };
      photoIds.forEach((id, idx) => {
        feedBody[`attached_media[${idx}]`] = JSON.stringify({ media_fbid: id });
      });
      const res = await graphFetch<{ id?: string }>(`/${input.metaPageId}/feed`, {
        method: "POST",
        accessToken: pageToken,
        body: feedBody,
      });
      metaPostId = res.id ?? "";
    }
    if (!metaPostId) throw new Error("Meta accepted the call but returned no post id");

    await prisma.pagePost.update({
      where: { id: pending.id },
      data: { status: "SCHEDULED", metaPostId },
    });
    return { ok: true, pagePostId: pending.id, metaPostId };
  } catch (err) {
    const msg = (err as Error).message ?? "Unknown Meta error";
    await prisma.pagePost.update({
      where: { id: pending.id },
      data: { status: "FAILED", errorMessage: msg.slice(0, 1000) },
    });
    return { ok: false, error: msg, pagePostId: pending.id };
  }
}

export type ListScheduledInput = {
  tenantId: string;
  metaPageId?: string;
  limit?: number;
};

export async function listPagePosts(input: ListScheduledInput) {
  return prisma.pagePost.findMany({
    where: {
      tenantId: input.tenantId,
      ...(input.metaPageId ? { metaPageId: input.metaPageId } : {}),
    },
    orderBy: { scheduledAt: "desc" },
    take: input.limit ?? 50,
    include: {
      managedPage: { select: { name: true, pictureUrl: true } },
    },
  });
}

export type CancelInput = {
  tenantId: string;
  pagePostId: string;
  locale?: Locale;
};

export async function cancelPagePost(input: CancelInput): Promise<{ ok: boolean; error?: string }> {
  const t = await getServerErrors(input.locale);
  const post = await prisma.pagePost.findFirst({
    where: { id: input.pagePostId, tenantId: input.tenantId },
    select: { id: true, status: true, metaPostId: true, metaPageId: true },
  });
  if (!post) return { ok: false, error: "Post not found" };
  if (post.status !== "SCHEDULED") {
    return { ok: false, error: t("cannotCancelStatus", { status: post.status }) };
  }
  if (!post.metaPostId) {
    return { ok: false, error: t("missingMetaPostId") };
  }
  const pageToken = await getManagedPageAccessToken(input.tenantId, post.metaPageId);
  try {
    const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${post.metaPostId}`);
    url.searchParams.set("access_token", pageToken);
    const r = await fetch(url.toString(), { method: "DELETE" });
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`Meta DELETE failed: ${body.slice(0, 200)}`);
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  await prisma.pagePost.update({
    where: { id: post.id },
    data: { status: "CANCELLED" },
  });
  return { ok: true };
}

/**
 * Delete blob assets for posts that have been PUBLISHED for > 30 days.
 * Meta retains the asset; we don't need the local copy. Clears the
 * mediaUrls field but keeps the row for history.
 */
export async function cleanupOldPostBlobs(): Promise<{ cleaned: number; failed: number }> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60_000);
  const rows = await prisma.pagePost.findMany({
    where: {
      status: "PUBLISHED",
      publishedAt: { lte: cutoff },
      mediaUrls: { not: { equals: [] } },
    },
    select: { id: true, mediaUrls: true },
    take: 200,
  });

  let cleaned = 0;
  let failed = 0;
  for (const row of rows) {
    const urls = (row.mediaUrls as unknown as string[] | null) ?? [];
    try {
      await Promise.all(urls.map((u) => del(u).catch(() => undefined)));
      await prisma.pagePost.update({
        where: { id: row.id },
        data: { mediaUrls: [] as unknown as object },
      });
      cleaned++;
    } catch {
      failed++;
    }
  }
  return { cleaned, failed };
}
