/**
 * Shared TypeScript types for Hook Lab v2.
 *
 * These types are the public contract between the four owner-modules of
 * Hook Lab:
 *   - src/lib/hooks/service.ts       (pure logic; MCP-ready)
 *   - src/lib/hooks/prompts.ts       (Agent B — prompts + LLM contracts)
 *   - src/lib/hooks/meta-*.ts        (Agent C — Meta MCP glue)
 *   - src/app/api/ai/hooks/*         (Agent D — HTTP handlers)
 *   - src/app/[locale]/t/[tenantSlug]/creatives/hooks/*
 *                                    (Agent E — client UI)
 *
 * When shapes change, update this file first and let TypeScript find the
 * downstream break-sites.
 */

// ------------------------------------------------------------
// Enums / union aliases
// ------------------------------------------------------------

/**
 * The 6 single-lever swings an iteration can make. Matches the union in
 * HOOK_ITERATOR_PROMPT and the HookConcept.leverChanged DB column.
 */
export type IterationLever =
  | "opening_beat"
  | "first_frame"
  | "actor_age"
  | "actor_ethnicity"
  | "format_style"
  | "callout_wording";

export type HookConceptSource = "generated" | "iteration" | "analyzed" | "manual";

export type HookConceptStatus = "draft" | "testing" | "winner" | "archived";

export type AlignmentVerdict = "aligned" | "partial" | "misaligned";

export type VisualDiffVerdict =
  | "clearly-different"
  | "partial-swing"
  | "same-visual-bucket";

export type AndromedaRisk = "LOW" | "MEDIUM" | "HIGH";

export type HookLanguage = "th" | "en" | "both";

// Kept short-form for the Nick citation shape. Ordinal is the chunk
// position in the source document (stable for UI referencing).
export interface NickCitation {
  ordinal: number;
  title: string;
  url: string;
  /** cosine similarity 0..1 (higher = more relevant). */
  similarity: number;
}

// ------------------------------------------------------------
// Visual direction shape (shared between Generate + Iterate + Plan Visuals)
// ------------------------------------------------------------

/**
 * One visual direction from the LLM. Generate mode returns 3 per concept
 * (3-ads-per-adset pattern); Iterate returns exactly 1 per iteration.
 */
export interface VisualDirection {
  /** Short human-readable name, e.g. "UGC talking head — Asian female 30s". */
  name: string;
  /** 1-2 sentence description of the visual approach. */
  description: string;
  /** Bulleted shot list; each string is one shot/beat. */
  shotList: string[];
  /** Why this visual matches the text hook (per Nick's "visually articulate the hook" rule). */
  hypothesis: string;
  /** How this direction is visually different from control (or the other 2 directions). */
  whyDifferent: string;
  /** Optional format tag from the fixed 7-format taxonomy in VISUAL_PLANNER_PROMPT. */
  format?:
    | "ugc_talking_head"
    | "split_screen_before_after"
    | "on_screen_text_over_product"
    | "pov_over_shoulder"
    | "unboxing_demo"
    | "testimonial_montage"
    | "static_text_on_image";
  /** "9:16" default for Reels/Feed vertical. */
  aspectRatio?: "9:16" | "1:1" | "4:5";
  /** Nick's ~15s duration heuristic. Null for static images. */
  durationSec?: number | null;
}

// ------------------------------------------------------------
// HookConcept — API-response shape (mirrors DB row but with parsed JSON)
// ------------------------------------------------------------

export interface HookConceptShape {
  id: string;
  tenantId: string;
  createdByUserId: string;
  generationId: string;
  source: HookConceptSource;
  parentConceptId: string | null;
  textHookTh: string | null;
  textHookEn: string | null;
  bodyOutline: string | null;
  visualDirections: VisualDirection[] | null;
  leverChanged: IterationLever | null;
  hypothesis: string | null;
  angleChange: {
    angle?: string;
    avatar?: string;
    awareness?: string;
    sophistication?: string;
    desire?: string;
  } | null;
  awarenessStage: string | null;
  sophisticationStage: number | null;
  avatar: string | null;
  controlHookText: string | null;
  controlBodyText: string | null;
  alignmentScore: number | null;
  alignmentVerdict: AlignmentVerdict | null;
  visualDiffVerdict: VisualDiffVerdict | null;
  andromedaRisk: AndromedaRisk | null;
  andromedaOverrideChosen: boolean;
  citations: NickCitation[] | null;
  status: HookConceptStatus;
  notes: string | null;
  metaCampaignId: string | null;
  metaAdSetId: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  costUsd: number | null;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

// ------------------------------------------------------------
// HookAnalysis — Analyze-mode return shape
// ------------------------------------------------------------

export interface AnalysisAxisReasoning {
  stopScroll: string;
  curiosity: string;
  benefit: string;
  alignment: string;
}

export interface AnalysisRewrite {
  text: string;
  /** Short label — which angle this rewrite pivots on. */
  angle: string;
  /** 1-line explanation of why this rewrite should beat the original. */
  whyBetter: string;
}

export interface HookAnalysisShape {
  id: string;
  tenantId: string;
  createdByUserId: string;
  inputTextHook: string;
  controlHookText: string | null;
  controlBodyText: string | null;
  imageUrl: string | null;
  product: string | null;
  audience: string | null;
  scoreStopScroll: number; // 1-5
  scoreCuriosity: number; // 1-5
  scoreBenefit: number; // 1-5
  scoreAlignment: number; // 1-5
  /** Prompt-emitted verdict label (e.g. "green" | "yellow" | "red"). */
  verdict: string;
  reasoning: AnalysisAxisReasoning;
  rewrites: AnalysisRewrite[];
  andromedaRisk: AndromedaRisk;
  andromedaReasoning: string | null;
  citations: NickCitation[];
  promptTokens: number | null;
  completionTokens: number | null;
  costUsd: number | null;
  createdAt: string; // ISO
}

// ------------------------------------------------------------
// HookProfile — per-tenant prefill
// ------------------------------------------------------------

export interface HookProfileShape {
  id: string;
  tenantId: string;
  product: string;
  audience: string;
  desire: string;
  awarenessDefault: string | null;
  sophisticationDefault: number | null;
  language: HookLanguage;
  updatedByUserId: string;
  updatedAt: string; // ISO
}

// ------------------------------------------------------------
// HookWinner — Meta-detected top winner
// ------------------------------------------------------------

export interface HookWinnerShape {
  id: string;
  tenantId: string;
  metaAdId: string;
  metaCampaignId: string | null;
  metaAdSetId: string | null;
  textHook: string;
  body: string | null;
  creativeType: "video" | "image" | "carousel" | null;
  visualSummary: string | null;
  dominantAttributes: string[] | null;
  spend: number | null;
  purchaseRoas: number | null;
  ctr: number | null;
  linkClicks: number | null;
  impressions: number | null;
  detectedAt: string; // ISO
  cachedUntil: string; // ISO
  warnings: Array<{ code: string; message: string }> | null;
}

// ------------------------------------------------------------
// Heuristic Andromeda check — combined return of alignment + visual diff
// ------------------------------------------------------------

export interface AndromedaCheckResult {
  /** Body-hook alignment 0..1 (1 = body clearly discusses the new hook). */
  alignmentScore: number;
  alignmentVerdict: AlignmentVerdict;
  visualDiff: {
    sharedAttributes: string[];
    differentAttributes: string[];
    verdict: VisualDiffVerdict;
  };
  /** Final combined label the UI colors on. */
  combinedRisk: AndromedaRisk;
  /** Human-readable explanation shown in the card + modal. */
  reasoning: string;
  /** Actionable next step, e.g. "swap actor age" or "rewrite body to mention new hook noun-phrase". */
  suggestion: string;
}
