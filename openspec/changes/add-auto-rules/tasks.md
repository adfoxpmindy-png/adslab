# Tasks — add-auto-rules

## 1. Data model + migrations

- [ ] 1.1 Add `RuleSet`, `Rule`, `RuleRun` models to `prisma/schema.prisma` per design.md D3 (structured JSON condition, action enum, cooldown tracking)
- [ ] 1.2 Add `maxActiveRules` field to `tier-rules.ts` (Solo=0, Starter=5, Pro=20, Unlimited=999)
- [ ] 1.3 Run `prisma migrate dev --name add_auto_rules` locally, verify it applies cleanly
- [ ] 1.4 Add seed data: 1 demo rule for the demo tenant for local smoke testing

## 2. Rule engine core

- [ ] 2.1 `src/lib/rules/types.ts` — TypeScript types for Condition / Action / RuleStatus matching the Prisma schema
- [ ] 2.2 `src/lib/rules/evaluator.ts` — function `evaluateRule(rule, insightsSnapshot)` → `{ matched, value, threshold, status }` for all 5 metrics (cpv, roas, spend, frequency, ctr) × all operators
- [ ] 2.3 `src/lib/rules/actions.ts` — dispatcher with cases for `pause_adset`, `pause_campaign`, `notify_email`, `notify_in_app`; each returns `{ result: "fired" | "no_change_needed" | "error", message? }`
- [ ] 2.4 `src/lib/rules/cooldown.ts` — `wasFiredInLast24h(ruleId, targetId)` query against RuleRun
- [ ] 2.5 `src/lib/rules/runner.ts` — orchestrator: `runTickForTenant(tenantId)` that batches insights by ad account, evaluates each rule, dispatches matched actions, writes RuleRun rows
- [ ] 2.6 Unit tests for evaluator covering happy path + zero-impressions + each operator

## 3. API routes

- [ ] 3.1 `src/app/api/rules/route.ts` — GET (list) + POST (create) with Zod validation + tier-cap check + role gate
- [ ] 3.2 `src/app/api/rules/[id]/route.ts` — GET + PATCH (enable/disable/edit) + DELETE with ownership check
- [ ] 3.3 `src/app/api/rules/[id]/runs/route.ts` — GET RuleRun history with `?limit=` param
- [ ] 3.4 `src/app/api/rules/[id]/run/route.ts` — POST manual-trigger that evaluates this one rule against fresh insights (for "test this rule" button in UI)
- [ ] 3.5 `src/app/api/rules/suggest/route.ts` — POST that calls Claude analysis with last-30d insights + pause history, returns ≤3 candidate rules with rationale
- [ ] 3.6 `src/app/api/cron/rules-tick/route.ts` — auth-gated hourly tick that enumerates all active rules across all tenants and runs the engine

## 4. Cron registration

- [ ] 4.1 Add `{ path: "/api/cron/rules-tick", schedule: "0 * * * *" }` to `vercel.json`
- [ ] 4.2 Verify Vercel free-tier cron quota (we use 2/40 currently; this adds 24/day = well within limit)

## 5. UI — rules page

- [ ] 5.1 `src/app/t/[tenantSlug]/rules/page.tsx` — server component with tier check + connection check (mirror /boost page pattern)
- [ ] 5.2 `src/components/tenant/rules-client.tsx` — list view with on/off toggle, edit button, delete with confirm
- [ ] 5.3 `src/components/tenant/rule-form.tsx` — create/edit form: name → scope picker (campaign/adset, with searchable list of tenant entities) → condition builder (metric/op/value/windowHours dropdowns) → action picker (pause/notify) → save
- [ ] 5.4 `src/components/tenant/rule-history.tsx` — drawer/modal showing RuleRun rows for one rule with matched/not-matched/skipped color coding
- [ ] 5.5 `src/components/tenant/rule-suggestions.tsx` — "ขอ AI แนะนำ rule" button + modal that calls /suggest and lets user accept candidates
- [ ] 5.6 Solo-tier upsell card: "Auto-rules อยู่ใน Agency Starter+ — upgrade เลย" with CTA to /settings/billing
- [ ] 5.7 Add "Rules" sidebar nav entry between Boost and Campaigns (icon: `Shield` or `Bot`)

## 6. Quick Boost integration

- [ ] 6.1 Extend `BoostBrief` type to include optional `defaultRule: { enabled: boolean }` and `kpiTargetValue: number`
- [ ] 6.2 Add "Auto-pause if KPI not met" checkbox per brief card in `boost-client.tsx` (default OFF, helper text explains "ถ้า CPV เกิน 2 เท่าใน 2 ชม. → pause ทันที")
- [ ] 6.3 Update `/api/boost/execute` to read `defaultRule` flag per brief; after createCampaignTree succeeds, if flag is true, also create a `Rule` linked to the new adset
- [ ] 6.4 Surface tier-cap warnings in execute response (`warnings[]`) when rule attachment is skipped due to cap

## 7. Email template

- [ ] 7.1 `src/lib/email/templates/rule-fired.tsx` — Resend React email template (matches existing daily-report style) with: rule name, what triggered it, what action ran, link to entity in Meta Ads Manager
- [ ] 7.2 Wire up dispatcher's `notify_email` action to send this template via existing `sendEmail` helper

## 8. Testing + verification

- [ ] 8.1 Write `scripts/test-rules-e2e.ts`: create a rule → manually trigger evaluation → confirm RuleRun row + action result; cover both match and no-match cases
- [ ] 8.2 Cron smoke test: invoke `/api/cron/rules-tick` with valid CRON_SECRET against demo tenant, verify it processes existing rules without errors
- [ ] 8.3 Tier-cap test: as a Solo tenant, attempt POST /api/rules — expect 402
- [ ] 8.4 Type-check passes (`npx tsc --noEmit`)
- [ ] 8.5 Local UI smoke: create a rule via UI → toggle off → run history shows the toggle event → delete

## 9. Deploy + canary

- [ ] 9.1 Add `FEATURE_RULES` env flag, default `off` on Vercel
- [ ] 9.2 Deploy to production; flip flag to `on` for the demo tenant only
- [ ] 9.3 Founder creates 2 conservative rules on real ad accounts (e.g., "notify if CPV > ฿4 over 6h")
- [ ] 9.4 Watch RuleRun log for 24-48h, verify zero false positives, no Meta rate-limit errors
- [ ] 9.5 Flip flag globally for Agency Starter+ tier
- [ ] 9.6 Update `decision_tech_stack.md` and `MEMORY.md` index with new feature

## 10. OpenSpec archive

- [ ] 10.1 Mark all tasks complete
- [ ] 10.2 Run `openspec status --change add-auto-rules` and verify isComplete=true
- [ ] 10.3 Archive change to `openspec/changes/archive/YYYY-MM-DD-add-auto-rules/`
- [ ] 10.4 Sync delta spec to `openspec/specs/auto-rules/spec.md`
