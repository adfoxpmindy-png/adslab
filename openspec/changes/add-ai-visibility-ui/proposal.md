## Why

The Tier 1 backend (learning loop + vision creative) ship'd 2026-05-16 makes AdsLab's AI measurably smarter, but **none of the value is visible to the user**. Recommendation history lives in the DB; outcomes are computed silently in cron; the vision tool is only reachable through chat. A non-programmer Thai operator opening the dashboard tomorrow sees the same UI as last week — no proof anything got better.

We need 4 UI surfaces that make the new capability **felt**, not just present:
1. A one-click "วิเคราะห์ภาพ" button on every ad row (vision tool out of the chat-only ghetto).
2. Outcome badges on past Daily Reports (so user sees "AI แนะนำ pause → ผมทำตาม → ROAS +40%").
3. Confidence badges on new recommendations (so user knows "AI เคยแนะนำแบบนี้ 8 ครั้ง สำเร็จ 75%").
4. An "AI Memory" page (rolling success rate, action-type breakdown, recent outcomes feed).

## What Changes

- **NEW** server action `analyzeAdCreativeAction(adId)` wrapping the existing `analyzeAdCreativeTool` handler, callable directly from UI (not just from AI). Same cache, same quota.
- **NEW** "วิเคราะห์ภาพ" button + result panel on ad rows in `/campaigns/[id]` and campaign-builder review screens.
- **NEW** outcome enrichment on Daily Report archive view (`/reports/[date]`): each historical suggestion shows ✅ / ❌ / ⏳ badge + KPI delta sourced from `AIRecommendationOutcome`.
- **NEW** confidence enrichment on fresh Daily Report recommendations: compute past-similar-action success rate (last 30 days, same `actionType`) and render as badge.
- **NEW** `/ai/memory` page: rolling weekly success rate trend, action-type breakdown ("pause works 9/9, refresh creative 3/8"), recent outcomes feed.
- **NEW** `lib/ai/recommendation-stats.ts` — small aggregation module computing rolling success rates and per-action breakdowns from `AIRecommendationOutcome`. Reused by both the Daily Report renderer and the Memory page.

No backend schema changes — everything reuses the `AIRecommendation` and `AIRecommendationOutcome` tables shipped in Tier 1.

## Capabilities

### New Capabilities
- `ai-visibility-ui`: User-facing surfaces that expose AI learning history, outcome tracking, and on-demand creative vision analysis. Covers the vision button, past-report outcome badges, new-rec confidence badges, and the Memory page.

### Modified Capabilities
None at spec level. The underlying capabilities (`ai-learning-loop`, `ai-vision-creative`) keep their existing requirements — this change only adds rendering surfaces on top.

## Impact

- **Affected routes**: `/campaigns/[id]/*` (vision button), `/reports/[date]` (outcome badges), `/reports` index (today's confidence badges), new `/ai/memory` page.
- **Affected server modules**: new `src/lib/ai/recommendation-stats.ts`; new server action `src/app/(app)/campaigns/_actions/analyze-creative.ts` (or co-located); enrichment hook in `src/lib/reports/render.ts`.
- **No DB migration**. No new env vars. No new external service calls beyond what Tier 1 already uses.
- **Quota visibility**: vision button shows "เหลือ X/50 วันนี้" so user understands the cap before clicking.
- **Out of scope**: pattern detection ML on `payload` JSON (would need its own change); cross-tenant aggregate insights (privacy review needed); push notifications when outcomes complete.
