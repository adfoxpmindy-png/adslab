import { prisma } from "@/lib/prisma";
import { getConnection, getFreshAccessToken } from "./client";
import { graphFetch } from "./graph-api";

export type CreativePreview = {
  type: "IMAGE" | "VIDEO" | "CAROUSEL" | "UNKNOWN";
  imageUrl: string | null;
  videoThumbUrl: string | null;
};

// 7-day TTL. Meta CDN URLs are signed but remain valid for weeks in practice;
// we refresh weekly to stay ahead of any rotation.
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

type RawCreative = {
  id: string;
  object_type?: string; // "VIDEO" | "SHARE" | ...
  image_url?: string;
  thumbnail_url?: string;
  asset_feed_spec?: {
    images?: Array<{ url?: string; permalink_url?: string }>;
    videos?: Array<{ thumbnail_url?: string; video_id?: string }>;
  };
  object_story_spec?: {
    link_data?: { picture?: string; child_attachments?: Array<{ picture?: string }> };
    video_data?: { image_url?: string };
  };
};

function normalizeCreative(raw: RawCreative): CreativePreview {
  // Carousel: object_story_spec.link_data.child_attachments[]
  if (raw.object_story_spec?.link_data?.child_attachments?.length) {
    const first = raw.object_story_spec.link_data.child_attachments[0];
    return {
      type: "CAROUSEL",
      imageUrl: first.picture ?? null,
      videoThumbUrl: null,
    };
  }

  // Video: thumbnail_url or object_story_spec.video_data.image_url
  if (raw.object_type === "VIDEO" || raw.object_story_spec?.video_data) {
    return {
      type: "VIDEO",
      imageUrl: null,
      videoThumbUrl:
        raw.thumbnail_url ??
        raw.object_story_spec?.video_data?.image_url ??
        raw.asset_feed_spec?.videos?.[0]?.thumbnail_url ??
        null,
    };
  }

  // Image (single)
  const imageUrl =
    raw.image_url ??
    raw.thumbnail_url ??
    raw.object_story_spec?.link_data?.picture ??
    raw.asset_feed_spec?.images?.[0]?.url ??
    null;

  return {
    type: imageUrl ? "IMAGE" : "UNKNOWN",
    imageUrl,
    videoThumbUrl: null,
  };
}

/**
 * Fetch (or read from DB cache) the preview asset for a Meta creative.
 *
 * Returns null when:
 *   - the creative cannot be reached (4xx/5xx) — caller should render a fallback
 *   - the tenant has no live Meta connection
 *
 * Caller passes tenantId so the helper can resolve the right access token —
 * we do NOT fan out access tokens through the call graph.
 */
export async function getCreativePreview(
  creativeId: string,
  tenantId: string,
): Promise<CreativePreview | null> {
  const cached = await prisma.metaAdCreativePreview.findUnique({
    where: { creativeId },
  });
  if (cached && cached.expiresAt.getTime() > Date.now()) {
    return {
      type: cached.type as CreativePreview["type"],
      imageUrl: cached.imageUrl,
      videoThumbUrl: cached.videoThumbUrl,
    };
  }

  const connection = await getConnection(tenantId);
  if (!connection || connection.status !== "ACTIVE") {
    return null;
  }
  const accessToken = await getFreshAccessToken(connection);

  let raw: RawCreative;
  try {
    raw = await graphFetch<RawCreative>(`/${creativeId}`, {
      accessToken,
      searchParams: {
        fields: "id,object_type,image_url,thumbnail_url,asset_feed_spec,object_story_spec",
      },
    });
  } catch (err) {
    console.warn(
      `[creative-preview] fetch failed for ${creativeId}:`,
      (err as Error).message,
    );
    return null;
  }

  const normalized = normalizeCreative(raw);
  const expiresAt = new Date(Date.now() + TTL_MS);

  await prisma.metaAdCreativePreview
    .upsert({
      where: { creativeId },
      create: {
        creativeId,
        type: normalized.type,
        imageUrl: normalized.imageUrl,
        videoThumbUrl: normalized.videoThumbUrl,
        fetchedAt: new Date(),
        expiresAt,
      },
      update: {
        type: normalized.type,
        imageUrl: normalized.imageUrl,
        videoThumbUrl: normalized.videoThumbUrl,
        fetchedAt: new Date(),
        expiresAt,
      },
    })
    .catch((e) => {
      // Caching is best-effort — never let it break the response.
      console.warn("[creative-preview] cache upsert failed:", (e as Error).message);
    });

  return normalized;
}

type RawAdRow = {
  id: string;
  campaign_id?: string;
  creative?: { id?: string };
};

type RawAdsPage = {
  data: RawAdRow[];
  paging?: { next?: string };
};

/**
 * Build a Map<campaignId, creativeId> for the given ad account by asking
 * Meta directly for all ACTIVE ads. One Graph API call (paginated) covers
 * the whole account — much cheaper than per-campaign lookups, and works
 * even when the local MetaAd table is empty (which is the common case
 * because the existing sync flow primarily caches insights, not the
 * ad/creative tree).
 *
 * Returns an empty Map on connection error so the viewer page still renders
 * with placeholder thumbnails instead of crashing.
 */
export async function findCreativeIdsForAccount(
  metaAccountId: string,
  tenantId: string,
): Promise<Map<string, string>> {
  const connection = await getConnection(tenantId);
  if (!connection || connection.status !== "ACTIVE") return new Map();
  const accessToken = await getFreshAccessToken(connection);

  const map = new Map<string, string>();
  let path: string | null = `/${metaAccountId}/ads`;
  let searchParams: Record<string, string | number> | undefined = {
    fields: "id,campaign_id,creative{id}",
    // Status filter at the API level keeps the payload small.
    effective_status: JSON.stringify(["ACTIVE"]),
    limit: 200,
  };
  let nextUrl: string | null = null;

  try {
    while (path || nextUrl) {
      let page: RawAdsPage;
      if (nextUrl) {
        const res = await fetch(nextUrl);
        if (!res.ok) break;
        page = (await res.json()) as RawAdsPage;
      } else {
        page = await graphFetch<RawAdsPage>(path as string, {
          accessToken,
          searchParams,
        });
      }
      for (const ad of page.data) {
        const campId = ad.campaign_id;
        const credId = ad.creative?.id;
        if (campId && credId && !map.has(campId)) {
          map.set(campId, credId);
        }
      }
      nextUrl = page.paging?.next ?? null;
      path = null;
      searchParams = undefined;
    }
  } catch (err) {
    console.warn(
      `[creative-preview] active-ads fetch failed for ${metaAccountId}:`,
      (err as Error).message,
    );
  }

  return map;
}
