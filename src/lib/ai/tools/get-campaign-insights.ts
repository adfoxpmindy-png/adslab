import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getDashboardData, filterDashboardPayload } from "@/lib/meta/dashboard-service";
import { getEffectiveScope } from "@/lib/tenant-scope";

import { defineTool } from "./types";

const inputSchema = z.object({
  campaignId: z
    .string()
    .describe("Meta campaign ID (e.g. '123456789012'). Get this from listCampaigns."),
  range: z
    .enum(["today", "yesterday", "last_7d", "last_30d"])
    .optional()
    .describe("Date range. Default: last_7d."),
});

export const getCampaignInsightsTool = defineTool({
  name: "getCampaignInsights",
  description:
    "Get performance metrics (spend, impressions, clicks, conversions, ROAS, CTR, CPM) for a specific campaign over a date range.",
  kind: "read",
  inputSchema,
  jsonSchema: {
    type: "object",
    properties: {
      campaignId: {
        type: "string",
        description: "Meta campaign ID (numeric string).",
      },
      range: {
        type: "string",
        enum: ["today", "yesterday", "last_7d", "last_30d"],
        description: "Date range. Default: last_7d.",
      },
    },
    required: ["campaignId"],
    additionalProperties: false,
  },
  summarize: (input) =>
    `get insights for campaign ${input.campaignId} (${input.range ?? "last_7d"})`,
  async handler(input, ctx) {
    const range = input.range ?? "last_7d";
    const scope = await getEffectiveScope(ctx.userId, ctx.tenantId);

    const result = await getDashboardData(ctx.tenantId, range);
    const filtered = filterDashboardPayload(result.payload, scope.accountIds);

    // Look up campaign across all accounts in the filtered payload.
    for (const account of filtered.accounts) {
      const campaign = account.campaigns.find(
        (c) => c.campaignId === input.campaignId,
      );
      if (campaign) {
        // Augment with goal + objective from local DB
        const dbCampaign = await prisma.metaCampaign.findFirst({
          where: { metaCampaignId: input.campaignId },
          select: { name: true, metaObjective: true, effectiveStatus: true },
        });
        return {
          campaignId: campaign.campaignId,
          name: campaign.campaignName,
          objective: campaign.metaObjective ?? dbCampaign?.metaObjective ?? null,
          status: dbCampaign?.effectiveStatus ?? null,
          accountId: account.accountId,
          accountName: account.accountName,
          currency: account.currency,
          range,
          metrics: {
            spend: campaign.spend,
            spendThb: campaign.spend, // already converted upstream
            impressions: campaign.impressions,
            clicks: campaign.clicks,
            conversions: campaign.conversions,
            purchaseValue: campaign.purchaseValue,
            ctr: campaign.ctr,
            cpm: campaign.cpm,
            cpc: campaign.cpc,
            roas: campaign.roas,
          },
        };
      }
    }

    return {
      error: "Campaign not found in scope. Either it's outside your tenant scope, or it had no spend in this range.",
      campaignId: input.campaignId,
      range,
    };
  },
});
