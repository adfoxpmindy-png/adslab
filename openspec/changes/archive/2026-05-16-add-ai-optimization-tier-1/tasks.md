# Tasks — add-ai-optimization-tier-1

## 1. Data model

- [ ] 1.1 Add `AIRecommendation` model to `prisma/schema.prisma` — fields: id, tenantId, source (enum-as-string), actionType, targetMetaId, targetKind (campaign/adset/ad), reasoning, payload JSON, createdAt, createdByUserId? (null for cron/AI-only), conversationId? (when sourced from chat)
- [ ] 1.2 Add `AIRecommendationOutcome` model — fields: id, recommendationId (FK), tickAt, actionTaken (enum), kpiDelta JSON?, errorMessage?, createdAt. One-to-one with AIRecommendation.
- [ ] 1.3 Add `creativeAnalysis Json?` + `creativeAnalyzedAt DateTime?` columns to `MetaAd`.
- [ ] 1.4 `prisma db push` + verify on Neon prod.
- [ ] 1.5 `prisma generate`.

## 2. Recommendation capture

- [ ] 2.1 `src/lib/ai/recommendations.ts` — module exports `captureRecommendation(args)` and `listRecentForTenant(tenantId, limit)`.
- [ ] 2.2 Hook into `extractAndValidateActions` in `src/lib/reports/extract-actions.ts`: when validated actions are produced, call `captureRecommendation` per action with `source: "daily_report"`.
- [ ] 2.3 Hook into chat tool dispatch (`src/lib/ai/chat-service.ts` or wherever pause/resume/budget tools live): when a mutate tool is invoked by the AI, call `captureRecommendation` with `source: "chat_tool"` regardless of subsequent user approve/reject.
- [ ] 2.4 Hook into `/api/rules/suggest` candidate creation: call `captureRecommendation` per candidate the user accepts with `source: "rules_suggest"`.

## 3. Outcome computation

- [ ] 3.1 `src/lib/ai/outcomes.ts` — module exports `computeOutcomesForTenant(tenantId)`. Fetches recs older than 7 days without outcome rows; for each, computes actionTaken + kpiDelta.
- [ ] 3.2 `actionTaken` detection logic:
  - "pause" → check target's `effective_status` now (PAUSED = followed; ACTIVE = ignored)
  - "scale_budget" → check campaign's current daily/lifetime budget vs at-rec-time (the existing MetaCampaign rows snapshot at fetch time — use that)
  - "refresh_creative" → look for any MetaAd row under the target adset created after the rec's createdAt
  - "diagnose" → not an action, never produces outcome row (skip)
  - Target deleted in Meta → `actionTaken: "target_deleted"`
- [ ] 3.3 KPI delta logic: pull insight cache for [rec.createdAt - 7d, rec.createdAt) and [rec.createdAt, rec.createdAt + 7d). For the rec's primary KPI (derived from actionType), compute before/after/percentChange.
- [ ] 3.4 Persist outcome rows; index `(recommendationId)` unique.

## 4. Cron piggyback

- [ ] 4.1 Extend `src/app/api/cron/daily-report/route.ts` to call `computeOutcomesForTenant` for each tenant AFTER the report + rules tick blocks. Per-tenant try/catch.
- [ ] 4.2 Verify no impact on existing daily-report execution time when zero outcomes pending.

## 5. Prompt-injection feedback

- [ ] 5.1 Add `fetchTenantRecOutcomes(tenantId, limit=10)` helper to `recommendations.ts`.
- [ ] 5.2 In `daily-report.ts`, before calling Claude, attach a "Previously recommended for this tenant" block: 5-10 most recent outcomes with actionTaken + kpiDelta. Skip if empty.
- [ ] 5.3 In `chat-service.ts` system prompt builder, attach the same block to the system prompt (cached the same way the rest of system prompt is). Skip if empty.
- [ ] 5.4 Update DAILY_REPORT_SYSTEM_PROMPT + chat system prompt to instruct: "When you have an outcomes history, prefer recommendation patterns that previously worked for this tenant. Mention patterns that failed only when proposing a different angle."
- [ ] 5.5 Feature-flag both consumers behind `FEATURE_AI_LEARNING` env var; default off until validated.

## 6. Vision tool

- [ ] 6.1 `src/lib/ai/tools/analyze-ad-creative.ts` — defineTool with input schema `{ adId: string }`.
- [ ] 6.2 Handler: fetch creative via Meta Graph API (`/${adId}?fields=creative{id,thumbnail_url,image_url,video_id}`). Resolve highest-quality URL.
- [ ] 6.3 Check `MetaAd.creativeAnalyzedAt > now - 7d`: if cached, return `{ cached: true, ...stored analysis }`.
- [ ] 6.4 Check tenant daily quota (count rows from analysis log table or just count `creativeAnalyzedAt updated today` — simpler with a small in-memory counter for now).
- [ ] 6.5 Build vision prompt: structured evaluation request asking for hook, visualHierarchy, textLegibility, emotionalTone, dominantColor, weaknesses, strengths, suggestedFixes.
- [ ] 6.6 Call `aiChat({ role: "analysis", system: VISION_PROMPT, messages: [{ role: "user", content: [...image, ...text] }] })`.
- [ ] 6.7 Parse + validate response JSON.
- [ ] 6.8 Persist on `MetaAd.creativeAnalysis` with `creativeAnalyzedAt = now`.
- [ ] 6.9 Register tool in `src/lib/ai/tools/registry.ts`.

## 7. System prompt updates for vision

- [ ] 7.1 In `chat-service.ts`, instruct AI:
  - Call `analyzeAdCreative` when the user references a specific ad (not generic strategy questions).
  - Call it during a diagnose flow on at least one ad in the underperforming adset.
  - Don't speculatively call for every ad in `listCampaigns` output.
- [ ] 7.2 In `daily-report.ts` prompt: instruct AI that if it includes 🎨 Creative diagnosis, it MAY reference visual properties (it has the tool to look at them).

## 8. Cost guards

- [ ] 8.1 Soft per-tenant quota: 50 vision calls / day (configurable per-tier later). Count by querying `MetaAd` rows updated today via `creativeAnalyzedAt`.
- [ ] 8.2 When quota hit, tool returns `{ error: "quota_exceeded", limit, resetsAt }`; AI fallback instruction in system prompt.

## 9. Testing

- [ ] 9.1 Write `scripts/test-ai-learning-loop.ts` — create fake recommendation, simulate 7-day-old state, run computeOutcomes, assert outcome row written.
- [ ] 9.2 Write `scripts/test-vision-tool.ts` — call analyzeAdCreative against a known ad id from the founder's account, assert structured response.
- [ ] 9.3 Type-check + push.
- [ ] 9.4 Manual smoke: open AI chat, ask "diagnose adset X" — verify the AI calls analyzeAdCreative AND searchKnowledge.

## 10. Deploy + canary

- [ ] 10.1 Deploy with `FEATURE_AI_VISION=on, FEATURE_AI_LEARNING=off` initially.
- [ ] 10.2 Validate vision quality on 5-10 real ads, tune prompt if hallucinations.
- [ ] 10.3 Wait 7 days for first outcomes to accumulate.
- [ ] 10.4 Flip `FEATURE_AI_LEARNING=on`; observe whether report quality improves.

## 11. OpenSpec archive

- [ ] 11.1 Mark tasks complete.
- [ ] 11.2 `openspec status` confirms 4/4 artifacts done.
- [ ] 11.3 Sync delta specs to `openspec/specs/ai-learning-loop/spec.md` + `openspec/specs/ai-vision-creative/spec.md`.
- [ ] 11.4 Archive change.

## Out-of-scope (proposed for follow-up — DO NOT build in this change)

- `add-ai-execution-tools-tier-2` — duplicateAdSetWithVariation, changeTargeting, pauseIndividualAd, swapCreative.
- `add-ai-insights-panel` — UI to browse recommendation history + outcomes.
- `add-ai-cross-tenant-patterns` — anonymized cross-tenant pattern learning.
