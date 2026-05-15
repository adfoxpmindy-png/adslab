## ADDED Requirements

### Requirement: Every concrete AI recommendation SHALL be persisted as an `AIRecommendation` row
A recommendation is concrete when it names a Meta entity (campaign/adset/ad id) and a structured action class (pause / resume / scale / refresh-creative / change-budget / change-targeting / diagnose / other). Generic textual advice without a target is not captured.

#### Scenario: Daily Report's structured action becomes a recommendation
- **GIVEN** the daily-report generator produced a `suggested-actions` JSON block containing one PAUSE action for campaign id `120249xxx`
- **WHEN** the report is finalised and persisted
- **THEN** an `AIRecommendation` row is created with `source = "daily_report"`, `actionType = "pause"`, `targetMetaId = "120249xxx"`, and `reasoning` populated from the action's `reason` field

#### Scenario: Chat tool call becomes a recommendation
- **GIVEN** the AI in the chat invokes the `pauseCampaign` mutate tool against campaign id `120249xxx`
- **WHEN** the tool call is logged (regardless of whether the user later approves it)
- **THEN** an `AIRecommendation` row is created with `source = "chat_tool"`, `actionType = "pause"`, `targetMetaId = "120249xxx"`

#### Scenario: Generic chat answer is NOT a recommendation
- **GIVEN** the AI replies in chat with general strategy advice and does not call any mutate tool
- **WHEN** the message is saved
- **THEN** NO `AIRecommendation` row is created

### Requirement: Each recommendation SHALL eventually be paired with an outcome computed 7+ days later
A periodic job SHALL compute and persist an `AIRecommendationOutcome` for every recommendation that is at least 7 days old and does not yet have an outcome. The outcome captures the user's action (`followed` / `ignored` / `opposite` / `target_deleted`) and the KPI delta of the target entity over the windows BEFORE and AFTER the recommendation date.

#### Scenario: Followed recommendation is detected
- **GIVEN** AI recommended PAUSE on campaign `C` 7 days ago, and `C`'s `effective_status` is now `PAUSED`
- **WHEN** the outcome cron runs
- **THEN** the resulting `AIRecommendationOutcome` SHALL have `actionTaken = "followed"`

#### Scenario: Ignored recommendation is detected
- **GIVEN** AI recommended PAUSE on campaign `C` 7 days ago, and `C` is still `ACTIVE`
- **WHEN** the outcome cron runs
- **THEN** the resulting outcome SHALL have `actionTaken = "ignored"`

#### Scenario: KPI delta is computed for a followed scaling recommendation
- **GIVEN** AI recommended SCALE_BUDGET +20% on campaign `C` 7 days ago, the budget was raised, and ROAS over the 7 days BEFORE was `1.8x` vs. 7 days AFTER is `2.4x`
- **WHEN** the outcome cron runs
- **THEN** outcome.kpiDelta SHALL contain `{ metric: "roas", before: 1.8, after: 2.4, percentChange: 33.3 }`

#### Scenario: Target deletion is handled
- **GIVEN** the campaign referenced by a recommendation has been deleted in Meta
- **WHEN** the outcome cron runs
- **THEN** outcome.actionTaken SHALL be `target_deleted`; KPI delta SHALL be `null`; no error is raised

### Requirement: Recent recommendation outcomes for a tenant SHALL be injected into future AI prompts
When AI generates a Daily Report or a chat response, the system SHALL fetch the tenant's last 5-10 recommendations with their outcomes (if any) and inject them as a "history of what worked / what didn't" section. The AI is instructed to use this history to skew toward patterns that worked for THIS tenant.

#### Scenario: Daily Report uses tenant history
- **GIVEN** tenant T has 6 prior outcomes: 4 SCALE recommendations followed → average +28% ROAS, 2 PAUSE recommendations followed → no measurable effect
- **WHEN** the next Daily Report runs for T
- **THEN** the AI user message SHALL include a section summarising these outcomes, and the resulting recommendations SHALL skew toward SCALE actions when conditions match (consistent with what's worked)

#### Scenario: Fresh tenant has empty history
- **GIVEN** tenant T has no prior recommendations or outcomes
- **WHEN** the next AI surface runs for T
- **THEN** no history section is injected and AI behaves identically to today

### Requirement: The outcomes computation SHALL piggyback on the existing daily-report cron
To stay within Vercel Hobby's 2-cron-job limit, the outcome computation runs in the same cron handler as the daily report (and the rules tick already wired there). Failure of outcome computation MUST NOT block report generation.

#### Scenario: Outcome cron failure doesn't break daily report
- **WHEN** the outcome computation throws for one tenant (e.g. missing insight cache)
- **THEN** the cron logs the failure and continues to the next tenant; the daily report for the failed tenant still ships if separately healthy
