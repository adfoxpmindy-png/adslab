import { z } from "zod";

import { performAdSetAction } from "@/lib/meta/adset-actions";
import { defineTool } from "./types";

const inputSchema = z.object({
  adSetId: z
    .string()
    .describe(
      "Meta ad set ID (digit string). Get from getCampaignInsights or listCampaigns drilldown. NOT the ad set name.",
    ),
});

export const pauseAdSetTool = defineTool({
  name: "pauseAdSet",
  description:
    "Pause a single Meta ad set without affecting its sibling ad sets or the parent campaign. Use this when ONE ad set within a campaign is the underperformer — killing the whole campaign wastes the winners. Reversible via resumeAdSet. Mutate action — user will be asked to confirm.",
  kind: "mutate",
  inputSchema,
  jsonSchema: {
    type: "object",
    properties: {
      adSetId: { type: "string", description: "Meta ad set ID (digit string)." },
    },
    required: ["adSetId"],
    additionalProperties: false,
  },
  summarize: (input) => `หยุด ad set ${input.adSetId}`,
  async handler(input, ctx) {
    const result = await performAdSetAction({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      adSetId: input.adSetId,
      action: { type: "PAUSE" },
    });
    if (!result.ok) return { error: result.error };
    return {
      ok: true,
      adSetId: result.adSetId,
      adSetName: result.adSetName,
      beforeStatus: result.beforeStatus,
      afterStatus: result.afterStatus,
    };
  },
});
