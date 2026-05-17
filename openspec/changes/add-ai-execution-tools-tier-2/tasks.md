## 1. Server-side action helpers

- [ ] 1.1 Create `src/lib/meta/adset-actions.ts` exporting `performAdSetAction({ tenantId, userId, adSetInternalId, action })` where `action` is `{ type: "PAUSE" | "RESUME" } | { type: "SET_BUDGET"; dailyBudget?: number; lifetimeBudget?: number }`. Mirrors `performCampaignAction` structure (resolve → validate → Meta POST → update local cache → return result). No new audit log table.
- [ ] 1.2 Create `src/lib/meta/ad-actions.ts` exporting `performAdAction({ tenantId, userId, adInternalId, action })` where `action` is `{ type: "PAUSE" | "RESUME" }`. Verifies ownership through ad → ad set → campaign → connection chain.
- [ ] 1.3 Reuse `MIN_BUDGET_THB` / `MAX_BUDGET_THB` / `thbToMinorUnits` from `campaign-actions.ts` — export those constants from there if not already.
- [ ] 1.4 Both helpers invalidate dashboard cache on success via `invalidateDashboardCache(tenantId)` (already used by campaign-actions).

## 2. AI tool files

- [ ] 2.1 `src/lib/ai/tools/pause-adset.ts` — Zod schema `{ adSetId: string }`, kind=mutate, summarize=`"หยุด ad set <id>"`, handler calls `performAdSetAction` with `PAUSE`.
- [ ] 2.2 `src/lib/ai/tools/resume-adset.ts` — same pattern, `RESUME`.
- [ ] 2.3 `src/lib/ai/tools/pause-ad.ts` — `{ adId: string }`, calls `performAdAction` with `PAUSE`.
- [ ] 2.4 `src/lib/ai/tools/set-adset-budget.ts` — `{ adSetId: string, dailyBudget?: number, lifetimeBudget?: number }`. Validation in the helper; tool just plumbs args.
- [ ] 2.5 `src/lib/ai/tools/duplicate-campaign.ts` — `{ campaignId: string, newName?: string, dailyBudget?: number, lifetimeBudget?: number, dailyBudgetMultiplier?: number, lifetimeBudgetMultiplier?: number, initialStatus?: "PAUSED" | "ACTIVE" }`. Wraps `duplicateCampaign` from `src/lib/meta/duplicate-campaign.ts`.

## 3. Register + wire

- [ ] 3.1 Import all 5 new tools in `src/lib/ai/tools/registry.ts` and add to the mutate section of the TOOLS array.
- [ ] 3.2 Extend `captureRecommendationFromToolCall` in `src/lib/ai/chat-service.ts` with mapping for the 5 new tool names.
- [ ] 3.3 Add 4 lines to `SYSTEM_PROMPT_BASE` in `chat-service.ts` instructing the AI when to choose each new tool over its campaign-level cousin.

## 4. Verify

- [ ] 4.1 `npx tsc --noEmit` — must be clean.
- [ ] 4.2 `npx eslint src/lib/ai/tools/ src/lib/meta/{adset,ad}-actions.ts` — clean.
- [ ] 4.3 Smoke test: in chat, ask "หยุด ad set XXX" → confirm card appears → approve → ad set actually pauses in Meta.

## 5. Ship + archive

- [ ] 5.1 Git commit with descriptive message; include the tool list.
- [ ] 5.2 Push to `main`.
- [ ] 5.3 Sync canonical spec: `mkdir -p openspec/specs/ai-execution-tools-tier-2 && cp openspec/changes/add-ai-execution-tools-tier-2/specs/ai-execution-tools-tier-2/spec.md openspec/specs/ai-execution-tools-tier-2/spec.md`
- [ ] 5.4 `mv openspec/changes/add-ai-execution-tools-tier-2 openspec/changes/archive/2026-05-17-add-ai-execution-tools-tier-2`
- [ ] 5.5 Commit archive + push.

## 6. Deferred (do NOT build in this change)

- 6.1 `changeTargeting` — needs safety design (audience-shift breaks Meta learning phase). Separate Tier 3 change.
- 6.2 `duplicateAdSetWithVariation` — UX is complex (creative permutations). Defer until requested.
- 6.3 Adset-level audit log table — chat-layer capture is sufficient for v1.
- 6.4 Bulk operations (multi-target pause / resume) — single-target only for safety.
