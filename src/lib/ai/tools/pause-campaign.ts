import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { performCampaignAction } from "@/lib/meta/campaign-actions";

import { defineTool } from "./types";

const inputSchema = z.object({
  campaignId: z
    .string()
    .describe(
      "Meta campaign ID (numeric string) — get from listCampaigns. NOT the campaign name.",
    ),
});

export const pauseCampaignTool = defineTool({
  name: "pauseCampaign",
  description:
    "Pause a Meta campaign. Stops ad delivery and spend. Reversible via resumeCampaign. This is a DESTRUCTIVE action — the user will be asked to confirm before it runs.",
  kind: "mutate",
  inputSchema,
  jsonSchema: {
    type: "object",
    properties: {
      campaignId: {
        type: "string",
        description: "Meta campaign ID (numeric string).",
      },
    },
    required: ["campaignId"],
    additionalProperties: false,
  },
  summarize: (input) => `Pause campaign ${input.campaignId}`,
  async handler(input, ctx) {
    const campaign = await prisma.metaCampaign.findFirst({
      where: {
        metaCampaignId: input.campaignId,
        connection: { tenantId: ctx.tenantId },
      },
      select: { id: true, name: true },
    });
    if (!campaign) {
      return { error: `Campaign ${input.campaignId} not found in this tenant` };
    }
    const result = await performCampaignAction({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      campaignId: campaign.id,
      action: "PAUSE",
    });
    if (!result.ok) return { error: result.error };
    return {
      ok: true,
      campaignId: input.campaignId,
      campaignName: campaign.name,
      beforeStatus: result.beforeStatus,
      afterStatus: result.afterStatus,
    };
  },
});
