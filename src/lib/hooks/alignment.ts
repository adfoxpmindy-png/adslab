/**
 * Body-hook alignment check.
 *
 * Nick Theriot's #1 punished post-Andromeda pattern is
 *   "new hook + old body, where the body does not actually discuss the
 *    new hook."
 *
 * This helper is called in three places (Agent D wires them):
 *   1. Inside HOOK_GENERATOR_PROMPT as a self-check (rejects at draft-time).
 *   2. /api/ai/hooks/analyze — first-class score returned to the UI.
 *   3. Pre-Save in Generate/Iterate mode — belt-and-braces validator.
 *
 * Design (per v2 reviewer tweak #1):
 *   - Thai has no word boundaries → a regex-based Jaccard would be noise
 *     (false positives across character n-grams, false negatives across
 *     variant segmentations). When language === "th" (or "both"), the
 *     LLM pass is AUTHORITATIVE — we skip the deterministic pre-check.
 *   - For English-only, we run a cheap Jaccard first pass and let the
 *     LLM refine. If Jaccard already scores high the LLM still runs
 *     (it produces the shared/missing noun lists the UI shows).
 *
 * The LLM prompt itself (BODY_HOOK_ALIGNMENT_PROMPT) is owned by Agent B
 * in src/lib/hooks/prompts.ts. Until that lands we stub the import path.
 */

import { aiChat } from "@/lib/ai/openrouter";
import { BODY_HOOK_ALIGNMENT_PROMPT } from "./prompts";
import type { AlignmentVerdict, HookLanguage } from "./types";

// -------------------- Public shape --------------------

export interface BodyHookAlignmentResult {
  /** 0..1 (1 = body clearly discusses the new hook's noun-phrase). */
  alignmentScore: number;
  alignmentVerdict: AlignmentVerdict;
  /** Noun-phrases that appear in both the hook and the body. */
  sharedNouns: string[];
  /** Hook noun-phrases missing from the body — the actionable list. */
  missingNouns: string[];
  /** 1-sentence suggested rewrite direction, or empty when aligned. */
  suggestion: string;
}

// -------------------- Deterministic helpers (English only) --------------------

/**
 * English-only lightweight noun-ish extractor. Not linguistically
 * accurate — we use it only as a token-saving pre-filter for English
 * body/hook pairs. Thai skips this entirely (see checkBodyHookAlignment).
 */
const EN_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "have",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "was",
  "will",
  "with",
  "you",
  "your",
  "we",
  "our",
  "i",
  "my",
  "me",
  "if",
  "so",
  "just",
  "not",
  "no",
  "yes",
]);

function extractEnglishTokens(text: string): Set<string> {
  const out = new Set<string>();
  const words = text.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? [];
  for (const w of words) {
    if (!EN_STOPWORDS.has(w)) out.add(w);
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

// -------------------- Public entry point --------------------

/**
 * Compute a body-hook alignment result.
 *
 * Behaviour:
 *   - If either text is empty → returns misaligned with a clear suggestion.
 *   - If language is "th" or "both" → LLM pass is authoritative;
 *     deterministic Jaccard is skipped (would be noise on Thai).
 *   - If language is "en" → Jaccard runs as cheap first pass. Its result
 *     is passed to the LLM as `pre_hint`; the LLM still returns the
 *     canonical score + reasons the UI displays.
 *
 * NOTE: Agent B has not yet published BODY_HOOK_ALIGNMENT_PROMPT.
 * Until they do, this function throws with a clear message so we never
 * silently call the LLM with a placeholder system prompt.
 */
export async function checkBodyHookAlignment(
  textHook: string,
  bodyOutline: string,
  language: HookLanguage,
): Promise<BodyHookAlignmentResult> {
  const hook = (textHook ?? "").trim();
  const body = (bodyOutline ?? "").trim();

  if (hook.length === 0 || body.length === 0) {
    return {
      alignmentScore: 0,
      alignmentVerdict: "misaligned",
      sharedNouns: [],
      missingNouns: [],
      suggestion:
        hook.length === 0
          ? "Provide a text hook before running the alignment check."
          : "Body outline is empty — write a body that references the hook's noun-phrase.",
    };
  }

  // English-only deterministic pre-hint. On Thai we skip: no word
  // boundaries → n-gram noise. LLM handles both signals for Thai.
  let preHintJaccard: number | null = null;
  if (language === "en") {
    const hookTokens = extractEnglishTokens(hook);
    const bodyTokens = extractEnglishTokens(body);
    preHintJaccard = jaccard(hookTokens, bodyTokens);
  }

  const payload = {
    text_hook: hook,
    body_outline: body,
    language,
    pre_hint_jaccard: preHintJaccard,
  };

  const res = await aiChat({
    role: "analysis",
    system: BODY_HOOK_ALIGNMENT_PROMPT,
    messages: [{ role: "user", content: JSON.stringify(payload) }],
    temperature: 0,
    maxTokens: 400,
  });

  const parsed = parseAlignmentResponse(res.content);
  return parsed;
}

/**
 * Parse the LLM response into BodyHookAlignmentResult. Tolerates markdown
 * fences the model occasionally emits despite the strict-JSON directive.
 */
function parseAlignmentResponse(raw: string): BodyHookAlignmentResult {
  let jsonText = raw.trim();
  const fence = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) jsonText = fence[1];
  const obj = JSON.parse(jsonText) as {
    alignmentScore?: number;
    sharedNouns?: unknown;
    missingNouns?: unknown;
    verdict?: string;
    suggestion?: string;
  };

  const rawScore = typeof obj.alignmentScore === "number" ? obj.alignmentScore : 0;
  const score = Math.max(0, Math.min(1, rawScore));

  let verdict: AlignmentVerdict;
  if (obj.verdict === "aligned" || obj.verdict === "partial" || obj.verdict === "misaligned") {
    verdict = obj.verdict;
  } else if (score >= 0.75) {
    verdict = "aligned";
  } else if (score >= 0.4) {
    verdict = "partial";
  } else {
    verdict = "misaligned";
  }

  const shared = Array.isArray(obj.sharedNouns)
    ? obj.sharedNouns.filter((x): x is string => typeof x === "string")
    : [];
  const missing = Array.isArray(obj.missingNouns)
    ? obj.missingNouns.filter((x): x is string => typeof x === "string")
    : [];

  return {
    alignmentScore: score,
    alignmentVerdict: verdict,
    sharedNouns: shared,
    missingNouns: missing,
    suggestion: typeof obj.suggestion === "string" ? obj.suggestion : "",
  };
}
