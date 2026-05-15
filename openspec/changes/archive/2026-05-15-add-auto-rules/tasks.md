# Tasks — add-auto-rules

## 1. Data model + migrations

- [x] 1.1 Add `RuleSet`, `Rule`, `RuleRun` models to `prisma/schema.prisma` — shipped as `AutoRule` + `AutoRuleRun` (skipped intermediate RuleSet as a single-level rule was sufficient for MVP)
- [x] 1.2 Add `maxActiveRules` field to `tier-rules.ts` — shipped as `maxActiveRulesForPlan()` (Starter=5/Growth=20/Pro=100/Scale=500/Enterprise=999/Trial=0)
- [x] 1.3 DB pushed via `prisma db push` (migration history was drifted; safe additive push instead)
- [ ] 1.4 Seed demo rule — deferred; user can create one via UI when needed

## 2. Rule engine core

- [x] 2.1 `src/lib/rules/types.ts`
- [x] 2.2 `src/lib/rules/evaluator.ts` — 5 metrics × 4 ops
- [x] 2.3 `src/lib/rules/actions.ts` — pause + notify dispatcher
- [x] 2.4 `src/lib/rules/cooldown.ts` — 24h cooldown
- [x] 2.5 `src/lib/rules/runner.ts` — tenant-level orchestrator
- [ ] 2.6 Unit tests for evaluator — deferred; E2E smoke test covers core flow

## 3. API routes

- [x] 3.1 `POST/GET /api/rules`
- [x] 3.2 `GET/PATCH/DELETE /api/rules/[id]`
- [x] 3.3 `GET /api/rules/[id]/runs`
- [x] 3.4 `POST /api/rules/[id]/run`
- [x] 3.5 `POST /api/rules/suggest`
- [x] 3.6 `POST /api/cron/rules-tick` (standalone — for future Vercel Pro upgrade)

## 4. Cron registration

- [x] 4.1 Piggybacked into existing `/api/cron/daily-report` cron (Vercel Hobby allows only 2 cron slots; daily is fine for v1)
- [x] 4.2 Hobby tier compatible

## 5. UI — rules page

- [x] 5.1 `/t/[tenantSlug]/rules/page.tsx` — server entry with tier + Meta connection check
- [x] 5.2 List view with toggle / edit / delete / test / history actions
- [x] 5.3 Create/edit modal with all condition + action fields + target picker
- [x] 5.4 History drawer with color-coded matched/fired/error rows
- [x] 5.5 AI suggestions modal with "ขอ AI แนะนำ" CTA
- [x] 5.6 Upsell card for trial/free tenants (cap === 0)
- [x] 5.7 Sidebar "กฎอัตโนมัติ" entry with Shield icon

## 6. Quick Boost integration

- [ ] 6.1-6.4 Deferred — add `defaultRule` checkbox to /boost UI in a follow-up. Not blocking for v1 rules feature.

## 7. Email template

- [x] 7.1-7.2 Inlined in `src/lib/rules/actions.ts → renderEmailBody()`. Sufficient for v1; can extract to `src/lib/email/templates/rule-fired.tsx` later if more email templates are added.

## 8. Testing + verification

- [x] 8.1 `scripts/test-auto-rules-e2e.ts` — 6/6 steps pass on prod (create, list, patch, runs, manual trigger evaluated 4 targets, delete)
- [x] 8.2 Cron path verified via piggyback into daily-report; CRON_SECRET gate confirmed
- [ ] 8.3 Explicit tier-cap test as Solo tenant — code path exists; tested only indirectly via paid demo tenant
- [x] 8.4 `npx tsc --noEmit` passes
- [ ] 8.5 Local UI manual smoke — requires founder to drive the UI

## 9. Deploy + canary

- [x] 9.1 No feature flag — code paths are gated by tier-cap so trial users see upsell, paid users get rules
- [x] 9.2 Deployed to production (commits b1b14e6 + 048d5d2)
- [ ] 9.3-9.6 Founder dogfood pending

## 10. OpenSpec archive

- [ ] 10.1-10.4 Done after this commit
