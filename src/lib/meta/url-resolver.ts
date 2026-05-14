/**
 * Resolve a Facebook URL (reel / share-link / post / video) into a
 * structured `{ pageId, postId, mediaType }` we can pass to Meta
 * Marketing API for boosting via `object_story_id`.
 *
 * Patterns we handle (verified against the founder's real client message):
 *   - https://facebook.com/reel/{reel_id}
 *   - https://facebook.com/share/v/{shortcode}/        (must follow redirect)
 *   - https://facebook.com/share/r/{shortcode}/        (must follow redirect)
 *   - https://facebook.com/{page_id_or_handle}/posts/{post_id}
 *   - https://facebook.com/{page_id_or_handle}/videos/{video_id}
 *   - https://fb.watch/{shortcode}/                    (must follow redirect)
 */
import { graphFetch } from "./graph-api";

export type ResolvedFbUrl = {
  /** Original input — useful for surfacing errors next to the user's URL */
  originalUrl: string;
  /** Canonical URL after following any redirects */
  canonicalUrl: string;
  /** Meta page id (digits) that owns the post */
  pageId: string;
  pageName: string;
  /** Boostable post id. For reels this is the post-format id (page_id_video_id). */
  postId: string;
  mediaType: "reel" | "video" | "image" | "text" | "unknown";
  /** Permalink Meta gives us — useful for confirmation UI */
  permalinkUrl: string;
};

export type ResolveError = {
  originalUrl: string;
  error: string;
};

const REEL_RE = /facebook\.com\/reel\/(\d+)/i;
const POST_RE = /facebook\.com\/[^/]+\/posts\/(\d+)/i;
const VIDEO_RE = /facebook\.com\/[^/]+\/videos\/(\d+)/i;
const SHARE_RE = /facebook\.com\/share\/[vr]\/[^/?]+/i;
const FB_WATCH_RE = /fb\.watch\/[^/?]+/i;

/** Strip params + trailing slash for stable comparison. */
function normalize(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.search = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}

/** Follow HTTP redirects until we land on a canonical FB URL. */
async function followRedirect(url: string): Promise<string> {
  // Some FB share endpoints serve HTML with a meta-refresh OR JS-redirect;
  // most simple ones do a 302. Try fetch with redirect:"manual" to read
  // Location header; if none, fall back to redirect:"follow" + read URL.
  try {
    const res = await fetch(url, { redirect: "follow" });
    return res.url || url;
  } catch (err) {
    throw new Error(`ตามลิงก์ไม่ได้: ${(err as Error).message}`);
  }
}

/**
 * Pull a boostable post id from a Meta API response. For a reel that
 * was posted to a Page, the API returns `id` in the form `{video_id}`,
 * but ads need the post-format `{page_id}_{video_id}`.
 */
function buildPostId(pageId: string, contentId: string): string {
  if (contentId.includes("_")) return contentId;
  return `${pageId}_${contentId}`;
}

type RawNode = {
  id?: string;
  from?: { id?: string; name?: string };
  permalink_url?: string;
  source?: string; // video source URL — present for video/reel
};

/**
 * Resolve a single FB URL. Throws on un-resolvable input.
 * The caller (resolveAllUrls) catches + bundles errors per URL.
 */
export async function resolveFbUrl(args: {
  url: string;
  accessToken: string;
}): Promise<ResolvedFbUrl> {
  const original = args.url.trim();
  if (!original) throw new Error("ลิงก์ว่างเปล่า");

  // Step 1: if it's a share/watch link, follow redirect first.
  let canonical = normalize(original);
  if (SHARE_RE.test(canonical) || FB_WATCH_RE.test(canonical)) {
    canonical = normalize(await followRedirect(original));
  }

  // Step 2: extract a content id from the canonical URL.
  let rawContentId: string | null = null;
  let assumedType: "reel" | "video" | "post" | null = null;
  const reelMatch = canonical.match(REEL_RE);
  const postMatch = canonical.match(POST_RE);
  const videoMatch = canonical.match(VIDEO_RE);
  if (reelMatch) {
    rawContentId = reelMatch[1];
    assumedType = "reel";
  } else if (postMatch) {
    rawContentId = postMatch[1];
    assumedType = "post";
  } else if (videoMatch) {
    rawContentId = videoMatch[1];
    assumedType = "video";
  }
  if (!rawContentId) {
    throw new Error(`รูปแบบ URL ไม่รองรับ: ${canonical}`);
  }

  // Step 3: query Meta for owner + permalink.
  // We try the raw id first; Meta accepts both video_id and post_id formats.
  let node: RawNode;
  try {
    node = await graphFetch<RawNode>(`/${rawContentId}`, {
      accessToken: args.accessToken,
      searchParams: {
        fields: "id,from{id,name},permalink_url,source",
      },
    });
  } catch (err) {
    const msg = (err as Error).message;
    throw new Error(`Meta ไม่รู้จัก content นี้ (${rawContentId}): ${msg}`);
  }
  if (!node.from?.id) {
    throw new Error(`ไม่พบ Page เจ้าของ post นี้ — อาจเป็น user post ที่ boost ไม่ได้`);
  }

  const pageId = node.from.id;
  const pageName = node.from.name ?? "(unknown)";

  // Step 4: build canonical boostable post id.
  // CRITICAL: For Reels, the number in the URL is the video_id, NOT the
  // post_id Meta expects in object_story_id. Sending pageId_videoId
  // triggers Meta's "ไม่สามารถโปรโมทโพสต์นี้ได้" (error_subcode 2446187)
  // — verified across 6+ E2E runs. Real post_id must be resolved via
  // /PAGE_ID/video_reels?fields=id,post_id which Meta only exposes with
  // a Page-level access token, not the user token.
  let postId: string;
  if (assumedType === "post") {
    postId = rawContentId;
  } else if (assumedType === "reel") {
    const realPostId = await resolveReelPostId({
      pageId,
      videoId: rawContentId,
      userAccessToken: args.accessToken,
    });
    if (!realPostId) {
      throw new Error(
        `หา post_id ของ reel ${rawContentId} ไม่เจอ — อาจ reel ใหม่เกินไป หรือคุณไม่ใช่ admin ของ Page ${pageName}`,
      );
    }
    postId = `${pageId}_${realPostId}`;
  } else {
    postId = buildPostId(pageId, rawContentId);
  }

  const mediaType: ResolvedFbUrl["mediaType"] =
    assumedType === "reel" ? "reel" : assumedType === "video" ? "video" : "image";

  return {
    originalUrl: original,
    canonicalUrl: canonical,
    pageId,
    pageName,
    postId,
    mediaType,
    permalinkUrl: node.permalink_url ?? canonical,
  };
}

/**
 * Resolve a Reel's real post_id from its video_id (the number in the URL).
 *
 * Meta only exposes the video_id → post_id mapping via
 * `/PAGE_ID/video_reels?fields=id,post_id`, which requires a Page-level
 * access token. We fetch it from `/me/accounts` using the user token,
 * then iterate the Page's reels until we find the match.
 *
 * Pages can have many reels; we paginate up to ~500 reels which covers
 * the overwhelming majority of cases.
 */
async function resolveReelPostId(args: {
  pageId: string;
  videoId: string;
  userAccessToken: string;
}): Promise<string | null> {
  // Step A: get the Page access token (we are admin via /me/accounts)
  let pageToken: string | null = null;
  let cursor = "";
  for (let page = 0; page < 5; page++) {
    const url = new URL("https://graph.facebook.com/v23.0/me/accounts");
    url.searchParams.set("fields", "id,access_token");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("after", cursor);
    url.searchParams.set("access_token", args.userAccessToken);
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: Array<{ id: string; access_token?: string }>;
      paging?: { cursors?: { after?: string } };
    };
    const match = body.data?.find((p) => p.id === args.pageId);
    if (match?.access_token) {
      pageToken = match.access_token;
      break;
    }
    if (!body.paging?.cursors?.after) break;
    cursor = body.paging.cursors.after;
  }
  if (!pageToken) return null;

  // Step B: iterate the Page's reels looking for our video_id
  let next: string | null = `https://graph.facebook.com/v23.0/${args.pageId}/video_reels?fields=id,post_id&limit=100&access_token=${pageToken}`;
  for (let page = 0; page < 5 && next; page++) {
    const res = await fetch(next);
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: Array<{ id: string; post_id?: string }>;
      paging?: { next?: string };
    };
    const match = body.data?.find((r) => r.id === args.videoId);
    if (match?.post_id) return match.post_id;
    next = body.paging?.next ?? null;
  }
  return null;
}

/** Resolve many URLs in parallel; surface per-URL errors instead of failing whole batch. */
export async function resolveAllUrls(args: {
  urls: string[];
  accessToken: string;
}): Promise<{ resolved: ResolvedFbUrl[]; errors: ResolveError[] }> {
  const settled = await Promise.allSettled(
    args.urls.map((url) => resolveFbUrl({ url, accessToken: args.accessToken })),
  );
  const resolved: ResolvedFbUrl[] = [];
  const errors: ResolveError[] = [];
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status === "fulfilled") resolved.push(r.value);
    else errors.push({ originalUrl: args.urls[i], error: (r.reason as Error).message });
  }
  return { resolved, errors };
}

/**
 * Extract URLs from a free-form prompt. Used by the parser so Claude
 * doesn't need to be 100% reliable on URL extraction (regex is cheaper +
 * deterministic).
 */
export function extractUrls(text: string): string[] {
  const urlRe = /https?:\/\/[^\s,]+/g;
  const matches = text.match(urlRe) ?? [];
  // Dedupe + filter to FB only.
  const unique = Array.from(new Set(matches));
  return unique.filter((u) => /facebook\.com|fb\.watch/i.test(u));
}
