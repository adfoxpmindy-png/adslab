## Context

AdsLab today emits AI recommendations through three channels — Daily Report (markdown + a `suggested-actions` JSON fence), AI Chat (tool calls that the user confirms), and Auto-Rules Suggest (candidate rules the user accepts). None of those emissions are observed afterward, so the AI can't tell whether its advice ever worked. Meanwhile the AI's diagnosis of underperforming ads relies entirely on metrics — it has never "looked at" an ad's creative, even though Nick Theriot's playbook (now ingested as 102 videos / 2,889 chunks) treats creative as the dominant lever.

This change closes both gaps in a way that:
- doesn't require new UI to start delivering value (AI naturally improves once data is captured)
- piggybacks on existing infrastructure (Hobby-tier cron, existing graph-api helpers, existing insight cache)
- stays additive at the schema level so rollback is trivial
- caches expensive vision calls so cost is predictable

## Goals / Non-Goals

### Goals
- Every concrete AI recommendation across the three emission channels gets logged to a single canonical store.
- For each logged recommendation, after 7 days the system computes a structured "outcome" snapshot: did the user follow it (action taken), did the relevant KPI move (delta vs the pre-rec 7-day window).
- Future recommendations for the SAME tenant include the last 5-10 outcomes as prompt context, so AI can skew toward patterns that worked for THIS account.
- AI Chat can call `analyzeAdCreative(adId)` to get a structured vision evaluation, usable inline in answers.
- `analyzeAdCreative` results are cached per-ad with a 7-day TTL on `MetaAd.creativeAnalysis`.

### Non-Goals
- A UI to browse recommendation history. (May come later; the data is enough for AI to use first.)
- Outcomes for non-Meta entities. (Tenant-level KPIs irrelevant — all targets are campaign/adset/ad ids.)
- Vision evaluation of landing pages or competitor ads. (Different problem scope.)
- Automatic action execution based on outcomes. (Recommendation engine, not autopilot.)
- Tier 2 expanded tool surface — separate change.

## Decisions

### D1: Single `AIRecommendation` table across all sources (not 3 separate per-source tables)

**Decision:** One table with `source` enum (`daily_report` / `chat_tool` / `rules_suggest`) + a discriminating `actionType` enum.

**Alternatives considered:**
- Per-source tables (DailyReportAction, ChatToolCall, RuleSuggestion) — already partially exist as join data on existing models.
- Event-sourcing with one `AIEvent` table for everything AI-related.

**Why this wins:** Recommendations are conceptually one thing ("AI told user to do X to entity Y") even if they originate from three places. One table = one query for the prompt-injection feedback step, and clear coupling to one `Outcome` table.

### D2: Outcomes computed by 7-day-delayed cron, not eagerly

**Decision:** Cron picks up recommendations with `createdAt < now - 7 days` AND `outcome IS NULL` and computes the delta in one pass.

**Alternatives considered:**
- Compute outcome immediately when the user confirms/rejects a chat tool action. Faster signal, but the KPI delta needs time to materialise.
- Real-time webhook from Meta on metric changes. Way over-engineered.

**Why this wins:** A 7-day window matches Meta's recommended attribution window and gives the algorithm time to settle after any change. Cron also handles "recommendations that need outcome computation right now" deterministically — no race conditions with user action.

### D3: Outcome captures KPI delta over the 7-day window before vs after the recommendation, not absolute current state

**Decision:** `outcome.kpiDelta` = `{metric: "cpv"|"roas"|"spend"|"ctr"|"cpm", before: number, after: number, percentChange: number}`. Plus `actionTaken`: `followed` / `ignored` / `opposite`.

**Why:** A recommendation's value is in what changed relative to the trajectory, not the absolute number. "ROAS was 1.2x, AI said pause, user paused, now adset's gone" → the right "outcome" is `actionTaken: followed`. "ROAS was 1.2x, AI said scale, user scaled, ROAS now 1.5x" → outcome captures the +25%.

### D4: Vision tool is read-only, not a mutator

**Decision:** `analyzeAdCreative` returns a structured JSON object. It does not propose actions — the AI model uses the analysis to inform its own subsequent recommendation, which goes through the existing mutate tools.

**Why this wins:** Separation of concerns. Vision = perception layer. Mutators = action layer. Composes cleanly.

### D5: Cache vision results on `MetaAd.creativeAnalysis` (column), not in a separate AICache table

**Decision:** Add `creativeAnalysis Json? @db.JsonB` + `creativeAnalyzedAt DateTime?` to `MetaAd`. TTL check in tool handler: if `creativeAnalyzedAt > now - 7d`, return cached.

**Alternatives considered:**
- Separate `AIVisionCache` table keyed by URL hash. Cleaner abstraction.
- Redis cache. New dependency.

**Why this wins:** Ad creative changes are rare (you don't edit a running ad's image), so a 7-day TTL captures ~99% of repeat-diagnosis calls. Coupling cache to MetaAd row keeps queries simple — one JOIN, no orphan rows.

### D6: Use Claude Sonnet for vision (already in AI gateway)

**Decision:** Vision calls go through the existing `aiChat({ role: "analysis", ... })` path with `images` attached to the user message. The OpenRouter wrapper already handles Anthropic-format vision messages.

**Why this wins:** Zero new SDK setup. Sonnet is what we already use for analysis tasks, and its vision quality is high. We could fall back to Gemini Flash vision later if cost balloons.

### D7: Hobby-tier cron — piggyback on existing daily-report

**Decision:** Add the outcome-computation step to the existing `/api/cron/daily-report` handler (which already runs once daily and already does rule-tick piggyback).

**Why this wins:** Vercel Hobby cap = 2 cron jobs. We've already burned 2 (daily-report, billing-tick). Outcomes need to run daily anyway — slot them in.

## Risks / Trade-offs

- **[Outcome attribution noise]** A campaign's KPI might move for reasons unrelated to the AI's suggestion (seasonality, ad fatigue, account-wide changes). → Mitigation: capture the 7-day BEFORE and AFTER windows so the AI sees the magnitude. Down the road, attribute more carefully by comparing against an "untouched" peer adset in the same campaign.

- **[Recommendation log gets noisy fast]** Daily Reports emit several suggested-actions per day per tenant — could be 1000s of rows in a year. → Mitigation: Index on `(tenantId, createdAt DESC)` so we only ever fetch the last 10. Schema includes a status column for archive/dismiss later if needed.

- **[Vision cost spikes]** If users use the diagnose feature heavily, vision calls add up. → Mitigation: 7-day cache. Plus a soft per-tenant daily limit (configurable, default 50 vision calls/day) before falling back to "text-only diagnose, vision unavailable today" gracefully.

- **[Privacy of internal AI critique]** AI analysis like "this thumbnail is busy and the hook is weak" is harsh by design. If a tenant shared their account with their client, the client could see the AI's blunt assessment. → Mitigation: vision evaluations live in the `MetaAd.creativeAnalysis` column, only surfaced through AI chat — not as a standalone UI card. Tone the prompt to be constructive ("here's how to fix") not judgmental.

- **[Outcome computation requires past insight data]** If the insight cache doesn't have data for the 7-day-before window, outcomes can't be computed. → Mitigation: gracefully skip + log; AI just doesn't get a feedback signal for that one rec. New tenants accumulate signal over weeks, not instantly.

## Migration Plan

1. **Schema migration** — `prisma db push` for 2 new models + 2 new columns. Pure additive, no data backfill. Tested locally first.
2. **Recommendation capture rollout** — ship the capture wiring before the prompt-injection consumer. For ~1 week, recommendations get logged but the AI doesn't see them yet. Lets us validate data shape + volume before changing AI behavior.
3. **Outcome cron** — first run after a tenant's earliest captured rec is 7 days old. Until then, the outcome table is empty.
4. **Prompt injection consumer turns on** — once outcome rows exist for a tenant, the next Daily Report / Chat session includes them. Feature-flag via env: `FEATURE_AI_LEARNING=on`.
5. **Vision tool ships** — independent of the learning loop; turn on via `FEATURE_AI_VISION=on`. Cached per-ad. Soft per-tenant daily quota.
6. **Rollback** — flip the env flags off. Tables/columns remain (no data destroyed). AI reverts to pre-Tier-1 behavior.

## Open Questions

1. **Should outcomes feed into auto-rule suggestions, not just chat/report?** Probably yes for v1.5. The rules-suggest endpoint already injects RAG context; outcomes are another grounding signal. Wire if it's a 30-min add.

2. **What's the right "ignored" detection?** Today the user's confirmation card gives a yes/no. For Daily Report suggested-actions there's no explicit accept — we infer from Meta state changes. If the campaign is still ACTIVE 7 days after AI said pause, mark `actionTaken: ignored`. Open question on edge cases (campaign deleted, account paused at higher level).

3. **Should vision calls preview the image to the user in chat?** Surfacing the analyzed thumbnail would build trust. But adds UI work. Defer.

4. **Multi-tenant insights — eventually share patterns across tenants?** If 30 ecom tenants all see "Andromeda-style creative similarity" warnings work, that's a meta-signal worth sharing anonymously. Far future.
