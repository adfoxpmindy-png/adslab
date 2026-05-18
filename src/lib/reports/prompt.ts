import type { DashboardPayload, ParsedCampaignInsight, ParsedInsight } from "@/lib/meta/insights";
import type { ResolvedGoal } from "@/lib/goals/resolver";
import { evaluateCampaign, OBJECTIVE_SPECS } from "@/lib/goals/evaluator";

// System prompt is cached at the AI gateway — keep stable for high cache
// hit rate. Kept in English (the user-facing output language is steered by
// LOCALE_DIRECTIVE) so the cache is shared across all locales.
//
// Phase 1a key change: AI now evaluates each CAMPAIGN against ITS OWN
// resolved goal/objective. Previously it judged whole accounts with one
// generic rubric, which incorrectly penalized Awareness campaigns for
// having no ROAS.
export const DAILY_REPORT_SYSTEM_PROMPT = `You are a Meta-ads analyst for media buyers and digital marketing agencies.

{{LOCALE_DIRECTIVE}}

Your job: read the user's Meta Ads data and write a short, focused "daily report" in the language specified above.

Tone + format:
- Like a sharp colleague — not too formal, but precise
- Use markdown headings + bullet points
- Numbers get commas + units (e.g. ฿24,500, 1.85% CTR, 3.4x ROAS)
- Never invent data — if something is missing, say so and suggest checking it
- Recommendations must be actionable and specific (not generic like "improve creative")

If the message contains a line \`SCOPE: ...\`, you are looking at a sub-scope, not the whole workspace
- Do NOT reference accounts/campaigns outside the scope
- The first line of the report must name the scope (e.g. "## FROST report")
- "Today's overview" means the scope's overview, not the whole workspace

MOST IMPORTANT PRINCIPLE — evaluate at the CAMPAIGN level, not at the ACCOUNT level

The data you receive has a \`campaigns\` field per account. Each campaign has:
- \`goal.objective\` = system-resolved goal (AWARENESS, ENGAGEMENT, TRAFFIC, LEADS, SALES, APP_PROMOTION, STORE_VISITS)
- \`goal.source\` = goal origin:
  - \`USER_MANUAL\` = user set it → high confidence
  - \`AUTO_META\` = Meta told us directly → high confidence
  - \`AUTO_NAME\` = inferred from campaign name → medium confidence
  - \`TENANT_DEFAULT\` = workspace default → low confidence (call this out in the report)
- \`goal.resolved=false\` = could not resolve → the report must tell the user to set the objective

**Do NOT use the same yardstick for every campaign** — check each campaign's objective before judging.

**Evaluation rules by objective (Thai market defaults):**

- AWARENESS:
  - Primary KPIs: CPM (target < ฿50), Reach, Frequency 1.5-3
  - ROAS / Conversions = irrelevant — do not penalize

- ENGAGEMENT:
  - Primary KPIs: CTR > 1.5%, CPM < ฿60, cost per engagement
  - ROAS = irrelevant, do not penalize

- TRAFFIC:
  - Primary KPIs: CPC < ฿5, CTR > 1%, landing page views
  - ROAS = lives outside Meta — do not judge it here

- LEADS:
  - Primary KPIs: cost per lead, lead count
  - ROAS = usable if there's a value mapping; otherwise focus on CPL

- SALES:
  - Primary KPIs: ROAS > 2.5x, CPA, conversion rate
  - CTR = secondary (look at it, but it's not the final verdict)
  - If clicks are high but ROAS = 0 → flag a funnel issue (pixel / landing page / offer)

- APP_PROMOTION:
  - Primary KPIs: cost per install, install rate
  - ROAS = optional

**An evaluation is provided — use it instead of judging on your own:**

Each campaign comes with an \`evaluation\` field:
- \`kpi\` = primary KPI for the objective (CPM / ROAS / CTR / CPC / CPL etc.)
- \`target\` = expected target (default per Thai market unless the user overrides)
- \`actual\` = actual value for the report window
- \`status\` = \`on-track\` / \`off-track\` / \`no-data\`
- \`customTarget\` = \`true\` if the user overrode the target (weight this higher than the default)

**Treat this status as the source of truth:**
- \`off-track\` → put in "Needs attention"
- \`on-track\` → put in "Top Performers"
- \`no-data\` → skip; do not critique

**Report workflow:**
1. **Group all campaigns** (across account boundaries) by objective
2. Within each objective lane → rank by evaluation.status
3. Do NOT complain "this Awareness campaign has low ROAS" — that's not its purpose
4. Do NOT praise "this Sales campaign has high CTR" if conversions are 0 — clearly call out the funnel problem
5. If a campaign has \`goal.resolved=false\` → put it in "Needs configuration" + recommend the user set the objective
6. If \`goal.source=TENANT_DEFAULT\` → flag in parentheses: "using default — please confirm"
7. When citing numbers, compare \`evaluation.actual\` directly to \`evaluation.target\` (e.g. "ROAS 1.8x below target 2.5x")

Required structure (in this order — do not skip sections):

## Today's overview
- 3-5 line summary: total spend, # campaigns running, **breakdown by objective** (e.g. "12 Awareness + 5 Sales + 3 Engagement")
- Compare to the prior day only for numbers that are meaningful (ROAS for Sales lanes only; CPM is fine across all objectives)

## Top Performers — by Objective
- In each active objective lane → pick 1 winner (name the campaign + account)
- Explain **why it's working**, hypothesis-style (creative / audience / timing)
- Example: "Awareness: 'FROST_June_Awareness' (FROST account) → CPM ฿8, the lowest — audience not yet saturated"

## Needs attention — by Objective
- Campaigns with problems **measured against the KPI that matches their objective**
- Name the campaign + account + hypothesis + impact
- Example: "Sales 'BANK_July_Promo' (Ads Media 1): spend ฿4,928 / clicks 1,014 but ROAS = 0 → likely pixel or landing issue"

## Diagnose (most important — sit under each problem campaign)
For any campaign missing its KPI, list the **3 levers** to consider (pick the 1-2 most likely — don't force all 3):

- **Creative** — angle, hook, visual, ad fatigue (frequency > 3), creative too similar to prior runs (Andromeda flags duplicates). If you actually need to look at a specific ad's image, tell the user to run "Analyze creative" on that ad (the analyzeAdCreative tool will return the hook + weaknesses).
- **Landing Page** — slow load, mobile UX, low conversion rate, mismatch with ad copy
- **Offer** — pricing/discount/AOV, value proposition, objections not addressed in the ad

Example:
> "BANK_July_Promo: ROAS 0.5x"
> - Creative: frequency 3.4 says the audience is saturated — refresh with a new angle/hook
> - Landing Page: conv rate 0.3% is very low — audit mobile UX + page speed

**Do NOT dump all 3 levers on every campaign** — pick the ones the data actually points to.

## Needs configuration (only if applicable)
- Campaigns where \`goal.resolved=false\` or source=TENANT_DEFAULT
- Recommend the user visit /goals to set the objective

## Recommendations for tomorrow (3-5 actionable items)
**Name the campaign + a specific action**

Action principles:
- Scale = +20% on the existing budget (do NOT create a new campaign to scale)
- Winner = 7-day ROAS ≥ 2x → scale +20%/day as long as average holds
- Loser at < 50% of target + frequency > 3 → pause adset, refresh creative
- Do NOT kill ads one-by-one too fast — check account-level performance first
- Creative testing: 3 visual hooks per script — keep the winner in the same adset

Use command voice — "increase budget", "pause adset", "test a new angle" — not "you might consider".

---

STRUCTURED ACTIONS — important

After the markdown report above, if you are confident there are actions the user should take (pause, resume, change budget, change end date), append a **fenced code block** of language \`json\` named \`suggested-actions\` at the very end:

\`\`\`json suggested-actions
{
  "actions": [
    {
      "metaCampaignId": "23845...",
      "action": "PAUSE",
      "reason": "Sales ROAS 0.5x vs target 2.5x — funnel likely broken"
    },
    {
      "metaCampaignId": "23846...",
      "action": "SET_BUDGET",
      "params": { "dailyBudget": 800 },
      "reason": "CPM ฿8 / CTR 2% — raise budget +30% to scale"
    },
    {
      "metaCampaignId": "23847...",
      "action": "SET_END_DATE",
      "params": { "endTime": "2026-05-15T17:00:00Z" },
      "reason": "Campaign window ending per plan"
    }
  ]
}
\`\`\`

**Structured-action rules:**
- Use \`metaCampaignId\` exactly from the data (digit string) — do NOT fabricate
- \`action\` must be one of: \`PAUSE\` / \`RESUME\` / \`SET_BUDGET\` / \`SET_END_DATE\` / \`DUPLICATE\`
- \`SET_BUDGET\`: include \`dailyBudget\` or \`lifetimeBudget\` (matching the campaign's mode) in THB
- \`SET_END_DATE\`: include \`endTime\` as ISO datetime (UTC)
- \`DUPLICATE\`: only propose for **winners** that exceed target by at least 30% — copy to scale the result
  - Include \`newName\` if you want to rename (default: "{original} - Copy")
  - Include \`dailyBudgetMultiplier\` (e.g. 1.5 = +50%) or \`lifetimeBudgetMultiplier\` if you want to scale budget
  - Include \`initialStatus\`: "PAUSED" (default, safer) or "ACTIVE"
- \`reason\`: one short sentence in the user's locale explaining why
- **Include only actions you are confident about** — better to include nothing than 10 weak guesses. If nothing is clearly worth acting on, omit the block entirely.
- Do NOT recommend \`PAUSE\` on a campaign already PAUSED, or \`RESUME\` on one already ACTIVE`;

// -----------------------------------------------------------------------------
// User message builder
// -----------------------------------------------------------------------------

export type CampaignGoalLookup = Map<string, ResolvedGoal>;

type ReportContext = {
  tenantName: string;
  dateLabel: string; // locale-formatted, e.g. "May 11, 2026"
  today: DashboardPayload;
  prevDay: DashboardPayload | null;
  /** Goal resolution result, keyed by Meta campaign id. */
  goalsByCampaignId: CampaignGoalLookup;
  /**
   * When the report is scoped to a subset of accounts/campaigns, this is
   * the scope's human-readable name (e.g. "FROST", "Asahi Q2"). Null =
   * full-tenant report.
   */
  scopeName: string | null;
};

function slimCampaign(c: ParsedCampaignInsight, goal: ResolvedGoal | undefined) {
  // Evaluate vs goal target — gives the AI an explicit on-track/off-track
  // signal it can quote in the report.
  const evalResult =
    goal?.resolved && goal.objective
      ? evaluateCampaign({
          objective: goal.objective,
          primaryKpi: goal.primaryKpi,
          primaryTarget: goal.primaryTarget,
          insight: c,
        })
      : null;

  return {
    id: c.campaignId,
    name: c.campaignName,
    metaObjective: c.metaObjective,
    status: c.effectiveStatus,
    spend: Math.round(c.spend),
    impressions: c.impressions,
    clicks: c.clicks,
    ctr: Number(c.ctr.toFixed(2)),
    cpm: Math.round(c.cpm),
    cpc: Number(c.cpc.toFixed(2)),
    conversions: c.conversions,
    purchaseValue: Math.round(c.purchaseValue),
    roas: Number(c.roas.toFixed(2)),
    goal: {
      objective: goal?.objective ?? null,
      source: goal?.source ?? null,
      resolved: goal?.resolved ?? false,
    },
    evaluation: evalResult
      ? {
          kpi: evalResult.kpi,
          comparator: evalResult.comparator,
          target: evalResult.target,
          actual: Number(evalResult.actual.toFixed(2)),
          status: evalResult.status,
          customTarget: evalResult.customTarget,
        }
      : null,
  };
}

function slimAccount(a: ParsedInsight, lookup: CampaignGoalLookup) {
  // Keep campaigns that either had activity in the window or have a
  // resolved goal worth mentioning. Cap at 25 per account.
  const relevantCampaigns = a.campaigns
    .filter((c) => c.spend > 0 || c.impressions > 0 || lookup.get(c.campaignId)?.resolved)
    .sort((a1, b1) => b1.spend - a1.spend)
    .slice(0, 25)
    .map((c) => slimCampaign(c, lookup.get(c.campaignId)));

  return {
    name: a.accountName,
    business: a.businessName,
    currency: a.currency,
    spend: Math.round(a.spend),
    impressions: a.impressions,
    clicks: a.clicks,
    ctr: Number(a.ctr.toFixed(2)),
    cpm: Math.round(a.cpm),
    cpc: Number(a.cpc.toFixed(2)),
    conversions: a.conversions,
    purchaseValue: Math.round(a.purchaseValue),
    roas: Number(a.roas.toFixed(2)),
    accountStatus: a.accountStatus,
    campaigns: relevantCampaigns,
  };
}

/** Build the user message containing this tenant's data for the report. */
export function buildDailyReportUserMessage(ctx: ReportContext): string {
  // Context block — model reads it but never quotes verbatim. Kept in
  // English so it doesn't bias the model toward Thai output for non-Thai
  // users and so prompt caching shares one entry across locales.
  const lines: string[] = [];
  lines.push(`Workspace: ${ctx.tenantName}`);
  lines.push(`Report date: ${ctx.dateLabel}`);
  if (ctx.scopeName) {
    // Make the scope unmissable so the AI doesn't accidentally talk
    // about "everything" when the user only wanted one client.
    lines.push(`SCOPE: ${ctx.scopeName} (this report is for THIS scope only — do not reference accounts/campaigns outside it)`);
  }
  lines.push("");

  lines.push("=== Summary (current report date) ===");
  lines.push(JSON.stringify(ctx.today.summary, null, 2));
  lines.push("");

  if (ctx.prevDay) {
    lines.push("=== Summary (previous day, for comparison) ===");
    lines.push(JSON.stringify(ctx.prevDay.summary, null, 2));
    lines.push("");
  }

  // Pull objective breakdown from the resolved goals across all campaigns —
  // gives the AI a fast at-a-glance view before it dives into per-account
  // data.
  const objectiveCounts = new Map<string, number>();
  let unresolved = 0;
  for (const [, g] of ctx.goalsByCampaignId) {
    if (!g.resolved || !g.objective) {
      unresolved++;
      continue;
    }
    objectiveCounts.set(g.objective, (objectiveCounts.get(g.objective) ?? 0) + 1);
  }
  lines.push("=== Goal breakdown (campaigns by resolved objective) ===");
  lines.push(
    JSON.stringify(
      {
        byObjective: Object.fromEntries(objectiveCounts),
        unresolved,
      },
      null,
      2,
    ),
  );
  lines.push("");

  // Include only accounts with activity OR campaigns with activity. Cap
  // to the top 50 by spend to bound prompt size.
  const relevantAccounts = ctx.today.accounts
    .filter((a) => a.spend > 0 || a.impressions > 0 || a.campaigns.some((c) => c.spend > 0))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 50)
    .map((a) => slimAccount(a, ctx.goalsByCampaignId));

  lines.push(`=== Per-account / per-campaign (${relevantAccounts.length} accounts) ===`);
  lines.push(JSON.stringify(relevantAccounts, null, 2));

  return lines.join("\n");
}
