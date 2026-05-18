import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { performCampaignAction } from "@/lib/meta/campaign-actions";

import { defineTool } from "./types";

const inputSchema = z
  .object({
    campaignId: z.string().describe("Meta campaign ID."),
    dailyBudgetThb: z
      .number()
      .positive()
      .max(1_000_000)
      .optional()
      .describe("New daily budget in THB. Provide either daily or lifetime, not both."),
    lifetimeBudgetThb: z
      .number()
      .positive()
      .max(10_000_000)
      .optional()
      .describe("New lifetime budget in THB."),
  })
  .refine(
    (v) =>
      (v.dailyBudgetThb !== undefined) !== (v.lifetimeBudgetThb !== undefined),
    { message: "Provide exactly one of dailyBudgetThb or lifetimeBudgetThb." },
  );

export const setCampaignBudgetTool = defineTool({
  name: "setCampaignBudget",
  description:
    "Change a Meta campaign's budget (CBO campaigns only — campaigns with budget at the campaign level). Provide either dailyBudgetThb OR lifetimeBudgetThb, not both. Will be confirmed by user before running.",
  kind: "mutate",
  inputSchema,
  jsonSchema: {
    type: "object",
    properties: {
      campaignId: { type: "string", description: "Meta campaign ID." },
      dailyBudgetThb: {
        type: "number",
        minimum: 1,
        maximum: 1_000_000,
        description: "New daily budget in THB.",
      },
      lifetimeBudgetThb: {
        type: "number",
        minimum: 1,
        maximum: 10_000_000,
        description: "New lifetime budget in THB.",
      },
    },
    required: ["campaignId"],
    additionalProperties: false,
  },
  summarize: (input) => {
    if (input.dailyBudgetThb !== undefined) {
      return `Set daily budget of ${input.campaignId} to ฿${input.dailyBudgetThb.toLocaleString("en-US")}`;
    }
    return `Set lifetime budget of ${input.campaignId} to ฿${input.lifetimeBudgetThb?.toLocaleString("en-US")}`;
  },
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
      action: "SET_BUDGET",
      dailyBudget: input.dailyBudgetThb,
      lifetimeBudget: input.lifetimeBudgetThb,
    });
    if (!result.ok) return { error: result.error };
    return {
      ok: true,
      campaignId: input.campaignId,
      campaignName: campaign.name,
      beforeValue: result.beforeValue,
      afterValue: result.afterValue,
    };
  },
});
