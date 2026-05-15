## ADDED Requirements

### Requirement: The AI SHALL be able to analyze an ad's creative via a new `analyzeAdCreative` tool
A new tool registered with the AI chat, named `analyzeAdCreative`, takes an ad id (Meta numeric string) and returns a structured evaluation of the actual creative image or video thumbnail. The evaluation comes from a vision-capable LLM call, not from metrics inference.

#### Scenario: Tool fetches the right asset
- **WHEN** the AI calls `analyzeAdCreative({ adId: "120249xxx" })`
- **THEN** the tool SHALL fetch `creative{thumbnail_url, image_url, video_id}` from Meta for that ad and use the highest-quality available URL (preferred order: image_url → thumbnail_url → video thumbnail at 1080p)

#### Scenario: Vision call returns a structured evaluation
- **GIVEN** a working creative URL
- **WHEN** the vision LLM is invoked with the image and a structured prompt
- **THEN** the returned tool result SHALL contain at minimum: `hook` (text), `visualHierarchy` (1-5), `textLegibility` (1-5), `emotionalTone` (string), `dominantColor` (string), `weaknesses` (array of strings), `strengths` (array of strings)

#### Scenario: Tool returns gracefully when no asset is available
- **GIVEN** an ad whose creative has no image_url, no thumbnail_url, and no video_id
- **WHEN** `analyzeAdCreative` runs
- **THEN** the tool result SHALL be `{ error: "no_visual_asset", message: "Ad has no fetchable visual" }` — no exception raised to the chat loop

### Requirement: Vision evaluations SHALL be cached for 7 days on the `MetaAd` row
A new column `MetaAd.creativeAnalysis` (Json) and `MetaAd.creativeAnalyzedAt` (DateTime) store the most recent evaluation. The tool SHALL check this cache before issuing a fresh vision call. Cache hits do not bill Claude.

#### Scenario: Repeated diagnosis of the same ad uses cache
- **GIVEN** ad A was analyzed 2 days ago and the result is stored on `MetaAd.creativeAnalysis`
- **WHEN** the AI calls `analyzeAdCreative({ adId: A })` again
- **THEN** the tool returns the cached result without a fresh vision call; tool result includes `{ cached: true, cachedAt: "..." }`

#### Scenario: Cache expires after 7 days
- **GIVEN** an analysis stored 8+ days ago
- **WHEN** the tool is called for that ad
- **THEN** a fresh vision call is made and the cache is overwritten

### Requirement: The AI chat SHALL be instructed to call `analyzeAdCreative` when relevant
The system prompt SHALL tell the model:
- Call `analyzeAdCreative` whenever the user asks about a specific ad's creative quality
- Call it as part of the diagnose flow when an underperforming adset is being investigated
- Do NOT call it speculatively for every ad listed by `listCampaigns` — only when narrowing to one underperformer

#### Scenario: Diagnose flow uses vision
- **WHEN** the user opens AI chat via the campaigns-page Diagnose deep-link and the AI is investigating why an adset's CTR is low
- **THEN** the AI SHALL call `analyzeAdCreative` against at least one ad in that adset and include the visual evaluation in its 3-lever diagnosis

#### Scenario: General strategy chat doesn't call vision
- **WHEN** the user asks a general "how do I write better hooks" question with no specific ad referenced
- **THEN** the AI SHALL answer from `searchKnowledge` without invoking `analyzeAdCreative`

### Requirement: Vision usage SHALL respect a per-tenant soft daily quota
To prevent runaway cost, each tenant has a configurable per-day cap on vision calls. Default 50. When the cap is hit, subsequent `analyzeAdCreative` calls return a `{ error: "quota_exceeded" }` result; the AI is instructed to fall back to text-only diagnosis for the rest of the day.

#### Scenario: Quota kicks in
- **GIVEN** tenant T has already made 50 vision calls today
- **WHEN** the AI tries to call `analyzeAdCreative` a 51st time
- **THEN** the tool returns `{ error: "quota_exceeded", limit: 50, resetsAt: "tomorrow_00_UTC" }` and the AI completes its answer without vision
