import { z } from "zod";

import { performAdSetAction } from "@/lib/meta/adset-actions";
import { defineTool } from "./types";

const inputSchema = z
  .object({
    adSetId: z.string().describe("Meta ad set ID (digit string)."),
    dailyBudget: z
      .number()
      .positive()
      .optional()
      .describe("New daily budget in THB. Only for ad sets currently using daily budget."),
    lifetimeBudget: z
      .number()
      .positive()
      .optional()
      .describe("New lifetime budget in THB. Only for ad sets currently using lifetime budget."),
  })
  .refine(
    (v) => (v.dailyBudget !== undefined) !== (v.lifetimeBudget !== undefined),
    "Exactly one of dailyBudget or lifetimeBudget is required.",
  );

export const setAdSetBudgetTool = defineTool({
  name: "setAdSetBudget",
  description:
    "Adjust the budget on an ABO ad set (one that has its own budget rather than inheriting from a CBO campaign). Validates: locks daily↔lifetime to whichever the ad set already uses, rejects swaps, enforces ฿20 – ฿1,000,000 bounds. Will fail if the ad set is under a CBO campaign — use setCampaignBudget there. Mutate action — user will be asked to confirm.",
  kind: "mutate",
  inputSchema,
  jsonSchema: {
    type: "object",
    properties: {
      adSetId: { type: "string", description: "Meta ad set ID." },
      dailyBudget: {
        type: "number",
        description: "New daily budget in THB (e.g. 500). Mutually exclusive with lifetimeBudget.",
      },
      lifetimeBudget: {
        type: "number",
        description: "New lifetime budget in THB. Mutually exclusive with dailyBudget.",
      },
    },
    required: ["adSetId"],
    additionalProperties: false,
  },
  summarize: (input) => {
    if (input.dailyBudget !== undefined) {
      return `Set daily budget of ad set ${input.adSetId} to ฿${input.dailyBudget.toLocaleString("en-US")}`;
    }
    return `Set lifetime budget of ad set ${input.adSetId} to ฿${input.lifetimeBudget!.toLocaleString("en-US")}`;
  },
  async handler(input, ctx) {
    const result = await performAdSetAction({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      adSetId: input.adSetId,
      action: {
        type: "SET_BUDGET",
        dailyBudget: input.dailyBudget,
        lifetimeBudget: input.lifetimeBudget,
      },
    });
    if (!result.ok) return { error: result.error };
    return {
      ok: true,
      adSetId: result.adSetId,
      adSetName: result.adSetName,
      beforeValue: result.beforeValue,
      afterValue: result.afterValue,
    };
  },
});
