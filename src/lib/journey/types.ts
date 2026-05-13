/**
 * Customer Journey graph — the data structure underlying the "game-like
 * map" view. The shape is intentionally minimal so it can drive both
 * the React Flow canvas and any future renderer (AI summarization,
 * static images, etc.).
 */

export type JourneyNodeKind =
  | "campaign" // Folder grouping (Overview mode only)
  | "post" // A Meta page post used as an ad creative
  | "brand" // External destination, classified by platform
  | "conversion"; // Final goal — Purchase / Lead / etc.

export type Platform =
  | "woocommerce"
  | "shopify"
  | "wordpress"
  | "line"
  | "facebook"
  | "instagram"
  | "tiktok"
  | "youtube"
  | "linktree"
  | "generic";

export type FunnelStage = "awareness" | "consideration" | "conversion";

export type JourneyNode =
  | {
      id: string;
      kind: "campaign";
      label: string;
      metaCampaignId: string;
      objective: string | null;
      spend: number;
      stage: FunnelStage;
    }
  | {
      id: string;
      kind: "post";
      label: string;
      postId: string;
      pageId: string | null;
      thumbnailUrl: string | null;
      reach: number;
      ctr: number;
      stage: FunnelStage;
      campaignIds: string[];
    }
  | {
      id: string;
      kind: "brand";
      label: string;
      url: string;
      platform: Platform;
      faviconUrl: string | null;
      stage: FunnelStage;
    }
  | {
      id: string;
      kind: "conversion";
      label: string; // event display name e.g. "Purchase"
      customConversionId: string | null;
      eventType: string; // PURCHASE / LEAD / OTHER...
      fires: number;
      stage: FunnelStage;
    };

export type JourneyEdge = {
  id: string;
  source: string;
  target: string;
  /** Spend in THB driving this flow — controls beam thickness. */
  spend: number;
  /** Conversion / click count where known — for future tooltip. */
  count: number | null;
  /** Stage of the destination (drives beam color). */
  stage: FunnelStage;
};

export type JourneyGraph = {
  nodes: JourneyNode[];
  edges: JourneyEdge[];
  /** Total spend across the graph in THB (for header summary). */
  totalSpendThb: number;
  /** UTC ms when this graph was assembled — for cache freshness UI. */
  generatedAt: number;
};
