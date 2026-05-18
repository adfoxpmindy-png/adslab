import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { performCampaignAction } from "@/lib/meta/campaign-actions";

import { defineTool } from "./types";

const inputSchema = z.object({
  campaignId: z.string().describe("Meta campaign ID."),
});

export const resumeCampaignTool = defineTool({
  name: "resumeCampaign",
  description:
    "Resume a paused Meta campaign. Restarts ad delivery and spend. Will be confirmed by user before running.",
  kind: "mutate",
  inputSchema,
  jsonSchema: {
    type: "object",
    properties: {
      campaignId: { type: "string", description: "Meta campaign ID." },
    },
    required: ["campaignId"],
    additionalProperties: false,
  },
  summarize: (input) => `Resume campaign ${input.campaignId}`,
  async handler(input, ctx) {
    const campaign = await prisma.metaCampaign.findFirst({
      where: {
        metaCampaignId: input.campaignId,
        connection: { tenantId: ctx.tenantId },
      },
      select: { id: true, name: true },
    });
    if (!campaign) return { error: `Campaign ${input.campaignId} not found` };
    const result = await performCampaignAction({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      campaignId: campaign.id,
      action: "RESUME",
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
