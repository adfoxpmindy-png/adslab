## ADDED Requirements

### Requirement: Tenant SHALL be able to create, edit, list, enable/disable, and delete auto-rules
The system SHALL expose tenant-scoped CRUD over `Rule` entities through `/api/rules` and the `/t/[slug]/rules` page. Each rule consists of: human-readable `name`, structured `condition` (metric/op/value/windowHours/scope), `action` enum, optional `targetIds` (specific campaigns/adsets to apply to; empty = all in tenant), and an `enabled` flag.

#### Scenario: Owner creates a new rule
- **WHEN** an OWNER or MEDIA_BUYER on an Agency Starter+ tier POSTs `/api/rules?tenantSlug=demo` with valid `{ name, condition, action }`
- **THEN** the system persists a `Rule` row tied to the tenant, returns `201` with the rule body, and the rule appears in subsequent `GET /api/rules` responses

#### Scenario: Owner toggles a rule off
- **WHEN** an OWNER PATCHes `/api/rules/:id` with `{ enabled: false }`
- **THEN** the rule remains in the database but the next hourly tick SHALL skip it without writing a `RuleRun` row

#### Scenario: Owner deletes a rule
- **WHEN** an OWNER DELETEs `/api/rules/:id`
- **THEN** the rule is removed; existing `RuleRun` rows referencing it are retained (audit log preserved) but display as "(deleted rule)" in the history view

### Requirement: Rule conditions SHALL evaluate over a windowed snapshot of Meta insights
For each active rule, the system SHALL compute the metric (`cpv`, `roas`, `spend`, `frequency`, `ctr`) over the rule's `windowHours` (1, 2, 6, or 24) at the rule's `scope` (`adset` or `campaign`), compare with the configured operator and threshold, and treat the rule as "matched" if the comparison is true.

#### Scenario: CPV rule triggers when threshold exceeded
- **GIVEN** a rule "pause if `cpv > 5` over `windowHours = 2` at `scope = adset`" attached to adset A
- **WHEN** the hourly tick fetches adset A's last-2h insights and computes CPV = ฿6.30
- **THEN** the rule SHALL match and the action SHALL fire

#### Scenario: ROAS rule does not trigger above threshold
- **GIVEN** a rule "notify if `roas < 1.5` over `windowHours = 24`" attached to campaign C
- **WHEN** campaign C's last-24h ROAS is 2.1
- **THEN** the rule SHALL NOT match; a `RuleRun` row is written with `matched: false`

#### Scenario: Window has no impressions yet
- **WHEN** an adset has zero impressions during the rule's window
- **THEN** the rule SHALL NOT match (metrics that divide by zero are treated as undefined, not infinite); the `RuleRun` SHALL record `status: "skipped_no_data"`

### Requirement: Matched rules SHALL dispatch their action exactly once per 24-hour cooldown
On match, the system SHALL invoke the action handler corresponding to `Rule.action`. Each rule SHALL fire its action at most once per rolling 24-hour window per target entity, preventing flapping.

#### Scenario: Pause adset action is idempotent
- **WHEN** the action `pause_adset` fires against adset A and adset A is already PAUSED in Meta
- **THEN** the system SHALL treat this as success (no Meta API error surfaced to user), write a `RuleRun` with `status: "matched", actionResult: "no_change_needed"`

#### Scenario: Cooldown blocks duplicate fires
- **GIVEN** rule R fired the `pause_campaign` action against campaign C at 02:00
- **WHEN** the 03:00 tick re-evaluates R and the condition still matches
- **THEN** the system SHALL write a `RuleRun` with `status: "matched_in_cooldown"` and NOT call Meta API

#### Scenario: Notify email action emits one email
- **WHEN** action `notify_email` matches and the rule has fired no email in the past 24h
- **THEN** the system SHALL send exactly one email via Resend to all tenant OWNERs containing rule name, matched metric, value, threshold, and a link to the entity in Meta Ads Manager

### Requirement: A scheduled cron SHALL evaluate every active rule once per hour
The system SHALL register a Vercel cron at `0 * * * *` invoking `/api/cron/rules-tick`. Each invocation SHALL enumerate every active rule across all tenants, batch insights pulls by ad account, evaluate conditions, dispatch matched actions, and write a `RuleRun` row for each evaluation.

#### Scenario: Tick runs even with no active rules
- **WHEN** the hourly cron fires and no tenant has any enabled rules
- **THEN** the endpoint SHALL return `{ ok: true, evaluated: 0 }` without error

#### Scenario: One tenant's failure does not stop other tenants' processing
- **WHEN** Meta API returns 500 for tenant X's insights call
- **THEN** the tick SHALL log the error, write a `RuleRun` with `status: "error"` for X's rules, and continue evaluating other tenants' rules

#### Scenario: Cron auth gate
- **WHEN** any request to `/api/cron/rules-tick` lacks `Authorization: Bearer <CRON_SECRET>`
- **THEN** the system SHALL return `401`

### Requirement: Tier gating SHALL prevent rule creation/execution on insufficient plans
The system SHALL enforce a per-tier `maxActiveRules` cap defined in `tier-rules.ts` (Solo=0, Agency Starter=5, Pro=20, Unlimited=∞). Solo tier SHALL be able to view but not create rules. Exceeding the cap SHALL block creation with a 402 response.

#### Scenario: Solo tier blocked from creating
- **WHEN** a tenant on Solo tier POSTs `/api/rules`
- **THEN** the system SHALL return `402 Payment Required` with body `{ error: "upgrade_required", currentTier: "solo", requiredTier: "agency_starter" }`

#### Scenario: Starter tier blocked at cap
- **GIVEN** a tenant on Agency Starter with 5 active rules
- **WHEN** the tenant tries to POST a 6th rule
- **THEN** the system SHALL return `402` with `{ error: "rule_limit_reached", limit: 5, currentTier: "agency_starter" }`

#### Scenario: Disabling a rule frees a slot
- **GIVEN** a Starter tenant at the 5-rule cap
- **WHEN** the tenant disables one rule (`enabled: false`)
- **THEN** the cap counter drops to 4 and a new rule can be created

### Requirement: Quick Boost SHALL be able to attach a default safety rule at execute time
The Quick Boost flow SHALL expose an optional "Auto-pause if KPI not met" checkbox per brief. When enabled, the `/api/boost/execute` handler SHALL, after successfully creating each adset, also create a `Rule` of the form "pause_adset if cpv > 2× target within 2h, scope = the created adset". If the rule would exceed the tenant's tier cap, the system SHALL create the boost campaigns but skip rule attachment and return a warning in the response.

#### Scenario: Boost attaches default rule when checkbox checked
- **GIVEN** a brief with `defaultRule: true` and a parsed KPI of "CPV ≤ ฿2.5"
- **WHEN** `/api/boost/execute` succeeds for that brief
- **THEN** a `Rule` SHALL exist linked to the new adset with `condition: { metric: "cpv", op: "gt", value: 5.0, windowHours: 2, scope: "adset", targetIds: ["<adset_id>"] }` and `action: "pause_adset"`

#### Scenario: Tier cap silently skips rule attachment
- **GIVEN** an Agency Starter tenant already at the 5-rule cap
- **WHEN** a boost with `defaultRule: true` is executed
- **THEN** the campaigns SHALL be created, no rule SHALL be attached, and the response SHALL include `warnings: [{ briefId, reason: "rule_cap_reached" }]`

### Requirement: AI rule suggestion endpoint SHALL propose rules from historical performance
The system SHALL expose `POST /api/rules/suggest` which calls the Claude analysis model with the tenant's last-30-days insights and a list of recent manual pause actions (from `MetaActionLog`). The response SHALL contain ≤3 candidate rules, each with `name`, full `condition`, `action`, and a `rationale` string explaining why this rule is suggested.

#### Scenario: Suggestions reference observed behavior
- **GIVEN** a tenant who has manually paused 7 adsets in the last 30 days, each with CPV > ฿4 at pause time
- **WHEN** the suggest endpoint is called
- **THEN** at least one returned candidate SHALL be a CPV-based pause rule with threshold ≈ ฿4 and a rationale citing the 7 historical pauses

#### Scenario: Suggestions are not auto-applied
- **WHEN** the suggest endpoint returns 3 candidate rules
- **THEN** no `Rule` SHALL be persisted; the candidates exist only in the response body until the user explicitly POSTs `/api/rules` to accept one

#### Scenario: Tenant with no history gets generic suggestions
- **WHEN** a new tenant with no manual pause history calls suggest
- **THEN** the response SHALL contain 3 generic conservative starter rules (e.g., "pause if spend exceeds 150% of daily budget", "notify if CPV doubles in 2h") with rationales noting "no history available, suggesting safe defaults"

### Requirement: Every rule evaluation SHALL produce an auditable `RuleRun` record
For each (rule, tick) pair, the system SHALL write one `RuleRun` row containing: `ruleId`, `tickAt`, `evaluatedMetric`, `evaluatedValue`, `threshold`, `matched` boolean, `status` enum (`matched | not_matched | skipped_no_data | matched_in_cooldown | error`), `actionResult` (when matched), and any `errorMessage`. Users SHALL be able to view this log per rule.

#### Scenario: User views rule history
- **WHEN** an OWNER GETs `/api/rules/:id/runs?limit=50`
- **THEN** the response SHALL return the most recent 50 `RuleRun` rows ordered by `tickAt` desc, including matched and not-matched evaluations

#### Scenario: Orphan target writes skipped status
- **GIVEN** a rule targeting adset A
- **WHEN** the tick runs and adset A has been deleted in Meta
- **THEN** the `RuleRun` SHALL record `status: "skipped_orphan", errorMessage: "target adset no longer exists in Meta"` and the rule's `enabled` flag SHALL be flipped to `false` automatically so it stops re-triggering

### Requirement: Rule changes SHALL be authorized by tenant role
Only tenant OWNER and MEDIA_BUYER roles SHALL be permitted to create, edit, enable/disable, or delete rules. VIEWER role SHALL be able to read rules and run logs but not modify.

#### Scenario: Viewer blocked from creating
- **WHEN** a VIEWER role POSTs `/api/rules`
- **THEN** the system SHALL return `403 Forbidden` with `{ error: "insufficient_role" }`

#### Scenario: Viewer can read history
- **WHEN** a VIEWER GETs `/api/rules` or `/api/rules/:id/runs`
- **THEN** the system SHALL return the data with `200 OK`
