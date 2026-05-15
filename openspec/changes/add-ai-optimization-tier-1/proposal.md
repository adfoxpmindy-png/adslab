## Why

AdsLab's AI is currently ~60% effective at real ad optimization. Diagnosis quality is good (3-lever framework + Nick's playbook in RAG), but two structural gaps stop it from being a genuine "AI media buyer":

1. **The AI has no memory of its own recommendations.** Daily Report tells the user "pause this adset" — user does it — KPI moves — AI never finds out. Next time it diagnoses the same campaign, it doesn't know what worked or failed for THIS tenant. Generic Nick playbook beats per-tenant adaptation.

2. **The AI can't see creatives.** Every diagnosis assumes the creative is fine and the problem is elsewhere, or guesses from CTR/CPM proxies. Nick's actual core lesson — "creative is everything" — is unreachable because AI only sees metrics.

Closing these two gaps takes the AI from 60% to 85%+ effective. Closing them is also what differentiates AdsLab from any AI wrapper: real product moat = closed-loop optimization + multimodal understanding.

## What Changes

### (A) Outcome tracking + learning loop

- **New `AIRecommendation` model** — every concrete recommendation the AI emits is persisted: tenant, target entity (campaign/adset/ad), action class (pause / scale / refresh-creative / change-budget / change-targeting / diagnose), reasoning summary, source (daily-report / chat / rules-suggest), createdAt.
- **Daily Report capture** — existing `extractAndValidateActions` already produces a structured `suggested-actions` block. Extend it to write each action as an `AIRecommendation` row when the report is saved.
- **Chat capture** — when the AI calls a mutate tool (pauseCampaign, setBudget, duplicateCampaign), persist that as a recommendation too. The user's confirmation card decision (approve/reject) becomes the first signal of "did the user follow it".
- **New `AIRecommendationOutcome` model** — for each recommendation, after 7 days, compute the target entity's KPI delta (CPM/CTR/CPV/ROAS/spend) vs the 7-day window BEFORE the rec, plus the user's action (followed=PAUSE happened, or ignored, or did opposite). Persist as a separate row keyed to the rec.
- **New cron `/api/cron/recommendation-outcomes`** — piggybacks on existing daily-report cron (same Hobby-tier slot). For each rec older than 7 days that doesn't yet have an outcome row, compute + persist.
- **AI prompt injection** — when the next daily report or chat session generates a recommendation, append a "What's worked / what hasn't for this tenant" section to the user message: the last 5-10 recommendations + their outcomes. AI uses this to skew toward patterns that worked.

### (B) Vision creative analysis

- **New AI tool `analyzeAdCreative`** — takes an adId or creativeId, fetches `thumbnail_url` + `image_url` + `video_id` from Meta (via existing graph-api helpers), if a thumbnail/image URL is available sends it to Claude Sonnet's vision endpoint along with a structured prompt ("evaluate hook, visual hierarchy, text legibility, emotional tone, brand fit, on-screen-text count, dominant color, etc."), returns a structured JSON evaluation back to the model.
- **AI prompt integration** — system prompt instructs the model to call `analyzeAdCreative` whenever the user asks about a specific ad's creative, OR when diagnosing an underperforming adset (so the diagnose flow can include "and here's what's weak about the actual visual").
- **Cost guardrails** — vision calls are ~5-10× the cost of text-only calls. Cache vision evaluations on `MetaAd` via a new `creativeAnalysis` JSON column with 7-day TTL so repeated diagnoses of the same ad don't re-bill Claude.

### Out of scope (proposed only)

- Tier 2 expanded tool surface — `duplicateAdSetWithVariation`, `changeTargeting`, `pauseIndividualAd`, etc. Real Nick workflow gaps but architecturally larger. Spec proposal lives in a separate change to be built later (`add-ai-execution-tools-tier-2` — not created in this change).

## Capabilities

### New Capabilities
- `ai-learning-loop`: closed-loop optimization — AI records its own recommendations, observes outcomes after a holding period, and uses prior outcomes to ground future recommendations for the same tenant
- `ai-vision-creative`: AI tool that fetches the actual image/video of an ad and analyzes it via a vision-capable LLM, returning a structured evaluation usable in subsequent diagnosis

### Modified Capabilities
<!-- Both capabilities are net-new. The existing ai-quick-boost spec is untouched; system-knowledge-base is referenced (we still call searchKnowledge first), but its requirements don't change. -->

## Impact

- **New code**:
  - `src/lib/ai/recommendations.ts` — capture + read API for AIRecommendation
  - `src/lib/ai/outcomes.ts` — 7-day outcome computer (uses existing insight cache)
  - `src/app/api/cron/recommendation-outcomes/route.ts` (or piggyback on daily-report)
  - `src/lib/ai/tools/analyze-ad-creative.ts` — new MCP-style tool
  - Prompt updates in `chat-service.ts` + `reports/prompt.ts` to use the outcomes context
- **Schema**: 2 new models (`AIRecommendation` + `AIRecommendationOutcome`), 1 new column on `MetaAd` (`creativeAnalysis Json?`). Pure additive — `prisma db push`.
- **Cron**: no new slot needed — piggyback on existing daily-report (Hobby-friendly).
- **AI cost**: vision calls are non-trivial (~$0.003-0.01 each) but cached 7 days. At typical agency volume (~50 ad diagnoses/day across all tenants), ≤฿200/mo. Outcomes adds ~5% to daily-report token usage (small history context).
- **No UI surface changes** required for shipping — the existing `/ai` chat + Daily Report consume the new capabilities transparently. A future "Insights" panel could surface outcomes explicitly, but proposing that here is scope creep.
- **Backwards-compatible**: with no recommendations or analyses recorded yet, the AI behaves identically to today. Quality compounds as data accumulates.
