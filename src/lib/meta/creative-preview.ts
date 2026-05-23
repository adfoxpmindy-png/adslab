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

/**
 * For each campaign, look up the first cached ACTIVE ad and return its
 * creativeId. Pure DB read — no Meta API calls. Returns a map of
 * campaignId → creativeId (entries omitted when no cached ad exists).
 *
 * This is the v1 stopgap for per-campaign previews. Once we cache ad-level
 * insights we can drop this and key previews directly off campaign metadata.
 */
export async function findCreativeIdsForCampaigns(
  campaignIds: string[],
): Promise<Map<string, string>> {
  if (campaignIds.length === 0) return new Map();

  const ads = await prisma.metaAd.findMany({
    where: {
      effectiveStatus: "ACTIVE",
      creativeId: { not: null },
      adSet: { campaign: { metaCampaignId: { in: campaignIds } } },
    },
    select: {
      creativeId: true,
      adSet: { select: { campaign: { select: { metaCampaignId: true } } } },
    },
    orderBy: { lastFetchedAt: "desc" },
  });

  const map = new Map<string, string>();
  for (const ad of ads) {
    const campId = ad.adSet.campaign.metaCampaignId;
    if (!map.has(campId) && ad.creativeId) {
      map.set(campId, ad.creativeId);
    }
  }
  return map;
}
