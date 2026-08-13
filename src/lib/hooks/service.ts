/**
 * Hook Lab v2 — pure service functions (MCP-ready).
 *
 * The 5 public functions here are the exact call surface HTTP routes and
 * the future MCP tool layer both consume. Rules of the road:
 *   - Every function is tenant-scoped. Never trust a caller-supplied user
 *     context alone — every DB write includes tenantId.
 *   - No HTTP concerns here. Routes wrap these with parsing, streaming,
 *     and response shaping.
 *   - JSON-serialisable args + strict return shapes so the same functions
 *     drop-in as MCP tools later without refactoring.
 *   - Cost accounting: every LLM call estimates USD cost from the returned
 *     usage and stores it alongside the row it produced.
 */

import { randomUUID } from "node:crypto";

import { aiChat } from "@/lib/ai/openrouter";
import { prisma } from "@/lib/prisma";

import { checkBodyHookAlignment } from "./alignment";
import { retrieveNickChunksForHook, type NickChunk } from "./nick-retrieval";
import {
  HOOK_ANALYZER_PROMPT,
  HOOK_GENERATOR_PROMPT,
  HOOK_ITERATOR_PROMPT,
  LOCALE_DIRECTIVE,
  VISUAL_ATTRIBUTE_DIFF_PROMPT,
  VISUAL_PLANNER_PROMPT,
  buildPromptWithCitations,
} from "./prompts";
import { sanitizeUntrustedInput, wrapAsData } from "./sanitize";
import type {
  AlignmentVerdict,
  AndromedaCheckResult,
  AndromedaRisk,
  AnalysisAxisReasoning,
  AnalysisRewrite,
  HookAnalysisShape,
  HookConceptShape,
  HookLanguage,
  IterationLever,
  NickCitation,
  VisualDiffVerdict,
  VisualDirection,
} from "./types";

// ------------------------------------------------------------
// Shared utilities
// ------------------------------------------------------------

/** Fixed set of iteration levers — must stay in sync with types.ts. */
const ALLOWED_ITERATION_LEVERS: readonly IterationLever[] = [
  "opening_beat",
  "first_frame",
  "actor_age",
  "actor_ethnicity",
  "format_style",
  "callout_wording",
] as const;

/** Cost per 1M tokens for the analysis model (Claude Sonnet 4.6 defaults). */
const COST_PER_MT_INPUT = 3;
const COST_PER_MT_OUTPUT = 15;
const COST_PER_MT_CACHED = 0.3;

function estimateCostUsd(promptTokens: number, completionTokens: number, cachedTokens = 0): number {
  const nonCachedInput = Math.max(0, promptTokens - cachedTokens);
  const cost =
    (nonCachedInput * COST_PER_MT_INPUT) / 1_000_000 +
    (cachedTokens * COST_PER_MT_CACHED) / 1_000_000 +
    (completionTokens * COST_PER_MT_OUTPUT) / 1_000_000;
  return Number(cost.toFixed(6));
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Strip markdown fences if the model wraps its JSON. */
function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return fence ? fence[1] : trimmed;
}

function safeString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function safeNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function toNickCitations(input: unknown, retrievedChunks: NickChunk[]): NickCitation[] {
  if (!Array.isArray(input)) return [];
  const byOrdinal = new Map<number, NickChunk>();
  retrievedChunks.forEach((c, i) => byOrdinal.set(i + 1, c));

  const out: NickCitation[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const ordinal = safeNumber(rec.ordinal);
    if (ordinal === null) continue;
    // Only trust ordinals that map back to a retrieved chunk to prevent
    // hallucinated citations. Otherwise skip.
    const chunk = byOrdinal.get(ordinal);
    if (!chunk) continue;
    out.push({
      ordinal,
      title: chunk.title,
      url: chunk.sourceUrl,
      similarity: chunk.similarity,
    });
  }
  return out;
}

function normaliseVisualDirection(v: unknown): VisualDirection | null {
  if (!v || typeof v !== "object") return null;
  const rec = v as Record<string, unknown>;
  const name = safeString(rec.name);
  const description = safeString(rec.description);
  if (!name || !description) return null;
  const shots = Array.isArray(rec.shotList)
    ? rec.shotList.filter((s): s is string => typeof s === "string")
    : [];
  const format = safeString(rec.format) as VisualDirection["format"] | null;
  const aspect = safeString(rec.aspectRatio) as VisualDirection["aspectRatio"] | null;
  const duration =
    typeof rec.durationSec === "number" && Number.isFinite(rec.durationSec)
      ? rec.durationSec
      : rec.durationSec === null
        ? null
        : undefined;

  return {
    name,
    description,
    shotList: shots,
    hypothesis: safeString(rec.hypothesis) ?? "",
    whyDifferent: safeString(rec.whyDifferent) ?? "",
    ...(format ? { format } : {}),
    ...(aspect ? { aspectRatio: aspect } : {}),
    ...(duration !== undefined ? { durationSec: duration } : {}),
  };
}

// ------------------------------------------------------------
// Generate mode — 3 big-swing concepts
// ------------------------------------------------------------

export interface GenerateHookConceptsInput {
  tenantId: string;
  userId: string;
  product: string;
  audience: string;
  desire: string;
  language: HookLanguage;
  awarenessStage?: string;
  sophisticationStage?: number;
  /** Optional control (winner) hook + body — used as swing target. */
  controlHookText?: string;
  controlBodyText?: string;
  controlVisualSummary?: string;
}

/**
 * Draft 3 big-swing concepts. Each concept changes at least one of
 * angle/avatar/awareness/sophistication/desire from control. Each has
 * 3 visual directions (3-ads-per-adset).
 */
export async function generateHookConcepts(
  input: GenerateHookConceptsInput,
): Promise<HookConceptShape[]> {
  const nickQuery =
    `hook big swing ${input.desire} ${input.audience} ${input.product}`.trim();
  const nickChunks = await retrieveNickChunksForHook(nickQuery, 6);

  const system = [
    buildPromptWithCitations(HOOK_GENERATOR_PROMPT, nickChunks),
    "",
    LOCALE_DIRECTIVE(input.language),
  ].join("\n");

  // Any user-typed strings are wrapped as data with the sanitizer inside.
  const userPayload = {
    product: sanitizeUntrustedInput(input.product, 500),
    audience: sanitizeUntrustedInput(input.audience, 500),
    desire: sanitizeUntrustedInput(input.desire, 500),
    language: input.language,
    awarenessStage: input.awarenessStage ?? null,
    sophisticationStage: input.sophisticationStage ?? null,
    // Control (when provided) travels through wrapAsData so any embedded
    // instructions become opaque data blocks to the LLM.
    control_hook_wrapped: input.controlHookText
      ? wrapAsData(input.controlHookText, "control_hook")
      : null,
    control_body_wrapped: input.controlBodyText
      ? wrapAsData(input.controlBodyText, "control_body")
      : null,
    control_visual_summary: input.controlVisualSummary
      ? sanitizeUntrustedInput(input.controlVisualSummary, 800)
      : null,
  };

  const res = await aiChat({
    role: "analysis",
    system,
    messages: [{ role: "user", content: JSON.stringify(userPayload) }],
    temperature: 0.8,
    maxTokens: 4000,
  });

  const parsedRaw = JSON.parse(extractJson(res.content));
  const conceptsArray = Array.isArray(parsedRaw)
    ? parsedRaw
    : Array.isArray((parsedRaw as { concepts?: unknown[] }).concepts)
      ? (parsedRaw as { concepts: unknown[] }).concepts
      : [];

  const generationId = randomUUID();
  const totalCost = estimateCostUsd(res.usage.promptTokens, res.usage.completionTokens);
  // Distribute the batch cost per row so the daily cost meter sums cleanly.
  const perRowCost =
    conceptsArray.length > 0 ? Number((totalCost / conceptsArray.length).toFixed(6)) : totalCost;
  const perRowPromptTokens = Math.round(res.usage.promptTokens / Math.max(1, conceptsArray.length));
  const perRowCompletionTokens = Math.round(
    res.usage.completionTokens / Math.max(1, conceptsArray.length),
  );

  const created: HookConceptShape[] = [];
  for (const rawConcept of conceptsArray) {
    if (!rawConcept || typeof rawConcept !== "object") continue;
    const rec = rawConcept as Record<string, unknown>;
    const visuals = Array.isArray(rec.visualDirections)
      ? rec.visualDirections
          .map(normaliseVisualDirection)
          .filter((v): v is VisualDirection => v !== null)
      : [];
    const citations = toNickCitations(rec.citations, nickChunks);
    const angleChange = (rec.angleChange && typeof rec.angleChange === "object"
      ? rec.angleChange
      : null) as HookConceptShape["angleChange"];

    const row = await prisma.hookConcept.create({
      data: {
        tenantId: input.tenantId,
        createdByUserId: input.userId,
        generationId,
        source: "generated",
        parentConceptId: null,
        textHookTh: safeString(rec.textHookTh),
        textHookEn: safeString(rec.textHookEn),
        bodyOutline: safeString(rec.bodyOutline),
        visualDirections: visuals.length > 0 ? (visuals as unknown as object) : undefined,
        leverChanged: null,
        hypothesis: safeString(rec.hypothesis),
        angleChange: angleChange ? (angleChange as unknown as object) : undefined,
        awarenessStage: safeString(rec.awarenessStage) ?? input.awarenessStage ?? null,
        sophisticationStage:
          safeNumber(rec.sophisticationStage) ?? input.sophisticationStage ?? null,
        avatar: safeString(rec.avatar),
        controlHookText: input.controlHookText ?? null,
        controlBodyText: input.controlBodyText ?? null,
        alignmentScore: null,
        alignmentVerdict: null,
        visualDiffVerdict: null,
        andromedaRisk: null,
        andromedaOverrideChosen: false,
        citations: citations.length > 0 ? (citations as unknown as object) : undefined,
        status: "draft",
        notes: null,
        promptTokens: perRowPromptTokens,
        completionTokens: perRowCompletionTokens,
        costUsd: perRowCost,
      },
    });

    created.push(rowToConceptShape(row));
  }

  return created;
}

// ------------------------------------------------------------
// Iterate mode — 3–5 single-lever variations of a winner
// ------------------------------------------------------------

export interface GenerateIterationsInput {
  tenantId: string;
  userId: string;
  winnerSource: "meta" | "pasted" | "savedConceptId";
  winnerTextHook: string;
  winnerBody: string;
  winnerVisualSummary?: string;
  winnerDominantAttributes?: string[];
  iterationCount: 3 | 4 | 5;
  /** Levers the user pinned — AI must NOT swing these. */
  lockedLevers?: IterationLever[];
  language: HookLanguage;
  /** Only populated when winnerSource === "savedConceptId". */
  parentConceptId?: string;
}

/**
 * Draft N iterations. Each swings exactly ONE lever from the fixed union
 * and MUST include a hypothesis ("no iteration without hypothesis" — Nick's rule).
 */
export async function generateIterations(
  input: GenerateIterationsInput,
): Promise<HookConceptShape[]> {
  const nickQuery =
    `iterate winner hook one lever ${input.winnerTextHook}`.trim();
  const nickChunks = await retrieveNickChunksForHook(nickQuery, 5);

  const system = [
    buildPromptWithCitations(HOOK_ITERATOR_PROMPT, nickChunks),
    "",
    LOCALE_DIRECTIVE(input.language),
  ].join("\n");

  // Sanitize + wrap all pasted winner text as data. Both the pasted AND
  // meta paths get wrapped — reviewer tweak #5 says sanitize both.
  const userPayload = {
    winner_hook_wrapped: wrapAsData(input.winnerTextHook, "winner_hook"),
    winner_body_wrapped: wrapAsData(input.winnerBody, "winner_body"),
    winner_visual_wrapped: input.winnerVisualSummary
      ? wrapAsData(input.winnerVisualSummary, "winner_visual")
      : null,
    winner_dominant_attributes: Array.isArray(input.winnerDominantAttributes)
      ? input.winnerDominantAttributes.slice(0, 10).map((s) => sanitizeUntrustedInput(s, 80))
      : [],
    iterationCount: input.iterationCount,
    lockedLevers: (input.lockedLevers ?? []).filter((l) =>
      ALLOWED_ITERATION_LEVERS.includes(l),
    ),
    language: input.language,
    winnerSource: input.winnerSource,
  };

  const res = await aiChat({
    role: "analysis",
    system,
    messages: [{ role: "user", content: JSON.stringify(userPayload) }],
    temperature: 0.7,
    maxTokens: 4000,
  });

  const parsedRaw = JSON.parse(extractJson(res.content));
  const arr = Array.isArray(parsedRaw)
    ? parsedRaw
    : Array.isArray((parsedRaw as { iterations?: unknown[] }).iterations)
      ? (parsedRaw as { iterations: unknown[] }).iterations
      : [];

  const generationId = randomUUID();
  const totalCost = estimateCostUsd(res.usage.promptTokens, res.usage.completionTokens);
  const perRowCost = arr.length > 0 ? Number((totalCost / arr.length).toFixed(6)) : totalCost;
  const perRowPromptTokens = Math.round(res.usage.promptTokens / Math.max(1, arr.length));
  const perRowCompletionTokens = Math.round(
    res.usage.completionTokens / Math.max(1, arr.length),
  );

  const created: HookConceptShape[] = [];
  for (const rawIter of arr) {
    if (!rawIter || typeof rawIter !== "object") continue;
    const rec = rawIter as Record<string, unknown>;
    const lever = safeString(rec.leverChanged);
    const isValidLever =
      lever !== null && ALLOWED_ITERATION_LEVERS.includes(lever as IterationLever);
    if (!isValidLever) continue;
    if (input.lockedLevers?.includes(lever as IterationLever)) continue;

    // Iteration prompt returns a single visualDirection (not an array).
    const singleVisual = normaliseVisualDirection(rec.visualDirection);
    const visuals = singleVisual ? [singleVisual] : [];
    const citations = toNickCitations(rec.citations, nickChunks);
    const hypothesis = safeString(rec.hypothesis);
    if (!hypothesis || hypothesis.length < 30) continue;

    const row = await prisma.hookConcept.create({
      data: {
        tenantId: input.tenantId,
        createdByUserId: input.userId,
        generationId,
        source: "iteration",
        parentConceptId: input.parentConceptId ?? null,
        textHookTh: safeString(rec.textHookTh),
        textHookEn: safeString(rec.textHookEn),
        bodyOutline: safeString(rec.bodyOutline),
        visualDirections: visuals.length > 0 ? (visuals as unknown as object) : undefined,
        leverChanged: lever,
        hypothesis,
        angleChange: undefined,
        awarenessStage: null,
        sophisticationStage: null,
        avatar: null,
        controlHookText: input.winnerTextHook,
        controlBodyText: input.winnerBody,
        alignmentScore: null,
        alignmentVerdict: null,
        visualDiffVerdict: null,
        andromedaRisk: null,
        andromedaOverrideChosen: false,
        citations: citations.length > 0 ? (citations as unknown as object) : undefined,
        status: "draft",
        notes: null,
        promptTokens: perRowPromptTokens,
        completionTokens: perRowCompletionTokens,
        costUsd: perRowCost,
      },
    });

    created.push(rowToConceptShape(row));
  }

  return created;
}

// ------------------------------------------------------------
// Analyze mode — score paste + rewrites
// ------------------------------------------------------------

export interface AnalyzeHookInput {
  tenantId: string;
  userId: string;
  textHook: string;
  controlHookText?: string;
  controlBodyText?: string;
  imageUrl?: string;
  product?: string;
  audience?: string;
  /** Optional body outline to score body-hook alignment against. */
  bodyOutline?: string;
  /** Locale used for LOCALE_DIRECTIVE; defaults to "both". */
  language?: HookLanguage;
}

/**
 * Score a pasted hook on 3 Golden-Formula axes + body-hook alignment,
 * return heuristic Andromeda risk + 3 rewrite suggestions.
 */
export async function analyzeHook(input: AnalyzeHookInput): Promise<HookAnalysisShape> {
  const lang = input.language ?? "both";
  const nickQuery =
    `analyze hook ${input.product ?? ""} ${input.audience ?? ""} ${input.textHook}`.trim();
  const nickChunks = await retrieveNickChunksForHook(nickQuery, 5);

  const system = [
    buildPromptWithCitations(HOOK_ANALYZER_PROMPT, nickChunks),
    "",
    LOCALE_DIRECTIVE(lang),
  ].join("\n");

  const userPayload = {
    new_hook_wrapped: wrapAsData(input.textHook, "new_hook"),
    new_body_wrapped: input.bodyOutline ? wrapAsData(input.bodyOutline, "new_body") : null,
    control_hook_wrapped: input.controlHookText
      ? wrapAsData(input.controlHookText, "control_hook")
      : null,
    control_body_wrapped: input.controlBodyText
      ? wrapAsData(input.controlBodyText, "control_body")
      : null,
    product: input.product ? sanitizeUntrustedInput(input.product, 300) : null,
    audience: input.audience ? sanitizeUntrustedInput(input.audience, 300) : null,
    image_url: input.imageUrl ?? null,
    language: lang,
  };

  const res = await aiChat({
    role: "analysis",
    system,
    messages: [{ role: "user", content: JSON.stringify(userPayload) }],
    temperature: 0.2,
    maxTokens: 2000,
  });

  const parsed = JSON.parse(extractJson(res.content)) as {
    scoreStopScroll?: number;
    scoreCuriosity?: number;
    scoreBenefit?: number;
    scoreAlignment?: number;
    verdict?: string;
    reasoning?: Partial<AnalysisAxisReasoning>;
    rewrites?: unknown[];
    andromedaRisk?: string;
    andromedaReasoning?: string;
    citations?: unknown[];
  };

  const clampScore = (n: unknown): number => {
    const v = typeof n === "number" ? Math.round(n) : 3;
    return Math.max(1, Math.min(5, v));
  };

  const scoreStopScroll = clampScore(parsed.scoreStopScroll);
  const scoreCuriosity = clampScore(parsed.scoreCuriosity);
  const scoreBenefit = clampScore(parsed.scoreBenefit);
  const scoreAlignment = clampScore(parsed.scoreAlignment);

  const reasoning: AnalysisAxisReasoning = {
    stopScroll: parsed.reasoning?.stopScroll ?? "",
    curiosity: parsed.reasoning?.curiosity ?? "",
    benefit: parsed.reasoning?.benefit ?? "",
    alignment: parsed.reasoning?.alignment ?? "",
  };

  const rewrites: AnalysisRewrite[] = Array.isArray(parsed.rewrites)
    ? parsed.rewrites
        .map((r) => {
          if (!r || typeof r !== "object") return null;
          const rec = r as Record<string, unknown>;
          const text = safeString(rec.text);
          if (!text) return null;
          return {
            text,
            angle: safeString(rec.angle) ?? "",
            whyBetter: safeString(rec.whyBetter) ?? "",
          };
        })
        .filter((x): x is AnalysisRewrite => x !== null)
        .slice(0, 5)
    : [];

  const risk: AndromedaRisk =
    parsed.andromedaRisk === "LOW" ||
    parsed.andromedaRisk === "MEDIUM" ||
    parsed.andromedaRisk === "HIGH"
      ? parsed.andromedaRisk
      : "MEDIUM";

  const citations = toNickCitations(parsed.citations, nickChunks);
  const cost = estimateCostUsd(res.usage.promptTokens, res.usage.completionTokens);

  const row = await prisma.hookAnalysis.create({
    data: {
      tenantId: input.tenantId,
      createdByUserId: input.userId,
      inputTextHook: input.textHook,
      controlHookText: input.controlHookText ?? null,
      controlBodyText: input.controlBodyText ?? null,
      imageUrl: input.imageUrl ?? null,
      product: input.product ?? null,
      audience: input.audience ?? null,
      scoreStopScroll,
      scoreCuriosity,
      scoreBenefit,
      scoreAlignment,
      verdict: parsed.verdict ?? "yellow",
      reasoning: reasoning as unknown as object,
      rewrites: rewrites as unknown as object,
      andromedaRisk: risk,
      andromedaReasoning: parsed.andromedaReasoning ?? null,
      citations: citations as unknown as object,
      promptTokens: res.usage.promptTokens,
      completionTokens: res.usage.completionTokens,
      costUsd: cost,
    },
  });

  return {
    id: row.id,
    tenantId: row.tenantId,
    createdByUserId: row.createdByUserId,
    inputTextHook: row.inputTextHook,
    controlHookText: row.controlHookText,
    controlBodyText: row.controlBodyText,
    imageUrl: row.imageUrl,
    product: row.product,
    audience: row.audience,
    scoreStopScroll: row.scoreStopScroll,
    scoreCuriosity: row.scoreCuriosity,
    scoreBenefit: row.scoreBenefit,
    scoreAlignment: row.scoreAlignment,
    verdict: row.verdict,
    reasoning,
    rewrites,
    andromedaRisk: risk,
    andromedaReasoning: row.andromedaReasoning,
    citations,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    costUsd: row.costUsd,
    createdAt: row.createdAt.toISOString(),
  };
}

// ------------------------------------------------------------
// Plan Visuals mode — 3 visual directions for a text hook
// ------------------------------------------------------------

export interface PlanVisualDirectionsInput {
  tenantId: string;
  userId: string;
  textHook: string;
  format: "video" | "static";
  aspectRatio: "9:16" | "1:1" | "4:5";
  /** "iteration" biases prompt to keep close; "big_swing" pushes distinct. */
  intent?: "iteration" | "big_swing";
  product?: string;
  audience?: string;
  language?: HookLanguage;
}

export async function planVisualDirections(
  input: PlanVisualDirectionsInput,
): Promise<VisualDirection[]> {
  const lang = input.language ?? "both";
  const nickQuery = `visual direction ${input.textHook} ${input.audience ?? ""}`;
  const nickChunks = await retrieveNickChunksForHook(nickQuery, 4);

  const system = [
    buildPromptWithCitations(VISUAL_PLANNER_PROMPT, nickChunks),
    "",
    LOCALE_DIRECTIVE(lang),
  ].join("\n");

  const userPayload = {
    text_hook: sanitizeUntrustedInput(input.textHook, 500),
    format: input.format,
    aspectRatio: input.aspectRatio,
    intent: input.intent ?? "big_swing",
    product: input.product ? sanitizeUntrustedInput(input.product, 300) : null,
    audience: input.audience ? sanitizeUntrustedInput(input.audience, 300) : null,
    language: lang,
  };

  const res = await aiChat({
    role: "analysis",
    system,
    messages: [{ role: "user", content: JSON.stringify(userPayload) }],
    temperature: 0.7,
    maxTokens: 2000,
  });

  const parsedRaw = JSON.parse(extractJson(res.content));
  const arr = Array.isArray(parsedRaw)
    ? parsedRaw
    : Array.isArray((parsedRaw as { directions?: unknown[] }).directions)
      ? (parsedRaw as { directions: unknown[] }).directions
      : [];

  return arr
    .map(normaliseVisualDirection)
    .filter((v): v is VisualDirection => v !== null)
    .slice(0, 3);
}

// ------------------------------------------------------------
// Heuristic Andromeda check — body-hook alignment + visual attribute diff
// ------------------------------------------------------------

export interface HeuristicCheckInput {
  tenantId: string;
  controlHookText?: string;
  controlBodyText?: string;
  controlVisualSummary?: string;
  controlDominantAttributes?: string[];
  previousWinnerVisualSummaries?: string[];
  newTextHook: string;
  newBody?: string;
  newVisualDirections?: VisualDirection[];
  language: HookLanguage;
}

/**
 * Combined heuristic check. Called debounced on typing and synchronously
 * before Save. Returns combinedRisk (LOW/MEDIUM/HIGH) + reasoning +
 * suggestion. HIGH triggers the warn+confirm modal — never a hard block.
 */
export async function checkHeuristic(
  input: HeuristicCheckInput,
): Promise<AndromedaCheckResult> {
  // Alignment via existing helper (uses BODY_HOOK_ALIGNMENT_PROMPT).
  const alignment = input.newBody
    ? await checkBodyHookAlignment(input.newTextHook, input.newBody, input.language)
    : {
        alignmentScore: 0.5,
        alignmentVerdict: "partial" as AlignmentVerdict,
        sharedNouns: [] as string[],
        missingNouns: [] as string[],
        suggestion: "No body outline provided; alignment check skipped.",
      };

  // Visual diff via VISUAL_ATTRIBUTE_DIFF_PROMPT.
  const visualPayload = {
    proposed_visual_directions: input.newVisualDirections ?? [],
    control_visual_summary: input.controlVisualSummary ?? null,
    control_dominant_attributes: input.controlDominantAttributes ?? null,
    previous_winner_visual_summaries: input.previousWinnerVisualSummaries ?? [],
  };

  const visualRes = await aiChat({
    role: "analysis",
    system: VISUAL_ATTRIBUTE_DIFF_PROMPT,
    messages: [{ role: "user", content: JSON.stringify(visualPayload) }],
    temperature: 0.2,
    maxTokens: 700,
  });

  const visualParsed = JSON.parse(extractJson(visualRes.content)) as {
    sharedAttributes?: unknown;
    differentAttributes?: unknown;
    verdict?: string;
    reasoning?: string;
  };

  const shared = Array.isArray(visualParsed.sharedAttributes)
    ? visualParsed.sharedAttributes.filter((s): s is string => typeof s === "string")
    : [];
  const different = Array.isArray(visualParsed.differentAttributes)
    ? visualParsed.differentAttributes.filter((s): s is string => typeof s === "string")
    : [];
  const visualVerdict: VisualDiffVerdict =
    visualParsed.verdict === "clearly-different" ||
    visualParsed.verdict === "partial-swing" ||
    visualParsed.verdict === "same-visual-bucket"
      ? visualParsed.verdict
      : "partial-swing";

  const combinedRisk: AndromedaRisk = computeCombinedRisk(
    alignment.alignmentVerdict,
    visualVerdict,
  );

  const reasoningParts: string[] = [];
  if (visualParsed.reasoning) reasoningParts.push(visualParsed.reasoning);
  reasoningParts.push(
    `Body-hook alignment: ${alignment.alignmentVerdict} (score ${alignment.alignmentScore.toFixed(2)}). Heuristic estimate — guidance, not guarantee.`,
  );

  return {
    alignmentScore: alignment.alignmentScore,
    alignmentVerdict: alignment.alignmentVerdict,
    visualDiff: {
      sharedAttributes: shared,
      differentAttributes: different,
      verdict: visualVerdict,
    },
    combinedRisk,
    reasoning: reasoningParts.join(" "),
    suggestion: alignment.suggestion || suggestionForVisualVerdict(visualVerdict),
  };
}

function computeCombinedRisk(
  alignment: AlignmentVerdict,
  visual: VisualDiffVerdict,
): AndromedaRisk {
  // Nick's #1 punished pattern: aligned=false + visually similar => HIGH.
  if (alignment === "misaligned" && visual === "same-visual-bucket") return "HIGH";
  if (alignment === "misaligned" || visual === "same-visual-bucket") return "HIGH";
  if (alignment === "partial" || visual === "partial-swing") return "MEDIUM";
  return "LOW";
}

function suggestionForVisualVerdict(v: VisualDiffVerdict): string {
  if (v === "same-visual-bucket") {
    return "Change ethnicity, format, or opening beat so the visual clearly reads as a different bucket. Heuristic guidance, not guarantee.";
  }
  if (v === "partial-swing") {
    return "Push one more visual attribute (ethnicity or format) further from the control to clarify the swing.";
  }
  return "";
}

// ------------------------------------------------------------
// Private helpers — DB row → API shape
// ------------------------------------------------------------

type HookConceptRow = Awaited<ReturnType<typeof prisma.hookConcept.findFirst>>;

function rowToConceptShape(row: NonNullable<HookConceptRow>): HookConceptShape {
  return {
    id: row.id,
    tenantId: row.tenantId,
    createdByUserId: row.createdByUserId,
    generationId: row.generationId,
    source: (row.source as HookConceptShape["source"]) ?? "generated",
    parentConceptId: row.parentConceptId,
    textHookTh: row.textHookTh,
    textHookEn: row.textHookEn,
    bodyOutline: row.bodyOutline,
    visualDirections: (row.visualDirections as VisualDirection[] | null) ?? null,
    leverChanged: (row.leverChanged as IterationLever | null) ?? null,
    hypothesis: row.hypothesis,
    angleChange: (row.angleChange as HookConceptShape["angleChange"]) ?? null,
    awarenessStage: row.awarenessStage,
    sophisticationStage: row.sophisticationStage,
    avatar: row.avatar,
    controlHookText: row.controlHookText,
    controlBodyText: row.controlBodyText,
    alignmentScore: row.alignmentScore,
    alignmentVerdict: (row.alignmentVerdict as AlignmentVerdict | null) ?? null,
    visualDiffVerdict: (row.visualDiffVerdict as VisualDiffVerdict | null) ?? null,
    andromedaRisk: (row.andromedaRisk as AndromedaRisk | null) ?? null,
    andromedaOverrideChosen: row.andromedaOverrideChosen,
    citations: (row.citations as NickCitation[] | null) ?? null,
    status: (row.status as HookConceptShape["status"]) ?? "draft",
    notes: row.notes,
    metaCampaignId: row.metaCampaignId,
    metaAdSetId: row.metaAdSetId,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    costUsd: row.costUsd,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Public re-export so routes can reuse the same row → shape mapping. */
export { rowToConceptShape };

/** Exposed to routes that need to synthesise a timestamp compatible with the shape. */
export const _nowIso = nowIso;
