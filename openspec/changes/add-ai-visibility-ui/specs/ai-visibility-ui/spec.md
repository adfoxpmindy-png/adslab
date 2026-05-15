## ADDED Requirements

### Requirement: On-demand vision creative analysis from ad rows
The system SHALL expose a "วิเคราะห์ภาพ" (Analyze creative) button on every ad row in `/campaigns/[campaignId]` and any other ad-list surface. Clicking it MUST invoke the existing `analyzeAdCreativeTool` handler via a server action and render the structured result (hook, visualHierarchy, textLegibility, strengths, weaknesses, suggestedFixes) inline below the row.

The button MUST display remaining tenant quota for the day ("เหลือ X/50 ครั้ง") and MUST be visually disabled when quota is 0 with a tooltip "พรุ่งนี้ใหม่ (00:00 UTC)".

The result panel MUST show cached results immediately when `creativeAnalyzedAt` is within 7 days; only call the LLM when cache is stale or missing.

#### Scenario: Fresh analysis with available quota
- **WHEN** user clicks the button on an ad with no prior `creativeAnalysis` and tenant quota > 0
- **THEN** the system calls Meta Graph to fetch the image, calls the vision LLM, persists the result on `MetaAd.creativeAnalysis`, and renders the result panel with all 8 fields populated

#### Scenario: Cached analysis served
- **WHEN** user clicks the button on an ad whose `creativeAnalyzedAt` is within the last 7 days
- **THEN** the system returns the cached `MetaAd.creativeAnalysis` without an LLM call and renders the panel with a small "บันทึกเมื่อ <relative time>" subtitle

#### Scenario: Quota exhausted
- **WHEN** tenant's vision-analyzed-today count is ≥ 50 and user clicks the button
- **THEN** the button is disabled, shows "เหลือ 0/50 ครั้ง", and clicking surfaces the tooltip explaining reset at 00:00 UTC

#### Scenario: Ad has no visual asset
- **WHEN** the ad's creative lacks `image_url`, `thumbnail_url`, and `video_id`
- **THEN** the panel shows a polite error "ad นี้ไม่มีรูปให้วิเคราะห์" and the failed attempt does NOT count against quota

### Requirement: Outcome badges on archived Daily Reports
The system SHALL annotate each historical recommendation rendered on `/reports/[date]` with an outcome badge sourced from `AIRecommendationOutcome`. The badge MUST show one of:
- ✅ "ทำตาม · ROAS +XX%" when outcome.actionTaken = "followed" and kpiDelta is positive
- ⚠️ "ทำตาม · ROAS -XX%" when actionTaken = "followed" and kpiDelta is negative
- ⏭️ "ไม่ได้ทำ" when actionTaken = "ignored"
- 🗑️ "เป้าหมายถูกลบ" when actionTaken = "target_deleted"
- ⏳ "รอผล" when the rec exists but no outcome row yet

When no `AIRecommendation` row matches the displayed suggestion (e.g., reports authored before 2026-05-16), the badge MUST be hidden — never render a broken or "unknown" state.

#### Scenario: User views a 14-day-old report
- **WHEN** user opens `/reports/2026-05-02` which contains 5 historical suggestions
- **THEN** the system fetches `AIRecommendation` rows with `tenantId, createdAt: between(reportDay)` joined with their outcomes, and each suggestion that matches by (targetMetaId, actionType) renders its outcome badge inline

#### Scenario: Report predates Tier 1 launch
- **WHEN** user opens `/reports/2026-04-20` (before 2026-05-16 ship date)
- **THEN** no badges render and the report appears unchanged from its original state

#### Scenario: KPI delta is positive on a "pause" rec
- **WHEN** a "pause campaign" rec has actionTaken="followed" and kpiDelta.percentChange = +40 on ROAS
- **THEN** the badge text reads "✅ ทำตาม · ROAS +40%"

### Requirement: Confidence badges on fresh Daily Report recommendations
The system SHALL compute a per-recommendation confidence score from `recommendation-stats.ts` and render a badge ("🎯 เคยแนะนำแบบนี้ X ครั้ง · สำเร็จ Y%") on every actionable suggestion in the latest Daily Report and inline Chat tool-call confirmation cards. The score uses a 30-day rolling window of same-`actionType` outcomes for the same tenant.

The badge MUST be hidden when the historical sample size is < 3. The success definition MUST be documented inline in the stats module: outcome.actionTaken = "followed" AND a positive KPI movement for the metric direction implied by the action.

#### Scenario: Pause action with 12 prior outcomes
- **WHEN** AI generates a new "pause campaign X" rec and tenant has 12 prior pause-action outcomes (10 followed-successful, 2 followed-failed) in last 30 days
- **THEN** the badge shows "🎯 เคยแนะนำแบบนี้ 12 ครั้ง · สำเร็จ 83%"

#### Scenario: New action type with no history
- **WHEN** AI generates a "refresh_creative" rec and tenant has only 1 prior outcome of this type
- **THEN** the badge is hidden (sample size < 3)

#### Scenario: Mixed success / pending
- **WHEN** AI generates a "change_budget" rec and tenant has 8 prior outcomes (5 successful, 1 failed, 2 still "no outcome row")
- **THEN** the badge counts only the 6 with completed outcomes: "🎯 เคยแนะนำแบบนี้ 6 ครั้ง · สำเร็จ 83%"

### Requirement: AI Memory page
The system SHALL provide a `/ai/memory` route accessible from the main navigation that displays three sections derived from this tenant's `AIRecommendation` + `AIRecommendationOutcome` data:

1. **Rolling weekly success rate** — last 4 calendar weeks, one line per week, format: "สัปดาห์ X: A/B (Y%)".
2. **Action-type breakdown** — a table of (actionType, total outcomes, successful, success rate) sorted by total descending.
3. **Recent outcomes feed** — last 20 outcomes, newest first, each line: "<date> · <actionType> <targetKind> · <badge> · <kpiDelta or '-'>".

When the tenant has zero outcomes, the page MUST render an explicit empty state: "AI กำลังเก็บข้อมูล · เริ่มเห็นผลใน 7 วันหลังคำแนะนำแรก" alongside a small counter "<n> คำแนะนำที่ track อยู่".

#### Scenario: New tenant with no outcomes
- **WHEN** user navigates to `/ai/memory` on a fresh tenant
- **THEN** the page renders the empty-state copy with the live count of `AIRecommendation` rows that are still within the 7-day waiting window

#### Scenario: Established tenant with 40 outcomes
- **WHEN** a tenant with 40 outcomes spread across 4 weeks visits `/ai/memory`
- **THEN** all three sections render with real numbers; the breakdown table is sorted by total descending; the feed shows the 20 most-recent outcomes

#### Scenario: Outcomes include errors
- **WHEN** some outcomes have `actionTaken = "no_data"` due to fetch errors
- **THEN** they are excluded from the success-rate calculation but appear in the feed with a neutral "ℹ️ ไม่มีข้อมูล" badge

### Requirement: Shared recommendation-stats module
The system SHALL provide `src/lib/ai/recommendation-stats.ts` exporting at minimum:
- `computeConfidence(tenantId, actionType, lookbackDays = 30): Promise<{ total: number; successful: number; percent: number } | null>` returning `null` when total < 3.
- `weeklyRollingSuccessRate(tenantId, weeks = 4): Promise<Array<{ weekStart: Date; total: number; successful: number }>>`.
- `actionTypeBreakdown(tenantId): Promise<Array<{ actionType: string; total: number; successful: number; percent: number }>>`.
- `successDefinition(rec, outcome): boolean` — pure function documented inline so the rule is auditable.

#### Scenario: Confidence computation reuse
- **WHEN** both the Daily Report renderer and the Memory page need confidence numbers
- **THEN** both call `computeConfidence` (no duplicate aggregation logic exists elsewhere)

#### Scenario: Success definition is testable in isolation
- **WHEN** `successDefinition` is given a "pause" rec + outcome with actionTaken="followed" and kpiDelta.metric="spend" with percentChange=-100
- **THEN** it returns true (spend going down is the desired direction for pause)
