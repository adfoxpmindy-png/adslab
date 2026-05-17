## Context

After Tier 1 + visibility UI shipped 2026-05-16, AdsLab's AI is now genuinely smart (vision + learning) but still acts only at campaign level. The founder dogfoods AdsLab daily and keeps having to bounce to Meta Ads Manager for ad-set tweaks ("pause this one bad ad set", "halve the budget on Cold audience", "duplicate winner with double budget"). This is the gap.

Constraints:
- The mutate-tool confirmation card pattern in [chat-service.ts](src/lib/ai/chat-service.ts) is the safety bar — every destructive action goes through user confirmation. Tier 2 tools inherit it for free by setting `kind: "mutate"`.
- Tier 1's `AIRecommendation` capture is the audit substrate. We don't add a new ActionLog table for ad-set / ad-level operations — the chat-layer capture already records intent + target + outcome via the existing pipeline.
- No new env vars. No schema migration. Just code.

## Goals / Non-Goals

**Goals:**
- AI in chat can pause/resume/budget-edit ad sets without bouncing to Meta Ads Manager.
- AI can pause a single bad ad without nuking its parent ad set.
- AI can duplicate a winning campaign with new budget/name + initial status.
- All 5 new tools wired into the learning loop so future-AI sees their outcomes.
- Type-check + zero new dependencies + zero schema migrations.

**Non-Goals:**
- `changeTargeting` (audience/geo edits) — needs safety design, deferred to Tier 3.
- `duplicateAdSetWithVariation` (creative permutations) — heavier UX; defer until requested.
- Ad-set-level audit-log table — chat capture is enough for v1.
- Bulk operations ("pause all ad sets matching X") — single-target only for safety.

## Decisions

### D1: Lightweight per-level action helpers — not extend CampaignActionLog
**Choice:** Create `adset-actions.ts` and `ad-actions.ts` with their own `performAdSetAction` / `performAdAction` functions. Do NOT extend `CampaignActionLog` to be tri-level (campaign/adset/ad).

**Why over alternatives:**
- Adding nullable `adSetId` + `adId` columns + an enum `level` to `CampaignActionLog` is a schema change with migration risk and breaks the "campaign action log" semantics readers rely on.
- AI tool-calls already capture intent + target into `AIRecommendation` (Tier 1). That covers the "what did AI try?" audit need.
- Failed actions still log via console + tool's structured error return — chat surface already shows these to the user.

**Trade-off:** No retroactive query "show me all paused ad sets in last 7 days" without a join through AIRecommendation. Acceptable; that report can be added later if needed.

### D2: `setAdSetBudget` validates lock to existing mode (daily vs lifetime)
**Choice:** Mirror `performCampaignAction`'s SET_BUDGET behavior — if the ad set already has a daily budget, only accept `dailyBudget`; if lifetime, only `lifetimeBudget`. Reject swaps.

**Why:** Meta rejects daily↔lifetime swaps on existing ad sets with cryptic errors. Catching it client-side keeps the UX clean. Same trade-off as the campaign-level version — and identical rationale.

### D3: Bounds — ฿20 – ฿1M, same as campaign budget
**Choice:** Reuse `MIN_BUDGET_THB` / `MAX_BUDGET_THB` from `campaign-actions.ts`.

**Why:** Single source of truth for Thai-account budget bounds. Founders can request override but it's almost always a typo (฿1,000,000 vs ฿100,000 fat-finger).

### D4: `duplicateCampaign` defaults to PAUSED initial status
**Choice:** Already the default in [duplicate-campaign.ts](src/lib/meta/duplicate-campaign.ts). The AI tool surfaces this default; user opt-in for ACTIVE means typing it explicitly.

**Why:** Duplicate-and-instantly-active is how the founder lost ฿1,400 on a typo last quarter (per memory note `feedback_reels_post_id` — well, similar incident). PAUSED default forces a manual review step.

**Trade-off:** Slightly more friction. The user can override via `initialStatus: "ACTIVE"` in tool input when they really mean it. AI will surface this in the confirmation card.

### D5: System prompt teaches AI when to use each
Add to `SYSTEM_PROMPT_BASE` in chat-service.ts:

```
- Use pauseAdSet (not pauseCampaign) when ONE ad set within a campaign is underperforming. Killing the whole campaign wastes the winning ad sets.
- Use pauseAd (not pauseAdSet) when ONE ad/creative is the problem. Common for fatigued creatives in a multi-ad ad set.
- Use setAdSetBudget when the ad set is ABO (its own budget). If the campaign is CBO, use setCampaignBudget instead — setAdSetBudget will fail.
- Use duplicateCampaign for SCALING a winner — typical pattern: source campaign at ฿X/day with ROAS > 2x, duplicate at ฿X*1.5/day with ACTIVE.
```

This is short and concrete. Avoid over-explaining; AI overuses tools when prompts are verbose.

### D6: Tool naming convention — match existing pattern
Existing: `pauseCampaign`, `resumeCampaign`, `setCampaignBudget`. New: `pauseAdSet`, `resumeAdSet`, `pauseAd`, `setAdSetBudget`, `duplicateCampaign`. Camel-case verb-Noun, no underscores. The id parameter is always the Meta numeric id (a string), matching existing tools.

## Risks / Trade-offs

- **Risk:** AI may pause an ad set that's the only one delivering in its campaign, accidentally killing all delivery.
  → Mitigation: the mutate-tool confirmation card already shows the action + target. User sees "pause AdSet Y inside Campaign X" before approving. Plus AI's reasoning explanation accompanies the card.

- **Risk:** Budget bounds (฿20 – ฿1M) might be too restrictive for advertisers running larger budgets.
  → Mitigation: the founder's own accounts max at ฿50k/day. Larger accounts can request override. Cure: if real users hit the ceiling, raise it; don't predesign for hypothetical scale.

- **Risk:** `duplicateCampaign` with ACTIVE + wrong budget multiplier could spend big money fast.
  → Mitigation: confirmation card surfaces the resulting absolute budget. AI defaults its tool args to PAUSED + 1.0 multiplier unless the user asked for scaling.

- **Risk:** System-prompt growth — adding 4 lines of tool-usage hints could push the prompt over efficient size.
  → Mitigation: the additions are <80 tokens combined. Current prompt is ~700 tokens; well within budget.

## Migration Plan

Pure additive — 5 new files + 2 modified. Ship in a single commit.

1. Add helpers (`adset-actions.ts`, `ad-actions.ts`).
2. Add 5 tool files.
3. Register in `tools/registry.ts`.
4. Wire chat-service capture + system-prompt addition.
5. `npx tsc --noEmit` clean.
6. Commit → push → archive OpenSpec change.

**Rollback:** delete the 5 new tools from the registry list. Old tools still work; AI just loses the new capabilities.

## Open Questions

- **Q:** Should `pauseAd` also auto-pause the parent ad set if it's the only ad inside?
  → No. Surprising side-effects are how AI loses user trust. If the user wants both, they can issue a second prompt.

- **Q:** Should we support `pauseMultipleAds([adId1, adId2])` for batch?
  → Defer. Keep single-target for safety this round. Re-evaluate after seeing real chat traffic.

- **Q:** Should the AI proactively suggest `duplicateCampaign` when a winner is detected?
  → Yes — covered by the existing Daily Report scaling rule ("Scale = +20% on the same campaign's budget"). The AI can call `setCampaignBudget` for scaling or `duplicateCampaign` for branching. We trust the AI to choose based on the post-Tier-1 outcome history it now sees.
