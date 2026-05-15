## 1. Stats module foundation

- [ ] 1.1 Create `src/lib/ai/recommendation-stats.ts` with the pure `successDefinition(rec, outcome)` function documented inline (kpiDelta direction rules per actionType)
- [ ] 1.2 Implement `computeConfidence(tenantId, actionType, lookbackDays = 30)` returning `{ total, successful, percent } | null` (null when total < 3)
- [ ] 1.3 Implement `weeklyRollingSuccessRate(tenantId, weeks = 4)` grouping outcomes by ISO week
- [ ] 1.4 Implement `actionTypeBreakdown(tenantId)` returning sorted-by-total list
- [ ] 1.5 Export types `ConfidenceResult`, `WeeklyRollup`, `ActionTypeRollup` for UI consumption

## 2. Vision server action + button

- [ ] 2.1 Create `src/app/(app)/campaigns/_actions/analyze-creative.ts` exporting `analyzeAdCreativeAction(adId)` server action that resolves the tenantId/userId from session, builds a `ToolContext`, and calls the existing `analyzeAdCreativeTool.handler`
- [ ] 2.2 Add `getVisionQuotaRemaining(tenantId)` helper alongside the action (counts MetaAd rows with `creativeAnalyzedAt >= UTC midnight`, returns `50 - count`)
- [ ] 2.3 Build `src/components/ads/AnalyzeCreativeButton.tsx` (client component): button + remaining-quota badge + tooltip when quota=0
- [ ] 2.4 Build `src/components/ads/CreativeAnalysisPanel.tsx` (client) that renders the structured result (hook, vh/tl scores as 5-dot pips, strengths/weaknesses/fixes) — inline below the row, NOT a modal
- [ ] 2.5 Wire button into existing ad row in `/campaigns/[id]` view (locate the file via Glob `**/campaigns/[id]/**.tsx`)
- [ ] 2.6 Test happy path on an image ad and a video ad (founder's real EV_Plaza campaign)
- [ ] 2.7 Test quota-exhausted state by mocking `getVisionQuotaRemaining` to return 0
- [ ] 2.8 Test no-visual-asset state on a text-only or dynamic-creative ad

## 3. Outcome badges on archived Daily Reports

- [ ] 3.1 Locate the Daily Report archive render code (`/reports/[date]` page) — likely `src/app/(app)/reports/[date]/page.tsx` or a render helper under `src/lib/reports/`
- [ ] 3.2 Add a `fetchOutcomesForReport(tenantId, reportDate)` helper that fetches `AIRecommendation` rows within the report's date window joined to their outcomes
- [ ] 3.3 Build a `<OutcomeBadge outcome={...} kpiDelta={...} />` component with the 5 visual states (followed-positive, followed-negative, ignored, target_deleted, pending) — Thai copy
- [ ] 3.4 In the report renderer, match each historical suggestion to its `AIRecommendation` row by `(targetMetaId, actionType, day)`; render the badge inline; render nothing when no match
- [ ] 3.5 Test on a Tier1-era report (post 2026-05-16) — badges should appear
- [ ] 3.6 Test on a pre-Tier1 report — page should look unchanged

## 4. Confidence badges on fresh recommendations

- [ ] 4.1 In the Daily Report render path (`src/lib/reports/render.ts` or wherever the today-report markdown is composed), enrich each suggestion with `computeConfidence(tenantId, suggestion.actionType)` before rendering
- [ ] 4.2 Build `<ConfidenceBadge result={...} />` component — hidden when result is null, shows "🎯 X ครั้ง · สำเร็จ Y%" otherwise
- [ ] 4.3 Wire badge into the new-suggestions section of the Daily Report card on `/reports` index
- [ ] 4.4 Also wire into the Chat tool-call confirmation card (`src/components/chat/PendingMutateCard.tsx` or similar) — badge shown next to the action description before user approves
- [ ] 4.5 Test with a tenant that has no history (< 3 prior outcomes) — badge should hide
- [ ] 4.6 Test with a tenant that has > 5 outcomes for an actionType — badge should render with correct percent

## 5. AI Memory page

- [ ] 5.1 Create `src/app/(app)/ai/memory/page.tsx` (Server Component)
- [ ] 5.2 Render three sections: rolling weekly success rate, action-type breakdown, recent outcomes feed — using stats module
- [ ] 5.3 Build `<EmptyMemoryState tracked={n} />` for zero-outcome tenants — shows count of recs in 7-day waiting window
- [ ] 5.4 Add link to Memory page from main nav (locate sidebar component, add icon + Thai label "ความจำ AI")
- [ ] 5.5 Test with founder's real tenant (which currently has 0 outcomes since Tier 1 just shipped) — should show empty state
- [ ] 5.6 Seed-test by inserting a few fake outcomes via Prisma Studio or a one-off script to verify populated state renders correctly, then delete the fakes

## 6. Polish + integration

- [ ] 6.1 Mobile test: every new surface on a 375px-wide viewport (founder uses phone half the time)
- [ ] 6.2 Add `FEATURE_AI_VISIBILITY_UI` env-gate around all 4 surfaces (default ON in dev / OFF in prod); confirm flip works
- [ ] 6.3 Run `npx tsc --noEmit` — must be clean
- [ ] 6.4 Manually click through: campaigns list → analyze creative → reports archive → confidence on new → memory page

## 7. Ship + archive

- [ ] 7.1 `git add` only files under this change; commit with descriptive message
- [ ] 7.2 `git push origin main`
- [ ] 7.3 Flip `FEATURE_AI_VISIBILITY_UI` to "on" in Vercel env after smoke test
- [ ] 7.4 Sync specs: `cp openspec/changes/add-ai-visibility-ui/specs/ai-visibility-ui/spec.md openspec/specs/ai-visibility-ui/spec.md` (create folder first)
- [ ] 7.5 Move change to archive: `mv openspec/changes/add-ai-visibility-ui openspec/changes/archive/$(date +%Y-%m-%d)-add-ai-visibility-ui`
- [ ] 7.6 Commit archive + push

## 8. Defer (do NOT build in this change)

- 8.1 Charts on the Memory page (Recharts) — re-evaluate after a month of usage data
- 8.2 Pattern detection ML on payload JSON — separate change
- 8.3 Cross-tenant aggregate insights — privacy review needed
- 8.4 Push notifications when outcomes finish — separate change
- 8.5 Editing or annotating historical recommendations — out of scope
