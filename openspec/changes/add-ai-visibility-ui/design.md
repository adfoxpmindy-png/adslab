## Context

Tier 1 backend (commit a0bd7f2) added two capabilities — recommendation/outcome tracking and Claude-vision ad analysis — that together close the "learn" and "see creative" gaps. Backend is solid (type-check clean, archived in OpenSpec). But the only user-visible surface today is:
- AI text in chat happens to mention more concrete creative critique (when AI remembers to call `analyzeAdCreative`).
- AI text in Daily Report happens to mention past outcomes (when feature-flag is on and there's history).

That's invisible. The non-programmer founder can't tell whether AI is learning or whether it can see creatives. Trust comes from **showing the proof**, not improving the prose.

Constraint: AdsLab is Thai-first, founder uses it on phone half the time. Every new surface must work on mobile, Thai text, dub.co-inspired aesthetic per [DESIGN.md](DESIGN.md). No new tables, no new env vars, no new external services — all data is already in `AIRecommendation` + `AIRecommendationOutcome` + `MetaAd.creativeAnalysis`.

## Goals / Non-Goals

**Goals:**
- Make the vision tool discoverable: one click on any ad row, no chat required.
- Make outcome history feel real: past Daily Reports retroactively show what happened to each suggestion.
- Make new recommendations feel earned: each suggestion carries a confidence badge derived from real past success rate.
- Give the founder a place to see AI getting better over time (Memory page).
- Reuse existing data layer; zero schema migrations.

**Non-Goals:**
- Pattern-mining the `payload` JSON for cross-recommendation insights (separate ML change later).
- Cross-tenant aggregate insights ("operators like you usually…") — privacy review needed first.
- Push notifications when outcomes complete (cron-level concern, separate change).
- Editing or annotating historical recommendations.
- A/B testing the vision panel layout — ship one good version.

## Decisions

### D1: Server action wrapper, not new API route, for vision button
**Choice:** Add `src/app/(app)/campaigns/_actions/analyze-creative.ts` exporting `analyzeAdCreativeAction(adId)` that calls the existing tool handler with a synthetic `ToolContext`.

**Why over alternatives:**
- New REST route would duplicate the auth/tenant lookup that server actions get for free.
- Calling the tool from a client component directly is impossible (server-only deps: prisma, OpenAI client, env keys).
- Server action keeps the cache/quota logic in one place — the tool's `handler` is authoritative.

**Trade-off:** Couples UI to the tool's input/output shape. Acceptable since both live in this repo.

### D2: Outcome enrichment on past reports — query at render time, not denormalize
**Choice:** When rendering `/reports/[date]`, do a single `prisma.aIRecommendation.findMany({ where: { tenantId, createdAt: between }, include: { outcome: true } })` and merge into the rendered list by `targetMetaId + actionType`.

**Why over alternatives:**
- Storing outcomes inline on the `DailyReport` JSON would mean rewriting historical reports when outcomes compute later (back-population complexity).
- A separate denormalized cache table adds invalidation headaches for ~50 rows per tenant per month.
- Render-time JOIN is fast (indexed `createdAt`), cheap, and always reflects latest outcome.

**Trade-off:** Slight read cost per report view. Mitigation: only fetch when DailyReport ≥ 7 days old (younger reports have no computed outcomes yet anyway).

### D3: Confidence score formula — same-action lookback, no fancy weighting
**Choice:** For each new rec with `actionType = A`, query last 30 days of recs for this tenant where `actionType = A AND outcome IS NOT NULL`. Count "successful" outcomes (definition below). Show `count_successful / total · percent` when total ≥ 3, hide badge otherwise.

Successful = `actionTaken IN ('followed') AND (kpiDelta.percentChange > 0 for spend↓/cpv↓/cpm↓ metrics OR percentChange > 5% for roas/ctr metrics)`.

**Why over alternatives:**
- Per-account or per-campaign cohort is too sparse — most tenants run < 10 campaigns and the lookback window would dry up.
- Bayesian smoothing / confidence intervals would be more rigorous but mathematically opaque to a non-programmer audience.
- "X/Y · Z%" is a vocabulary the founder already uses to evaluate ad batches.

**Trade-off:** Naive base rate, no segmentation. Mitigation: hide badge when n<3 (avoid "1/1 · 100%" hot streaks misleading the user). Document the formula in `recommendation-stats.ts` so we can iterate later.

### D4: Memory page — server component with 3 sections, no JS-heavy charts
**Choice:** `/ai/memory` is a Server Component that runs three aggregate queries (rolling success-rate by week, action-type breakdown, recent 20 outcomes). Render with simple `<dl>` / `<table>` / shadcn `Card` — no Recharts, no client-side filtering yet.

**Why over alternatives:**
- Recharts adds ~120kB. The page should load in < 1s on mobile.
- Founder asked for "เข้าใจง่าย" (understandable). A weekly count list beats a sparkline for non-programmer literacy.
- Server component means no loading spinner, no client cache; refresh-on-navigate semantics match how the founder actually checks it (once a week).

**Trade-off:** Less visually impressive. Can swap to charts later if usage data shows the page is sticky.

### D5: Match recs to past reports by (targetMetaId, actionType, day) — not by ID
**Choice:** Old Daily Reports stored before Tier 1 don't have `AIRecommendation` rows. New reports (after 2026-05-16) will. The archive view does a best-effort join on `(targetMetaId, actionType, createdAt-day)` and gracefully hides the badge when no row matches.

**Why:**
- Adding a `reportId FK` on `AIRecommendation` retroactively is impossible — past records don't exist.
- Day-level granularity is enough since cron runs once a day per tenant.
- "Hide gracefully" prevents the UI from looking broken on pre-Tier1 reports.

**Trade-off:** Same `actionType` happening twice in one day on the same campaign would collide. Realistically rare (cron only generates one report/day). If observed, escalate to FK.

### D6: Vision button placement — co-locate with existing ad row actions
**Choice:** The vision button appears in the ad row's action cluster (next to pause / preview). Result renders in an inline expandable panel below the row, not a modal.

**Why over modal:**
- Modal interrupts the user's scanning flow when comparing multiple ads.
- Inline panel allows side-by-side comparison if user analyzes two ads back to back.
- Mobile-friendly: panel collapses cleanly on narrow screens.

**Trade-off:** Longer row when expanded. Acceptable; users explicitly opt in by clicking.

## Risks / Trade-offs

- **Risk:** Confidence badge anchors user to AI's past mistakes (if AI was wrong 3 times early, badge shows 0% even when current logic is fixed).
  → Mitigation: 30-day rolling window auto-forgets older data. Document that the metric is "rolling" not lifetime.

- **Risk:** Vision quota (50/tenant/day) is hit faster when button is exposed in UI vs hidden in chat.
  → Mitigation: Display remaining quota next to the button ("เหลือ 47 ครั้งวันนี้"). When < 5 remaining, switch button to amber tone. When 0, button disabled with tooltip "พรุ่งนี้ใหม่".

- **Risk:** Render-time outcome JOIN on past reports could be slow on tenants with many recs.
  → Mitigation: Already indexed on `tenantId, createdAt`. Limit lookback to the report's date window only. Add `take: 100` cap.

- **Risk:** Showing outcomes that say "❌ ROAS dropped after refresh creative" looks like AI was wrong, eroding trust.
  → Mitigation: This is the honest signal we want — better to show real outcomes (including failures) than to gameify the badge. Frame "❌" as "ไม่สำเร็จ" not "ผิดพลาด" in copy. Add an outcome-detail tooltip explaining variables outside AI's control (seasonality, market changes).

- **Risk:** First two weeks the Memory page is mostly empty (no historical data).
  → Mitigation: Empty state shows "AI กำลังเก็บข้อมูล · เริ่มเห็นผลใน 7 วัน" with a chart of cumulative recommendations captured per day. Turns emptiness into visible progress.

## Migration Plan

No DB migration. Pure additive UI work. Rollout order:

1. **Phase A** — `recommendation-stats.ts` (pure function, unit-testable).
2. **Phase B** — vision server action + button + panel.
3. **Phase C** — outcome badges on past Daily Report archive.
4. **Phase D** — confidence badges on new Daily Report.
5. **Phase E** — `/ai/memory` page.
6. **Phase F** — type-check + commit + push + archive OpenSpec.

Each phase deployable on its own. Feature flag: gated behind `FEATURE_AI_VISIBILITY_UI` env var, default ON in dev / OFF in prod for first deploy. Founder flips ON after smoke-testing.

Rollback: remove the feature flag check (or set env to "off"). All four surfaces gracefully hide.

## Open Questions

- **Q:** Should the vision button on a campaign-level page (not ad-level) analyze the campaign's "primary ad" automatically? → Defer. v1 only exposes on ad rows where the adId is unambiguous.
- **Q:** Should we expose past creative analyses (cached on `MetaAd.creativeAnalysis`) as a separate "creative library" view? → Out of scope. Already proposed under a separate `creative-library` capability.
- **Q:** Mobile push notification when outcomes finish computing? → Out of scope. Founder doesn't check the app daily anyway.
