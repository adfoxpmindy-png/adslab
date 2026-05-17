import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { duplicateCampaign } from "@/lib/meta/duplicate-campaign";
import { defineTool } from "./types";

const inputSchema = z.object({
  campaignId: z
    .string()
    .describe("Meta campaign ID (digit string) of the source campaign to duplicate."),
  newName: z
    .string()
    .optional()
    .describe("Name for the duplicate. Defaults to '<source name> (Copy)'."),
  dailyBudget: z
    .number()
    .positive()
    .optional()
    .describe("Absolute new daily budget in THB. Mutually exclusive with the budget multipliers and lifetimeBudget."),
  lifetimeBudget: z
    .number()
    .positive()
    .optional()
    .describe("Absolute new lifetime budget in THB. Mutually exclusive."),
  dailyBudgetMultiplier: z
    .number()
    .positive()
    .max(10)
    .optional()
    .describe(
      "Multiplier on the source's daily budget (e.g. 1.5 = +50%). Common when scaling a winner. Max 10x.",
    ),
  lifetimeBudgetMultiplier: z
    .number()
    .positive()
    .max(10)
    .optional()
    .describe("Multiplier on the source's lifetime budget."),
  initialStatus: z
    .enum(["PAUSED", "ACTIVE"])
    .optional()
    .describe("Status of the new campaign. Defaults to PAUSED so the user can inspect before activating."),
});

export const duplicateCampaignTool = defineTool({
  name: "duplicateCampaign",
  description:
    "Duplicate an existing Meta campaign (deep-copies the campaign, its ad sets, and its ads in one call). Useful for SCALING a winner (e.g. duplicate at 1.5x budget) or BRANCHING a tested setup with variations. Defaults to PAUSED so the user can inspect before going live. Mutate action — user will be asked to confirm. Returns the new campaign id.",
  kind: "mutate",
  inputSchema,
  jsonSchema: {
    type: "object",
    properties: {
      campaignId: { type: "string", description: "Meta campaign ID of source." },
      newName: { type: "string" },
      dailyBudget: { type: "number" },
      lifetimeBudget: { type: "number" },
      dailyBudgetMultiplier: { type: "number" },
      lifetimeBudgetMultiplier: { type: "number" },
      initialStatus: { type: "string", enum: ["PAUSED", "ACTIVE"] },
    },
    required: ["campaignId"],
    additionalProperties: false,
  },
  summarize: (input) => {
    const bits: string[] = [];
    if (input.dailyBudgetMultiplier) bits.push(`×${input.dailyBudgetMultiplier} budget`);
    if (input.lifetimeBudgetMultiplier) bits.push(`×${input.lifetimeBudgetMultiplier} lifetime budget`);
    if (input.dailyBudget) bits.push(`฿${input.dailyBudget.toLocaleString("th-TH")}/day`);
    if (input.lifetimeBudget) bits.push(`฿${input.lifetimeBudget.toLocaleString("th-TH")} lifetime`);
    if (input.initialStatus === "ACTIVE") bits.push("ACTIVE ทันที");
    const tail = bits.length > 0 ? ` (${bits.join(", ")})` : "";
    return `Duplicate campaign ${input.campaignId}${tail}`;
  },
  async handler(input, ctx) {
    // Resolve internal id from Meta digit id.
    const campaign = await prisma.metaCampaign.findFirst({
      where: {
        metaCampaignId: input.campaignId,
        connection: { tenantId: ctx.tenantId },
      },
      select: { id: true },
    });
    if (!campaign) {
      return { error: `Campaign ${input.campaignId} ไม่พบใน tenant นี้` };
    }
    const result = await duplicateCampaign({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      sourceCampaignId: campaign.id,
      newName: input.newName,
      dailyBudget: input.dailyBudget,
      lifetimeBudget: input.lifetimeBudget,
      dailyBudgetMultiplier: input.dailyBudgetMultiplier,
      lifetimeBudgetMultiplier: input.lifetimeBudgetMultiplier,
      initialStatus: input.initialStatus,
    });
    if (!result.ok) return { error: result.error };
    return {
      ok: true,
      newMetaCampaignId: result.newMetaCampaignId,
      name: result.name,
      status: result.status,
    };
  },
});
