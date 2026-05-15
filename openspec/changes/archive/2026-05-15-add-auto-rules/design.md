## Context

AdsLab already runs a single nightly cron (`/api/cron/daily-report`) that pulls fresh Meta insights, generates AI reports, and emails tenants. The auto-rules engine extends this pattern: instead of generating prose once per day, evaluate user-defined predicates against the same insight stream hourly, and dispatch actions (pause/notify) when matched.

Key constraints already in place:
- Vercel Hobby cron limit: 40 daily invocations (we use 2/40, leaving lots of headroom for an hourly tick = 24/day per region)
- Meta Marketing API rate limits — already managed by `src/lib/meta/graph-api.ts` with backoff
- Tier gating exists in `src/lib/billing/tier-rules.ts` and is referenced by other paid features
- AI gateway (`src/lib/ai/`) routes to Claude (analysis) or Gemini (chat); rule suggestions are an analysis call

Stakeholders: agency operators who currently leave Meta Ads Manager open in a tab and refresh it every hour overnight. They want sleep, basically.

## Goals / Non-Goals

### Goals
- Tenant defines `if (metric op threshold within window) then (action)` rules in a UI a non-programmer can drive
- Hourly evaluation against live Meta insights — same data source as daily-report
- Auditable: every rule check writes a `RuleRun` row showing what was evaluated, whether it matched, and what action ran (so users trust the engine)
- Idempotent actions — re-running the same rule on already-paused entities is a no-op, not an error
- Quick Boost can attach a default "safety rule" when creating a campaign — one click, no separate workflow
- AI suggests rules from historical patterns — turn institutional memory into automation

### Non-Goals
- Real-time (sub-minute) evaluation — hourly cadence is sufficient for the failure modes that matter (overnight burn, daily-budget overspend)
- Multi-condition compound rules (`AND`/`OR` chains) — Phase 1 ships single-condition rules. Compound logic is a Phase 2 add once we see what users actually compose
- Budget adjustment actions (increase/decrease) — deferred until pause/notify is proven safe in production
- Cross-platform rules — Meta only in Phase 1, matching current product surface
- Custom webhook actions — out of scope until we have multiple users asking for them

## Decisions

### D1: Hourly cron + DB-driven scheduler (not in-process)

**Decision:** A single Vercel cron at `0 * * * *` enumerates every active `Rule` row and evaluates it. State lives in Postgres, not in memory.

**Alternatives considered:**
- Inngest / Trigger.dev — better DX but adds a paid dependency + new auth surface. Skip until we outgrow Vercel cron.
- Self-hosted worker — too much ops burden for one feature.

**Why this wins:** Reuses the cron pattern already shipping (`daily-report`, `billing-tick`), no new infra, easy to reason about.

### D2: Action dispatcher is a discriminated union, not a plugin system

**Decision:** Each `Rule.action` is one of a fixed enum (`pause_adset`, `pause_campaign`, `notify_email`, `notify_in_app`). The dispatcher is a `switch` in `src/lib/rules/actions.ts`.

**Alternatives considered:**
- Plugin registry — flexible but adds indirection and a security surface (arbitrary tenant-defined handlers).
- Webhook actions — defer to Phase 2.

**Why this wins:** With four actions, a switch is clearer than a registry. Adding a fifth action is a one-line addition. We avoid the YAGNI tax of premature abstraction.

### D3: Rule conditions stored as structured JSON, not a DSL

**Decision:** `Rule.condition` is a typed JSON object: `{ metric: "cpv" | "roas" | "spend" | "frequency" | "ctr", op: "gt" | "lt" | "gte" | "lte", value: number, windowHours: 1 | 2 | 6 | 24, scope: "adset" | "campaign" }`. Front-end form maps 1:1 to this shape.

**Alternatives considered:**
- String DSL (`"cpv > 5 within 2h"`) — needs a parser, fragile to internationalization, harder for AI suggestions to write reliably.
- Visual no-code builder with arbitrary nesting — overkill for single-condition rules.

**Why this wins:** Structured JSON is what both the form builder and the AI suggester emit; the evaluator deserializes once and runs a small function. Easy to extend (add a metric → add a case).

### D4: Rule evaluation reads from a freshly-pulled insight snapshot, not cached metrics

**Decision:** The rules tick fetches insights with `time_range = last 24h` per ad account, then evaluates each rule against the windowed slice from that snapshot. No reuse of daily-report's snapshot (which lags by ≥ 1 hour).

**Alternatives considered:**
- Reuse daily-report snapshot — saves API calls but data is stale.
- Cache per-rule snapshot — duplicates work and complicates invalidation.

**Why this wins:** Each ad account gets one fresh insights call per tick. For an Agency Pro tenant with 50 accounts that's 50 Meta calls per hour — well within rate limits. Freshness matters because the failure modes we catch (CPV spiking right now) are time-sensitive.

### D5: AI rule suggestions are a manual button, not a passive feed

**Decision:** Rules page has a "ขอ AI แนะนำ rule" button. Clicking calls Claude with the tenant's last-30-days insights and historical pause-actions; Claude returns 3 candidate rules with rationale. User accepts or dismisses each.

**Alternatives considered:**
- Auto-create suggested rules on signup — feels presumptuous, risks creating rules the user doesn't understand.
- Inline suggestions while building a rule — added complexity, defer to Phase 2.

**Why this wins:** Explicit user intent + cost control (AI call only when asked) + builds trust ("I can see what AI suggested before agreeing").

### D6: Quick Boost integration is one optional checkbox, not a forced flow

**Decision:** Quick Boost UI adds a single "📐 Auto-pause if KPI not met" checkbox per brief, default OFF. When checked, the brief carries a `defaultRule` payload; on execute, after the adset is created, the rule is attached to it.

**Alternatives considered:**
- Always attach a safety rule — surprises users who explicitly want manual control.
- Separate "rules" page after boost completes — adds clicks, breaks the one-action mental model.

**Why this wins:** Discoverable for first-timers (checkbox is right there) but invisible if you don't want it. The KPI value is already in the brief, so no extra input needed.

## Risks / Trade-offs

- **[False-positive pauses cost agencies trust]** A rule that mis-pauses a winning adset because of a 1-hour blip is worse than no rule. → Mitigation: minimum window is 1 hour; default thresholds in AI suggestions skew conservative (e.g., 2× target, not 1.1×); every `RuleRun` is logged and surfaced in the UI so users see what would have fired even before enabling.

- **[Hourly Meta API calls hit rate limits for Agency Unlimited]** A tenant with hundreds of ad accounts × 24 ticks/day × N rules could saturate the app-level rate limit. → Mitigation: batch insights pulls by ad account (one call covers all rules on that account); add a circuit breaker that backs off to the next tick if Meta returns 429.

- **[Tier-gating bypass via direct API]** A Solo tenant could try to POST `/api/rules` and create rules anyway. → Mitigation: tier check happens server-side in the route handler, not just in the UI; tests cover the 403 path.

- **[Cron failure leaves rules unprocessed silently]** A failed Vercel cron doesn't retry. → Mitigation: each tick writes its own `RuleRun` row; missing rows = missing tick = alert the founder via a heartbeat check in the existing health dashboard (Phase 1 polish — list as a known gap, not a blocker).

- **[Hourly tick on a free Vercel cron may be Pro-tier-required]** Vercel free Hobby caps daily cron invocations at 100/day. 24 ticks × 1 region = 24 invocations — fine. But if we add region duplication or a per-tenant tick later, this caps quickly. → Mitigation: keep it a single global cron; explicit non-goal of per-tenant cron schedules.

- **[Rule semantics ambiguity around "within N hours"]** Does "CPV > 5 within 2h" mean "average CPV over the past 2h" or "any 1-minute bucket in the past 2h"? → Mitigation: spec defines it as "average over the window"; UI shows the computed value next to the threshold when previewing a rule.

## Migration Plan

1. **Schema migration** — add `RuleSet`, `Rule`, `RuleRun` tables. Pure additive; no data migration. Run via `prisma migrate dev` locally, `prisma migrate deploy` on prod.
2. **Code merge** — gate the new `/rules` page behind a feature flag (`FEATURE_RULES=on`) so we can ship code without exposing it.
3. **Internal canary** — founder enables flag for the demo tenant; creates 1-2 conservative rules; observes `RuleRun` log for a week.
4. **Soft launch** — flip flag for Agency Starter+ tier; surface "บูสต์ด่วน" sidebar entry. Solo tier sees a "Upgrade to unlock" tease.
5. **AI suggestions feature** — ships as a separate enable-step inside the rules page (button labeled "ทดลอง AI แนะนำ"). Lets us A/B the prompt and gather feedback before making it primary.

**Rollback:** disable feature flag + leave tables in place (no destructive rollback). Existing rules stop evaluating; users can re-enable after we ship a fix.

## Open Questions

1. **Should `notify_email` recipients be configurable per rule, or always go to all tenant OWNERs?** Defaulting to "all OWNERs" is simpler and matches how daily-report works. Per-rule recipient list is Phase 2 unless someone explicitly asks for it during canary.

2. **What happens when a rule's target adset has been deleted in Meta?** Mark the rule as `paused_orphan`, write a `RuleRun` with `status=skipped`, surface in UI. Implementation detail — confirm during build.

3. **Do we cap how many actions one rule can fire per day?** Yes — Phase 1 hard cap: 1 action per rule per 24h, prevents a flapping rule from spamming. Configurable in Phase 2 if anyone asks.

4. **Tier limits exact numbers?** Proposal sketches Solo=0/Starter=5/Pro=20/Unlimited=∞. Founder to confirm during canary — these may shift based on what feels right when dogfooding.
