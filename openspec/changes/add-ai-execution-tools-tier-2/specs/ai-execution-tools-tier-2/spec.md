## ADDED Requirements

### Requirement: Pause an individual ad set via AI chat
The system SHALL provide an AI tool `pauseAdSet` that, given a Meta ad set id, pauses that ad set on Meta. The tool MUST be of kind `mutate` so the chat UI surfaces a confirmation card before execution. The handler MUST resolve the ad set's internal id from `MetaAdSet` and verify tenant ownership before calling Meta. It MUST update the local `MetaAdSet.configuredStatus` cache row on success.

#### Scenario: Pause a running ad set
- **WHEN** AI calls `pauseAdSet({ adSetId: "120243958192840714" })` and the user confirms
- **THEN** the system POSTs `status=PAUSED` to `/120243958192840714` on Meta, updates `MetaAdSet.configuredStatus = "PAUSED"`, and returns `{ ok: true, adSetId, adSetName, beforeStatus, afterStatus: "PAUSED" }`

#### Scenario: Ad set does not belong to tenant
- **WHEN** AI calls `pauseAdSet` with an ad set id not in the tenant's connection
- **THEN** the tool returns `{ error: "AdSet <id> ไม่พบใน tenant นี้" }` without calling Meta

### Requirement: Resume a paused ad set via AI chat
The system SHALL provide an AI tool `resumeAdSet` that flips a paused ad set back to ACTIVE. Same auth/cache rules as `pauseAdSet`. Idempotent — resuming an already-active ad set returns success with `beforeStatus === afterStatus`.

#### Scenario: Resume a paused ad set
- **WHEN** AI calls `resumeAdSet({ adSetId: "..." })` on a PAUSED ad set and user confirms
- **THEN** the ad set's configured status becomes ACTIVE on Meta and in the local cache

### Requirement: Pause an individual ad via AI chat
The system SHALL provide an AI tool `pauseAd` that pauses a single ad within an ad set. The handler MUST resolve via `MetaAd` and verify tenant ownership through the ad set → campaign → connection chain. Updates `MetaAd.configuredStatus` on success.

#### Scenario: Pause one ad in a multi-ad ad set
- **WHEN** AI calls `pauseAd({ adId: "<id>" })` on a specific ad and user confirms
- **THEN** only that ad is paused; sibling ads in the same ad set remain ACTIVE

### Requirement: Adjust ad-set-level budget via AI chat
The system SHALL provide an AI tool `setAdSetBudget` that accepts exactly one of `dailyBudget` or `lifetimeBudget` (in THB) and updates the ad set's budget on Meta. Validation:
- Reject if the ad set has neither daily nor lifetime budget set (ie. campaign is CBO).
- Reject swaps (daily ↔ lifetime).
- Reject `< ฿20` or `> ฿1,000,000`.
- Multiply THB → minor units (×100) per Meta's expectation for THB accounts.

#### Scenario: Increase daily budget on an ABO ad set
- **WHEN** AI calls `setAdSetBudget({ adSetId, dailyBudget: 500 })` on an ABO ad set with daily budget currently ฿300, and user confirms
- **THEN** the ad set's `daily_budget` on Meta becomes `50000` (minor units), `MetaAdSet.dailyBudget` cache becomes `50000`, and the tool returns `{ ok: true, beforeValue: { dailyBudget: 30000 }, afterValue: { dailyBudget: 50000 } }`

#### Scenario: Budget on a CBO ad set
- **WHEN** AI calls `setAdSetBudget` on an ad set whose campaign is CBO (so ad-set-level budget is null)
- **THEN** the tool returns `{ error: "Ad set นี้ไม่มี budget ของตัวเอง — แก้ที่ campaign แทน (CBO)" }` without calling Meta

#### Scenario: Out-of-bounds budget
- **WHEN** AI calls `setAdSetBudget` with `dailyBudget: 5`
- **THEN** the tool returns `{ error: "Budget ต่ำกว่าขั้นต่ำ ฿20" }` and does not call Meta

### Requirement: Duplicate a campaign via AI chat
The system SHALL provide an AI tool `duplicateCampaign` that wraps the existing `duplicateCampaign` server helper. Tool input includes `campaignId` plus optional `newName`, `dailyBudget` | `lifetimeBudget` | `dailyBudgetMultiplier` | `lifetimeBudgetMultiplier`, and `initialStatus` (default `PAUSED`). Tool resolves the internal MetaCampaign id, calls the helper, and returns the new campaign's id + name + status.

#### Scenario: Duplicate a winner at 1.5x budget
- **WHEN** AI calls `duplicateCampaign({ campaignId: "<id>", dailyBudgetMultiplier: 1.5, initialStatus: "ACTIVE" })` and the source has `dailyBudget: 20000` (฿200/day), and the user confirms
- **THEN** a new campaign is created on Meta and cached locally with daily budget `30000` (฿300/day), status ACTIVE, name `"<source name> (Copy)"` unless overridden

#### Scenario: Default safe duplicate
- **WHEN** AI calls `duplicateCampaign({ campaignId: "<id>" })` with no overrides
- **THEN** the duplicate is created PAUSED with same budget as source, ready for the user to inspect before activating

### Requirement: Tool calls captured into AIRecommendation history
The system SHALL extend `captureRecommendationFromToolCall` in chat-service.ts to map each of the 5 new tool names to an `AIRecommendation` row with appropriate `actionType` and `targetKind`. This lets the Tier 1 learning loop see Tier 2 actions when it computes outcomes 7 days later.

Mapping table:

| Tool | actionType | targetKind |
|------|-----------|-----------|
| pauseAdSet | pause | adset |
| resumeAdSet | resume | adset |
| pauseAd | pause | ad |
| setAdSetBudget | change_budget | adset |
| duplicateCampaign | scale_budget | campaign |

#### Scenario: AI calls pauseAdSet — capture happens
- **WHEN** the AI calls `pauseAdSet({ adSetId: "X" })` (regardless of user approve / reject downstream)
- **THEN** an `AIRecommendation` row is written with `source: "chat_tool"`, `actionType: "pause"`, `targetKind: "adset"`, `targetMetaId: "X"`, ready to be paired with an outcome row after 7 days
