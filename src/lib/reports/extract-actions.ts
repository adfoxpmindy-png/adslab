import { z } from "zod";
import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { isCboCampaign } from "@/lib/meta/campaign-actions";

/**
 * AI-suggested action that has been parsed, validated against the
 * tenant's actual campaigns, and is safe to render in the UI.
 */
export type ValidatedSuggestion = {
  /** Stable id we generate for client-side keying + apply/dismiss API. */
  id: string;
  /** Internal MetaCampaign.id (cuid) — what /api/meta/campaign-actions expects. */
  internalCampaignId: string;
  /** Meta campaign id (digit string) — kept for display/debug. */
  metaCampaignId: string;
  /** Cached campaign name at time of report, in case the row changes later. */
  campaignName: string;
  action: "PAUSE" | "RESUME" | "SET_BUDGET" | "SET_END_DATE" | "DUPLICATE";
  params?: {
    dailyBudget?: number;
    lifetimeBudget?: number;
    endTime?: string;
    newName?: string;
    dailyBudgetMultiplier?: number;
    lifetimeBudgetMultiplier?: number;
    initialStatus?: "PAUSED" | "ACTIVE";
  };
  reason: string;
  status: "pending" | "applied" | "dismissed";
  appliedLogId?: string;
  errorMessage?: string;
  /** For DUPLICATE: the new campaign's name once applied. */
  newCampaignName?: string;
};

const rawActionSchema = z.discriminatedUnion("action", [
  z.object({
    metaCampaignId: z.string().min(1),
    action: z.literal("PAUSE"),
    reason: z.string().min(1).max(500),
  }),
  z.object({
    metaCampaignId: z.string().min(1),
    action: z.literal("RESUME"),
    reason: z.string().min(1).max(500),
  }),
  z.object({
    metaCampaignId: z.string().min(1),
    action: z.literal("SET_BUDGET"),
    params: z.object({
      dailyBudget: z.number().positive().optional(),
      lifetimeBudget: z.number().positive().optional(),
    }),
    reason: z.string().min(1).max(500),
  }),
  z.object({
    metaCampaignId: z.string().min(1),
    action: z.literal("SET_END_DATE"),
    params: z.object({ endTime: z.string().datetime() }),
    reason: z.string().min(1).max(500),
  }),
  z.object({
    metaCampaignId: z.string().min(1),
    action: z.literal("DUPLICATE"),
    params: z
      .object({
        newName: z.string().min(1).max(200).optional(),
        dailyBudget: z.number().positive().optional(),
        lifetimeBudget: z.number().positive().optional(),
        dailyBudgetMultiplier: z.number().positive().max(10).optional(),
        lifetimeBudgetMultiplier: z.number().positive().max(10).optional(),
        initialStatus: z.enum(["PAUSED", "ACTIVE"]).optional(),
      })
      .default({}),
    reason: z.string().min(1).max(500),
  }),
]);

const blockSchema = z.object({
  actions: z.array(rawActionSchema).max(20),
});

/**
 * Pull the `json suggested-actions` fenced code block out of a markdown
 * string. Returns the raw inner JSON string, or null if not found.
 *
 * The regex is intentionally loose: AI sometimes drops the language tag
 * or uses a single space — we accept variations.
 */
export function extractActionsBlock(md: string): string | null {
  // Match: ```json suggested-actions\n...\n```
  //   or:  ```suggested-actions\n...\n```
  //   or:  ```json\n{... suggested-actions ...}\n``` (fallback heuristic)
  const tagged = md.match(/```(?:json\s+)?suggested-actions\s*\n([\s\S]*?)\n```/i);
  if (tagged) return tagged[1].trim();

  // Heuristic fallback: any `json` fence containing "actions": [
  const generic = md.match(/```json\s*\n([\s\S]*?"actions"\s*:\s*\[[\s\S]*?)\n```/i);
  if (generic) return generic[1].trim();

  return null;
}

/**
 * Parse + validate suggested actions from a freshly-generated report.
 * Drops any action that fails ownership / type / business-rule checks.
 *
 * Why drop silently (with console.warn)? A garbled or hallucinated
 * suggestion shouldn't break the user's report. We log enough to debug
 * later.
 */
export async function extractAndValidateActions(
  markdown: string,
  tenantId: string,
): Promise<ValidatedSuggestion[]> {
  const raw = extractActionsBlock(markdown);
  if (!raw) return [];

  let parsed: z.infer<typeof blockSchema>;
  try {
    const json = JSON.parse(raw);
    const result = blockSchema.safeParse(json);
    if (!result.success) {
      console.warn("[suggested-actions] schema validation failed:", result.error.issues);
      return [];
    }
    parsed = result.data;
  } catch (err) {
    console.warn("[suggested-actions] JSON parse failed:", (err as Error).message);
    return [];
  }

  if (parsed.actions.length === 0) return [];

  // Batch-load all referenced campaigns for this tenant. We need:
  //  - ownership check (tenantId matches)
  //  - CBO detection for SET_BUDGET
  //  - status check for PAUSE/RESUME (skip no-ops)
  //  - cached name for UI
  const metaIds = parsed.actions.map((a) => a.metaCampaignId);
  const campaigns = await prisma.metaCampaign.findMany({
    where: {
      metaCampaignId: { in: metaIds },
      connection: { tenantId },
    },
    select: {
      id: true,
      metaCampaignId: true,
      name: true,
      effectiveStatus: true,
      configuredStatus: true,
      dailyBudget: true,
      lifetimeBudget: true,
    },
  });
  const byMetaId = new Map(campaigns.map((c) => [c.metaCampaignId, c]));

  const now = Date.now();
  const out: ValidatedSuggestion[] = [];

  for (const action of parsed.actions) {
    const campaign = byMetaId.get(action.metaCampaignId);
    if (!campaign) {
      console.warn(
        `[suggested-actions] drop: unknown metaCampaignId ${action.metaCampaignId}`,
      );
      continue;
    }

    if (action.action === "PAUSE") {
      const currentStatus = campaign.configuredStatus ?? campaign.effectiveStatus;
      if (currentStatus === "PAUSED" || currentStatus === "CAMPAIGN_PAUSED") {
        console.warn(`[suggested-actions] drop: ${campaign.metaCampaignId} already paused`);
        continue;
      }
    }
    if (action.action === "RESUME") {
      const currentStatus = campaign.configuredStatus ?? campaign.effectiveStatus;
      if (currentStatus === "ACTIVE") {
        console.warn(`[suggested-actions] drop: ${campaign.metaCampaignId} already active`);
        continue;
      }
    }
    if (action.action === "SET_BUDGET") {
      if (!isCboCampaign(campaign)) {
        console.warn(
          `[suggested-actions] drop: ${campaign.metaCampaignId} is ABO — budget at ad-set level`,
        );
        continue;
      }
      const p = action.params;
      const isDaily = p.dailyBudget !== undefined;
      const isLifetime = p.lifetimeBudget !== undefined;
      if (isDaily === isLifetime) {
        console.warn(
          `[suggested-actions] drop: SET_BUDGET needs exactly one of dailyBudget/lifetimeBudget`,
        );
        continue;
      }
      // Cross-mode check: lock to campaign's existing mode
      if (isDaily && campaign.dailyBudget === null) {
        console.warn(
          `[suggested-actions] drop: ${campaign.metaCampaignId} uses lifetime budget`,
        );
        continue;
      }
      if (isLifetime && campaign.lifetimeBudget === null) {
        console.warn(
          `[suggested-actions] drop: ${campaign.metaCampaignId} uses daily budget`,
        );
        continue;
      }
    }
    if (action.action === "SET_END_DATE") {
      const endMs = new Date(action.params.endTime).getTime();
      if (Number.isNaN(endMs) || endMs < now - 60_000) {
        console.warn(`[suggested-actions] drop: endTime in past for ${campaign.metaCampaignId}`);
        continue;
      }
    }
    if (action.action === "DUPLICATE") {
      // DUPLICATE works on both CBO and ABO; only validate the budget
      // override if AI specified one. Don't reject otherwise.
      const p = action.params;
      const hasDailyOverride = p.dailyBudget !== undefined || p.dailyBudgetMultiplier !== undefined;
      const hasLifetimeOverride = p.lifetimeBudget !== undefined || p.lifetimeBudgetMultiplier !== undefined;
      if (hasDailyOverride && hasLifetimeOverride) {
        console.warn(
          `[suggested-actions] drop: DUPLICATE specifies both daily + lifetime override`,
        );
        continue;
      }
      if ((hasDailyOverride || hasLifetimeOverride) && !isCboCampaign(campaign)) {
        console.warn(
          `[suggested-actions] drop: DUPLICATE budget override on ABO ${campaign.metaCampaignId}`,
        );
        continue;
      }
      if (hasDailyOverride && campaign.dailyBudget === null) {
        console.warn(
          `[suggested-actions] drop: DUPLICATE daily override on lifetime campaign`,
        );
        continue;
      }
      if (hasLifetimeOverride && campaign.lifetimeBudget === null) {
        console.warn(
          `[suggested-actions] drop: DUPLICATE lifetime override on daily campaign`,
        );
        continue;
      }
    }

    out.push({
      id: randomUUID(),
      internalCampaignId: campaign.id,
      metaCampaignId: campaign.metaCampaignId,
      campaignName: campaign.name,
      action: action.action,
      params: "params" in action ? (action.params as ValidatedSuggestion["params"]) : undefined,
      reason: action.reason,
      status: "pending",
    });
  }

  console.log(
    `[suggested-actions] parsed ${parsed.actions.length}, validated ${out.length}`,
  );
  return out;
}

/**
 * Remove the suggested-actions JSON block from markdown so the report
 * viewer doesn't show raw JSON to the user.
 */
export function stripActionsBlock(md: string): string {
  return md
    .replace(/```(?:json\s+)?suggested-actions\s*\n[\s\S]*?\n```\s*/i, "")
    .replace(/```json\s*\n[\s\S]*?"actions"\s*:\s*\[[\s\S]*?\n```\s*/i, (match) => {
      // Only strip generic json blocks that contain "actions": [
      return match.includes('"actions"') ? "" : match;
    })
    .trimEnd();
}
