## Why

Tier 1 (shipped 2026-05-16) made AdsLab's AI smarter — it learns from outcomes and can see ad creatives. But its **action surface is still narrow**: in chat, the AI can only operate at campaign level (pause / resume / set-budget). Real media-buyer workflow needs ad-set- and ad-level actions:

- "หยุดเฉพาะ ad set ที่ frequency > 4 ไม่ต้องหยุดทั้ง campaign" — needs `pauseAdSet`
- "Ad ID 12345 ตัวนี้ CTR ต่ำ pause ตัวเดียวก่อน" — needs `pauseAd`
- "ลด budget ของ ad set Cold ลงครึ่งหนึ่ง" — needs `setAdSetBudget`
- "Winner ตัวนี้ duplicate ไป ฿2,000/วัน เริ่ม ACTIVE" — needs `duplicateCampaign`

Today the AI has to tell the user "ทำใน Ads Manager เอง" for these. That breaks the conversation flow and makes AdsLab feel like a viewer, not an operator.

This change adds **5 new mutation tools** to bring AI's execution surface up to ~95% of routine media-buyer actions. Risky targeting changes (audience/geo shifts) remain deferred — those need design work around safety guardrails.

## What Changes

### 5 new AI tools (mutate)

- **`pauseAdSet(adSetId)`** — pause a Meta ad set (digit string id). Reversible.
- **`resumeAdSet(adSetId)`** — resume a Meta ad set.
- **`pauseAd(adId)`** — pause an individual ad. Useful for killing single underperforming creatives within a multi-ad ad set.
- **`setAdSetBudget(adSetId, dailyBudget | lifetimeBudget)`** — adjust the budget on an ABO ad set. Validates THB bounds (฿20 – ฿1M), locks daily/lifetime to whichever the ad set already uses.
- **`duplicateCampaign(campaignId, options)`** — wraps the existing `duplicateCampaign` server helper. Supports `newName`, absolute or multiplier-based budget overrides, and initial status (PAUSED default for safety).

Each new tool follows the same pattern as the existing 5 campaign-level mutate tools:
- Zod input schema + JSON schema for OpenAI tool-calling
- `kind: "mutate"` → triggers the chat-side confirmation card
- Resolves Meta ID → internal id + verifies tenant ownership
- Calls Meta Graph API
- Updates local cache row
- Returns a structured result

### New server-side helpers

- **`src/lib/meta/adset-actions.ts`** — `performAdSetAction(input)` mirroring `performCampaignAction` for PAUSE / RESUME / SET_BUDGET at the ad set level. Lightweight: no new audit-log table (we have AIRecommendation capture at the chat layer already).
- **`src/lib/meta/ad-actions.ts`** — `performAdAction(input)` for PAUSE / RESUME at the ad level.

### Chat-service wiring

- `captureRecommendationFromToolCall` in [chat-service.ts](src/lib/ai/chat-service.ts) extended to map the 5 new tool names to `AIRecommendation` rows (so the learning loop sees these too).
- System prompt explains when to call each — e.g. "use `pauseAdSet` not `pauseCampaign` when only one of multiple ad sets is underperforming".

## Capabilities

### New Capabilities
- `ai-execution-tools-tier-2`: Mutation tools exposing ad-set and ad-level lifecycle actions to the in-chat AI, plus campaign duplication. Tier 1 covered campaign-level pause/resume/budget; Tier 2 closes the gap on adset/ad operations + duplication.

### Modified Capabilities
None at spec level. The existing `ai-learning-loop` capability automatically captures recommendations from these new tools via the unchanged `captureRecommendationFromToolCall` path.

## Impact

- **New files:** `src/lib/meta/adset-actions.ts`, `src/lib/meta/ad-actions.ts`, `src/lib/ai/tools/{pause-adset,resume-adset,pause-ad,set-adset-budget,duplicate-campaign}.ts`.
- **Modified:** `src/lib/ai/tools/registry.ts` (add 5 entries), `src/lib/ai/chat-service.ts` (capture mapping + system-prompt guidance).
- **No DB migration.** No schema changes. No new env vars.
- **Mutate-tool confirmation card UI** already handles the "Confirm/Reject" flow; the 5 new tools inherit it automatically.
- **Out of scope:** `changeTargeting` (modify audience/geo) — postponed because targeting changes invalidate Meta's learning phase and need a safety wrapper (e.g., require the user to type the campaign name to confirm). Will land in a separate `add-ai-targeting-tools-tier-3` change when that design is settled.
