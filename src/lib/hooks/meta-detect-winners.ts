/**
 * Hook Lab v2 — detect the top winning ads for a tenant's Meta ad account.
 *
 * Public entry point:
 *   - detectTopWinners(tenantId, opts?) — pull → rank → interpret → upsert
 *
 * Called by:
 *   - POST /api/ai/hooks/meta/detect-winners
 *       (cache-miss path fires this via next/server after() so the HTTP
 *        response returns in <1s while detection runs to completion)
 *   - GET/POST /api/cron/hook-lab-detect-winners (nightly refresh)
 *
 * MCP tools used (verified against docs/meta-api-mcp-catalog.json):
 *   - campaigns_list
 *   - ads_list_ads_in_account
 *   - insights_get_ad
 *   - ads_get_ad_creative
 *   - ads_get_ad_preview
 *
 * Ranking (reviewer tweak #2 — purchase_roas fallback):
 *   - If purchase_roas is available on ≥ 30% of ads:
 *       rank by (spend ≥ p50 AND roas ≥ 2.0), sort by roas desc.
 *   - Otherwise fallback ranker:
 *       rank by (spend ≥ p50 AND ctr ≥ 1.0 AND link_clicks ≥ 30),
 *       sort by ctr desc.
 *
 * Wall-time cap: 60s per tenant (background job — the API route wraps
 * this in `after()` so the HTTP response never blocks on it).
 */

import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto/aes";
import { callTool, type CallResult } from "@/lib/meta-mcp/router";
import { aiChat } from "@/lib/ai/openrouter";
import { META_WINNER_INTERPRETER_PROMPT } from "./prompts";
import type { HookWinnerShape } from "./types";

// ------------------------------------------------------------
// Tunables
// ------------------------------------------------------------

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const WALL_TIME_MS = 60_000;

const INSIGHTS_BATCH_SIZE = 50;
const INSIGHTS_CONCURRENCY = 5;
const RETRY_BACKOFF_MS = [1_000, 3_000, 9_000];

const ROAS_COVERAGE_THRESHOLD = 0.3;
const MIN_ROAS = 2.0;
const MIN_CTR = 1.0;
const MIN_CLICKS = 30;

const MAX_WINNERS_DEFAULT = 3;
const DEFAULT_SINCE_DAYS = 30;

// Cap ad-account pagination so a tenant with thousands of ads doesn't
// eat the wall-time budget. Top-3 across the first 500 active ads is
// plenty for hook-generation.
const MAX_ADS_TO_SCAN = 500;
const ADS_PAGE_SIZE = 100;

// ------------------------------------------------------------
// Public types
// ------------------------------------------------------------

export interface DetectTopWinnersOptions {
  maxWinners?: number;
  sinceDays?: number;
}

export interface DetectTopWinnersResult {
  winners: HookWinnerShape[];
  warnings: string[];
}

export type WinnerWarningCode =
  | "no_winners_detected"
  | "rate_limited"
  | "insufficient_data"
  | "mcp_not_connected"
  | "creative_id_missing"
  | "preview_render_failed"
  | "graph_api_deprecated_field"
  | "wall_time_exceeded"
  | "no_active_ads"
  | "no_ad_account"
  | "pagination_truncated";

// ------------------------------------------------------------
// Internal Meta-shape types
// ------------------------------------------------------------

interface MetaCampaignRow {
  id: string;
  name?: string;
  effective_status?: string;
}

interface MetaAdRow {
  id: string;
  name?: string;
  campaign_id?: string;
  adset_id?: string;
  effective_status?: string;
  creative?: { id?: string };
}

interface MetaInsightsRow {
  spend?: string | number;
  impressions?: string | number;
  inline_link_clicks?: string | number;
  ctr?: string | number;
  cost_per_inline_link_click?: string | number;
  purchase_roas?: Array<{ action_type: string; value: string }>;
  cpa?: string | number;
}

interface RankedAd {
  adId: string;
  campaignId: string | null;
  adSetId: string | null;
  spend: number;
  roas: number | null;
  ctr: number | null;
  linkClicks: number;
  impressions: number;
}

// ------------------------------------------------------------
// Public entry point
// ------------------------------------------------------------

export async function detectTopWinners(
  tenantId: string,
  opts: DetectTopWinnersOptions = {},
): Promise<DetectTopWinnersResult> {
  const maxWinners = clampInt(opts.maxWinners ?? MAX_WINNERS_DEFAULT, 1, 10);
  const sinceDays = clampInt(opts.sinceDays ?? DEFAULT_SINCE_DAYS, 1, 90);
  const datePreset = pickDatePreset(sinceDays);

  const warnings = new Set<WinnerWarningCode>();
  const deadline = Date.now() + WALL_TIME_MS;

  // Step a-b: Load token
  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId },
    select: {
      id: true,
      accessTokenEncrypted: true,
      status: true,
      adAccounts: {
        select: { metaAccountId: true, accountStatus: true },
        take: 1,
        // Prefer an ACTIVE (accountStatus=1) account.
        orderBy: { accountStatus: "asc" },
      },
    },
  });

  if (!connection || connection.status !== "ACTIVE") {
    return {
      winners: [],
      warnings: ["mcp_not_connected"],
    };
  }

  if (connection.adAccounts.length === 0) {
    return {
      winners: [],
      warnings: ["no_ad_account"],
    };
  }

  const adAccountId = connection.adAccounts[0].metaAccountId;
  const token = decrypt(connection.accessTokenEncrypted);

  // Step c: list ACTIVE campaigns (used to bound the ad walk to campaigns
  // that Meta considers currently delivering).
  const activeCampaigns = await fetchActiveCampaigns(adAccountId, token, warnings, deadline);
  if (deadlinePassed(deadline)) {
    warnings.add("wall_time_exceeded");
    return finish([], warnings);
  }
  if (activeCampaigns.length === 0) {
    warnings.add("no_active_ads");
    return finish([], warnings);
  }
  const activeCampaignIds = new Set(activeCampaigns.map((c) => c.id));

  // Step d: list ACTIVE ads in the account (paginated, capped).
  const ads = await fetchActiveAds(adAccountId, token, warnings, deadline);
  if (deadlinePassed(deadline)) {
    warnings.add("wall_time_exceeded");
    return finish([], warnings);
  }
  const adsInActiveCampaigns = ads.filter((a) => !a.campaign_id || activeCampaignIds.has(a.campaign_id));
  if (adsInActiveCampaigns.length === 0) {
    warnings.add("no_active_ads");
    return finish([], warnings);
  }

  // Step e: batch insights (concurrency 5, batches of 50).
  const insightsByAdId = await fetchInsightsForAds(
    adsInActiveCampaigns.map((a) => a.id),
    token,
    datePreset,
    warnings,
    deadline,
  );
  if (deadlinePassed(deadline)) {
    warnings.add("wall_time_exceeded");
    return finish([], warnings);
  }

  // Step f: rank
  const ranked = rankAds(adsInActiveCampaigns, insightsByAdId);
  const topN = ranked.slice(0, maxWinners);
  if (topN.length === 0) {
    warnings.add("no_winners_detected");
    if (ranked.length === 0 && insightsByAdId.size > 0) {
      warnings.add("insufficient_data");
    }
    return finish([], warnings);
  }

  // Step g: creative + preview for top N (best-effort).
  const enriched: Array<RankedAd & {
    creativeBody: string;
    creativeTitle: string;
    creativeType: "video" | "image" | "carousel" | null;
    previewHtml: string;
  }> = [];
  for (const ad of topN) {
    if (deadlinePassed(deadline)) {
      warnings.add("wall_time_exceeded");
      break;
    }
    const creative = await withRetry(
      () => callTool("ads_get_ad_creative", { ad_id: ad.adId }, token),
      warnings,
    );
    const preview = await withRetry(
      () => callTool(
        "ads_get_ad_preview",
        { ad_id: ad.adId, ad_format: "MOBILE_FEED_STANDARD" },
        token,
      ),
      warnings,
    );

    const creativeShape = extractCreativeFields(creative);
    if (!creativeShape.creativeId) warnings.add("creative_id_missing");

    const previewHtml = extractPreviewHtml(preview);
    if (!previewHtml) warnings.add("preview_render_failed");

    enriched.push({
      ...ad,
      creativeBody: creativeShape.body,
      creativeTitle: creativeShape.title,
      creativeType: creativeShape.type,
      previewHtml,
    });
  }

  // Step h: interpret each with the LLM.
  const upserted: HookWinnerShape[] = [];
  const now = new Date();
  const cachedUntil = new Date(now.getTime() + CACHE_TTL_MS);
  const finalWarnings: Array<{ code: string; message: string }> =
    Array.from(warnings).map((code) => ({ code, message: WARNING_MESSAGES[code] ?? code }));
  // Prisma requires undefined (not null) to mean "leave column as its
  // default (null)". Casting to InputJsonValue on the non-empty branch
  // is safe — the shape is a plain array-of-objects.
  const warningsJson = finalWarnings.length > 0 ? finalWarnings : undefined;

  for (const w of enriched) {
    if (deadlinePassed(deadline)) {
      warnings.add("wall_time_exceeded");
      break;
    }

    let interpreted: NormalizedWinner;
    try {
      interpreted = await interpretWinnerWithLLM({
        textHookRaw: w.creativeTitle || w.creativeBody,
        bodyRaw: w.creativeBody,
        previewHtml: w.previewHtml,
        creativeType: w.creativeType,
      });
    } catch (err) {
      // LLM failure — fall back to raw fields + warn.
      warnings.add("insufficient_data");
      interpreted = fallbackNormalize(w.creativeTitle, w.creativeBody, w.creativeType);
      console.warn("[hooks/meta-detect-winners] interpreter LLM failed:", (err as Error).message);
    }

    const row = await prisma.hookWinner.upsert({
      where: { tenantId_metaAdId: { tenantId, metaAdId: w.adId } },
      create: {
        tenantId,
        metaAdId: w.adId,
        metaCampaignId: w.campaignId,
        metaAdSetId: w.adSetId,
        textHook: interpreted.textHook,
        body: interpreted.body,
        creativeType: interpreted.creativeType,
        visualSummary: interpreted.visualSummary,
        dominantAttributes: interpreted.dominantAttributes,
        spend: w.spend,
        purchaseRoas: w.roas,
        ctr: w.ctr,
        linkClicks: w.linkClicks,
        impressions: w.impressions,
        detectedAt: now,
        cachedUntil,
        warnings: warningsJson,
      },
      update: {
        metaCampaignId: w.campaignId,
        metaAdSetId: w.adSetId,
        textHook: interpreted.textHook,
        body: interpreted.body,
        creativeType: interpreted.creativeType,
        visualSummary: interpreted.visualSummary,
        dominantAttributes: interpreted.dominantAttributes,
        spend: w.spend,
        purchaseRoas: w.roas,
        ctr: w.ctr,
        linkClicks: w.linkClicks,
        impressions: w.impressions,
        detectedAt: now,
        cachedUntil,
        warnings: warningsJson,
      },
    });

    upserted.push(rowToShape(row));
  }

  return {
    winners: upserted,
    warnings: Array.from(warnings),
  };
}

function finish(winners: HookWinnerShape[], warnings: Set<WinnerWarningCode>): DetectTopWinnersResult {
  return { winners, warnings: Array.from(warnings) };
}

// ------------------------------------------------------------
// Meta calls
// ------------------------------------------------------------

async function fetchActiveCampaigns(
  adAccountId: string,
  token: string,
  warnings: Set<WinnerWarningCode>,
  deadline: number,
): Promise<MetaCampaignRow[]> {
  const res = await withRetry(
    () => callTool<{ data: MetaCampaignRow[] }>(
      "campaigns_list",
      {
        ad_account_id: adAccountId,
        effective_status: JSON.stringify(["ACTIVE"]),
        fields: "id,name,effective_status",
        limit: 100,
      },
      token,
    ),
    warnings,
  );
  if (!res.ok) return [];
  return res.data.data ?? [];
}

async function fetchActiveAds(
  adAccountId: string,
  token: string,
  warnings: Set<WinnerWarningCode>,
  deadline: number,
): Promise<MetaAdRow[]> {
  const collected: MetaAdRow[] = [];
  let after: string | undefined;
  let pagesFetched = 0;

  while (collected.length < MAX_ADS_TO_SCAN) {
    if (deadlinePassed(deadline)) break;

    const params: Record<string, unknown> = {
      ad_account_id: adAccountId,
      fields: "id,name,campaign_id,adset_id,effective_status,creative",
      filtering: JSON.stringify([
        { field: "effective_status", operator: "EQUAL", value: "ACTIVE" },
      ]),
      limit: ADS_PAGE_SIZE,
    };
    if (after) params.after = after;

    const res = await withRetry(
      () => callTool<{
        data: MetaAdRow[];
        paging?: { cursors?: { after?: string }; next?: string };
      }>("ads_list_ads_in_account", params, token),
      warnings,
    );
    if (!res.ok) break;

    collected.push(...(res.data.data ?? []));
    pagesFetched += 1;

    const nextAfter = res.data.paging?.cursors?.after;
    const hasNext = Boolean(res.data.paging?.next && nextAfter);
    if (!hasNext) break;
    after = nextAfter;

    // Hard cap on pages as belt-and-braces alongside MAX_ADS_TO_SCAN.
    if (pagesFetched >= Math.ceil(MAX_ADS_TO_SCAN / ADS_PAGE_SIZE)) {
      warnings.add("pagination_truncated");
      break;
    }
  }

  if (collected.length >= MAX_ADS_TO_SCAN) warnings.add("pagination_truncated");
  return collected.slice(0, MAX_ADS_TO_SCAN);
}

async function fetchInsightsForAds(
  adIds: string[],
  token: string,
  datePreset: string,
  warnings: Set<WinnerWarningCode>,
  deadline: number,
): Promise<Map<string, MetaInsightsRow>> {
  const out = new Map<string, MetaInsightsRow>();
  const batches: string[][] = [];
  for (let i = 0; i < adIds.length; i += INSIGHTS_BATCH_SIZE) {
    batches.push(adIds.slice(i, i + INSIGHTS_BATCH_SIZE));
  }

  for (const batch of batches) {
    if (deadlinePassed(deadline)) break;
    await runWithConcurrency(batch, INSIGHTS_CONCURRENCY, async (adId) => {
      if (deadlinePassed(deadline)) return;
      const res = await withRetry(
        () => callTool<{ data: MetaInsightsRow[] }>(
          "insights_get_ad",
          {
            ad_id: adId,
            fields: "spend,purchase_roas,cpa,impressions,inline_link_clicks,cost_per_inline_link_click,ctr",
            date_preset: datePreset,
          },
          token,
        ),
        warnings,
      );
      if (!res.ok) return;
      const row = (res.data.data ?? [])[0];
      if (row) out.set(adId, row);
    });
  }

  return out;
}

// ------------------------------------------------------------
// Ranking (reviewer tweak #2 — purchase_roas fallback)
// ------------------------------------------------------------

function rankAds(
  ads: MetaAdRow[],
  insightsByAdId: Map<string, MetaInsightsRow>,
): RankedAd[] {
  const normalized: RankedAd[] = ads
    .map((a) => {
      const ins = insightsByAdId.get(a.id);
      if (!ins) return null;
      const spend = toFloat(ins.spend);
      const impressions = toInt(ins.impressions);
      const linkClicks = toInt(ins.inline_link_clicks);
      const ctr = toFloat(ins.ctr);
      const roas = extractPurchaseRoas(ins.purchase_roas);
      return {
        adId: a.id,
        campaignId: a.campaign_id ?? null,
        adSetId: a.adset_id ?? null,
        spend,
        roas,
        ctr: isFinite(ctr) ? ctr : null,
        linkClicks,
        impressions,
      } as RankedAd;
    })
    .filter((x): x is RankedAd => x !== null);

  if (normalized.length === 0) return [];

  const spends = normalized.map((n) => n.spend).sort((a, b) => a - b);
  const p50 = percentile(spends, 0.5);

  const roasCoverage =
    normalized.filter((n) => n.roas !== null && n.roas > 0).length / normalized.length;

  if (roasCoverage >= ROAS_COVERAGE_THRESHOLD) {
    return normalized
      .filter((n) => n.spend >= p50 && (n.roas ?? 0) >= MIN_ROAS)
      .sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0));
  }

  return normalized
    .filter(
      (n) =>
        n.spend >= p50 &&
        (n.ctr ?? 0) >= MIN_CTR &&
        n.linkClicks >= MIN_CLICKS,
    )
    .sort((a, b) => (b.ctr ?? 0) - (a.ctr ?? 0));
}

// ------------------------------------------------------------
// LLM interpretation
// ------------------------------------------------------------

interface NormalizedWinner {
  textHook: string;
  body: string;
  creativeType: "video" | "image" | "carousel" | null;
  visualSummary: string;
  dominantAttributes: string[];
}

async function interpretWinnerWithLLM(input: {
  textHookRaw: string;
  bodyRaw: string;
  previewHtml: string;
  creativeType: "video" | "image" | "carousel" | null;
}): Promise<NormalizedWinner> {
  const payload = {
    text_hook_raw: input.textHookRaw,
    body_raw: input.bodyRaw,
    creative_type: input.creativeType,
    preview_html_excerpt: input.previewHtml.slice(0, 4000),
  };

  const res = await aiChat({
    role: "analysis",
    system: META_WINNER_INTERPRETER_PROMPT,
    messages: [{ role: "user", content: JSON.stringify(payload) }],
    temperature: 0,
    maxTokens: 600,
  });

  const parsed = parseInterpreterResponse(res.content);
  return {
    textHook: parsed.textHook || input.textHookRaw,
    body: parsed.body || input.bodyRaw,
    creativeType: parsed.creativeType ?? input.creativeType,
    visualSummary: parsed.visualSummary ?? "",
    dominantAttributes: parsed.dominantAttributes ?? [],
  };
}

function parseInterpreterResponse(raw: string): Partial<NormalizedWinner> {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) text = fence[1];
  try {
    const obj = JSON.parse(text) as {
      textHook?: string;
      body?: string;
      creativeType?: "video" | "image" | "carousel";
      visualSummary?: string;
      dominantAttributes?: string[];
    };
    return {
      textHook: typeof obj.textHook === "string" ? obj.textHook : undefined,
      body: typeof obj.body === "string" ? obj.body : undefined,
      creativeType: obj.creativeType,
      visualSummary: typeof obj.visualSummary === "string" ? obj.visualSummary : undefined,
      dominantAttributes: Array.isArray(obj.dominantAttributes)
        ? obj.dominantAttributes.filter((s): s is string => typeof s === "string")
        : undefined,
    };
  } catch {
    return {};
  }
}

function fallbackNormalize(
  title: string,
  body: string,
  creativeType: "video" | "image" | "carousel" | null,
): NormalizedWinner {
  const textHook = (title || body || "").slice(0, 200).trim();
  return {
    textHook: textHook || "(missing)",
    body: (body || "").trim(),
    creativeType,
    visualSummary: "",
    dominantAttributes: [],
  };
}

// ------------------------------------------------------------
// Creative + preview extractors
// ------------------------------------------------------------

interface CreativeShape {
  creativeId: string | null;
  body: string;
  title: string;
  type: "video" | "image" | "carousel" | null;
}

function extractCreativeFields(res: CallResult<unknown> | undefined): CreativeShape {
  if (!res || !res.ok) return { creativeId: null, body: "", title: "", type: null };
  const data = res.data as {
    creative?: {
      id?: string;
      body?: string;
      title?: string;
      video_id?: string;
      image_url?: string;
      object_story_spec?: {
        video_data?: { title?: string; message?: string };
        link_data?: { message?: string; name?: string; child_attachments?: unknown[] };
      };
    };
  };
  const c = data?.creative;
  if (!c) return { creativeId: null, body: "", title: "", type: null };

  const body =
    c.body ??
    c.object_story_spec?.video_data?.message ??
    c.object_story_spec?.link_data?.message ??
    "";

  const title =
    c.title ??
    c.object_story_spec?.video_data?.title ??
    c.object_story_spec?.link_data?.name ??
    "";

  let type: "video" | "image" | "carousel" | null = null;
  if (Array.isArray(c.object_story_spec?.link_data?.child_attachments)) type = "carousel";
  else if (c.video_id || c.object_story_spec?.video_data) type = "video";
  else if (c.image_url) type = "image";

  return {
    creativeId: c.id ?? null,
    body,
    title,
    type,
  };
}

function extractPreviewHtml(res: CallResult<unknown> | undefined): string {
  if (!res || !res.ok) return "";
  const data = res.data as { data?: Array<{ body?: string }> };
  const rows = data?.data ?? [];
  return rows[0]?.body ?? "";
}

// ------------------------------------------------------------
// Utility helpers
// ------------------------------------------------------------

async function withRetry<T>(
  fn: () => Promise<CallResult<T>>,
  warnings: Set<WinnerWarningCode>,
): Promise<CallResult<T>> {
  let lastResult: CallResult<T> | null = null;
  for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
    const res = await fn();
    lastResult = res;
    if (res.ok) return res;

    const err = res.error.toLowerCase();
    const status = "httpStatus" in res ? res.httpStatus : undefined;
    const isRateLimit =
      err.includes("rate limit") ||
      err.includes("too many") ||
      err.includes("user request limit") ||
      status === 429 ||
      status === 613;
    const isDeprecated = err.includes("deprecated") || err.includes("invalid field");
    const isTransient = status === undefined || (status >= 500 && status < 600) || isRateLimit;

    if (isRateLimit) warnings.add("rate_limited");
    if (isDeprecated) warnings.add("graph_api_deprecated_field");

    if (!isTransient || attempt === RETRY_BACKOFF_MS.length) return res;
    await sleep(RETRY_BACKOFF_MS[attempt]);
  }
  // Unreachable, but keep types honest.
  return lastResult as CallResult<T>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const runners: Promise<void>[] = [];
  const runOne = async (): Promise<void> => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (next === undefined) return;
      await worker(next);
    }
  };
  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    runners.push(runOne());
  }
  await Promise.all(runners);
}

function deadlinePassed(deadline: number): boolean {
  return Date.now() >= deadline;
}

function clampInt(v: number, min: number, max: number): number {
  const n = Math.floor(v);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function pickDatePreset(days: number): string {
  if (days <= 7) return "last_7d";
  if (days <= 14) return "last_14d";
  if (days <= 30) return "last_30d";
  if (days <= 90) return "last_90d";
  return "last_30d";
}

function toFloat(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function toInt(v: unknown): number {
  if (typeof v === "number") return Math.floor(v);
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function extractPurchaseRoas(
  arr: Array<{ action_type: string; value: string }> | undefined,
): number | null {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  // Prefer omni_purchase, then purchase, then any first entry.
  const preferred = ["omni_purchase", "purchase"];
  for (const key of preferred) {
    const hit = arr.find((r) => r.action_type === key);
    if (hit) {
      const n = parseFloat(hit.value);
      return Number.isFinite(n) ? n : null;
    }
  }
  const n = parseFloat(arr[0].value);
  return Number.isFinite(n) ? n : null;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
  return sorted[idx];
}

const WARNING_MESSAGES: Record<string, string> = {
  no_winners_detected: "No ads passed the ranking thresholds. Try lowering the spend/ROAS floor or extending the date range.",
  rate_limited: "Meta rate-limited some requests. Winner list may be partial; will retry on the next detection cycle.",
  insufficient_data: "Some ads had missing insights data. Ranking may exclude ads that haven't accumulated enough spend.",
  mcp_not_connected: "No active Meta connection for this tenant. Connect a Meta account under Settings to enable winner detection.",
  creative_id_missing: "One or more winners had no creative reference on Meta's side.",
  preview_render_failed: "Meta declined to render an ad preview for one or more winners.",
  graph_api_deprecated_field: "Meta signaled a deprecated field. Update the insights field list.",
  wall_time_exceeded: "Detection ran past its 60s budget. Any winners collected so far were cached; the rest will be picked up on the next cycle.",
  no_active_ads: "No active ads found in any active campaign in this account.",
  no_ad_account: "No ad accounts are linked to this Meta connection. Sync ad accounts under Settings.",
  pagination_truncated: "This account has more ads than the per-run cap. Detection scanned the first 500 active ads.",
};

// ------------------------------------------------------------
// Row-to-shape mapping
// ------------------------------------------------------------

function rowToShape(row: {
  id: string;
  tenantId: string;
  metaAdId: string;
  metaCampaignId: string | null;
  metaAdSetId: string | null;
  textHook: string;
  body: string | null;
  creativeType: string | null;
  visualSummary: string | null;
  dominantAttributes: unknown;
  spend: number | null;
  purchaseRoas: number | null;
  ctr: number | null;
  linkClicks: number | null;
  impressions: number | null;
  detectedAt: Date;
  cachedUntil: Date;
  warnings: unknown;
}): HookWinnerShape {
  return {
    id: row.id,
    tenantId: row.tenantId,
    metaAdId: row.metaAdId,
    metaCampaignId: row.metaCampaignId,
    metaAdSetId: row.metaAdSetId,
    textHook: row.textHook,
    body: row.body,
    creativeType:
      row.creativeType === "video" || row.creativeType === "image" || row.creativeType === "carousel"
        ? row.creativeType
        : null,
    visualSummary: row.visualSummary,
    dominantAttributes: Array.isArray(row.dominantAttributes)
      ? (row.dominantAttributes as unknown[]).filter((s): s is string => typeof s === "string")
      : null,
    spend: row.spend,
    purchaseRoas: row.purchaseRoas,
    ctr: row.ctr,
    linkClicks: row.linkClicks,
    impressions: row.impressions,
    detectedAt: row.detectedAt.toISOString(),
    cachedUntil: row.cachedUntil.toISOString(),
    warnings: Array.isArray(row.warnings)
      ? (row.warnings as Array<{ code: unknown; message: unknown }>)
          .filter((w) => typeof w.code === "string" && typeof w.message === "string")
          .map((w) => ({ code: w.code as string, message: w.message as string }))
      : null,
  };
}

// ------------------------------------------------------------
// Cache helpers (used by the API route)
// ------------------------------------------------------------

/**
 * Return the tenant's currently-cached winners (rows whose cachedUntil is
 * still in the future). Empty array if none. The route uses this to decide
 * whether to return a cache hit or fire background detection.
 */
export async function getCachedWinners(
  tenantId: string,
  maxWinners = MAX_WINNERS_DEFAULT,
): Promise<HookWinnerShape[]> {
  const rows = await prisma.hookWinner.findMany({
    where: { tenantId, cachedUntil: { gt: new Date() } },
    orderBy: [{ purchaseRoas: "desc" }, { ctr: "desc" }, { spend: "desc" }],
    take: maxWinners,
  });
  return rows.map(rowToShape);
}
