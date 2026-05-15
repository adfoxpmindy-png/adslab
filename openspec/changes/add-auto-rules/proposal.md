## Why

Media buyers running 10-50 ad accounts spend hours per day manually checking which adsets are spending wastefully (CPV too high, ROAS too low, frequency burning out audience). The most expensive failure mode for a Thai agency is "campaign ran overnight at ฿200 CPV before anyone noticed in the morning" — exactly the kind of arithmetic monitoring that should never need a human. AdsLab already has the daily-report cron evaluating metrics; turning that into a programmable rules engine that can act (pause/notify/adjust) closes the loop without adding new infrastructure.

This is also the most-asked-for feature differentiating AdsLab from Pipeboard. Pipeboard exposes Marketing API operations but offers no "if X then Y" automation. Adding auto-rules is the single biggest reason for a solo media buyer (฿590/mo) to upgrade to Agency Starter (฿1,490/mo).

## What Changes

- New `RuleSet` + `Rule` + `RuleRun` Prisma models — tenant-scoped rule storage and execution audit log
- New `/t/[slug]/rules` page — rule builder UI (condition → action), list view, on/off toggle, run history
- New `/api/rules` CRUD endpoints + `/api/rules/[id]/run` manual-trigger endpoint
- New hourly cron `/api/cron/rules-tick` (added to `vercel.json`) — evaluates every active rule's condition against fresh Meta insights, fires action if matched, writes `RuleRun` log
- Rule action set (Phase 1): `pause_adset`, `pause_campaign`, `notify_email`, `notify_in_app` — budget adjustment deferred to Phase 2 once we trust the pause/notify primitives
- Quick Boost integration — boost UI gains a "Auto-rules" section that pre-attaches a default safety rule (e.g., "pause if CPV > 2× target after 2h") to each created adset
- AI rule suggestions — on the rules page, AI proposes 3 starter rules based on the tenant's last 30 days of insights (e.g., "you've manually paused 7 adsets when CPV exceeded ฿4 — bake that into a rule?")
- Tier gating via existing `tier-rules.ts` — Solo gets read-only "view rules I would have fired"; Agency Starter+ unlocks create/execute

## Capabilities

### New Capabilities
- `auto-rules`: tenant-scoped if-then automation that monitors live Meta campaign metrics on an hourly schedule and applies actions (pause, notify) when conditions match — including the AI rule-suggestion layer and the Quick Boost default-rule attachment

### Modified Capabilities
<!-- No existing specs need requirement changes — auto-rules is a net-new capability. The existing ai-quick-boost spec gains an integration touchpoint via the rule attachment, but its current requirements remain valid. -->

## Impact

- **New code**: `src/lib/rules/` (engine, evaluators, action dispatchers), `src/app/t/[slug]/rules/`, `src/app/api/rules/`, `src/app/api/cron/rules-tick/`, `src/components/tenant/rules-*` UI components
- **Prisma schema**: 3 new models (`RuleSet`, `Rule`, `RuleRun`); migration with no destructive changes
- **Vercel cron**: 1 new entry (`/api/cron/rules-tick` hourly) — current plan supports this within free-tier cron limits (we currently use 2/40 free crons)
- **Meta API quota**: hourly insights pull per active rule. For a Solo tenant with ≤3 accounts this is negligible; for Agency Unlimited (∞ accounts) we batch by ad account to stay under Meta's per-app rate ceiling
- **Billing**: extends `tier-rules.ts` with `maxActiveRules` per tier (Solo=0, Starter=5, Pro=20, Unlimited=∞)
- **Email**: piggybacks on existing Resend sender; new template for rule-fired notification
- **Quick Boost**: brief-builder + UI gain optional `defaultRule` field — backwards-compatible (omit = current behavior)
- **AI cost**: rule-suggestion endpoint calls Claude analysis model on demand (not on every page load); ≤฿1/tenant/month at expected usage
