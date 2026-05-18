import { z } from "zod";

import { performAdAction } from "@/lib/meta/ad-actions";
import { defineTool } from "./types";

const inputSchema = z.object({
  adId: z.string().describe("Meta ad ID (digit string). Get from analyzeAdCreative or campaign drilldown."),
});

export const pauseAdTool = defineTool({
  name: "pauseAd",
  description:
    "Pause a single Meta ad without affecting its sibling ads in the same ad set or the ad set itself. Use this when ONE ad/creative within a multi-ad ad set is the problem (e.g. fatigued creative, low CTR on one variant). Reversible. Mutate action — user will be asked to confirm.",
  kind: "mutate",
  inputSchema,
  jsonSchema: {
    type: "object",
    properties: {
      adId: { type: "string", description: "Meta ad ID (digit string)." },
    },
    required: ["adId"],
    additionalProperties: false,
  },
  summarize: (input) => `Pause ad ${input.adId}`,
  async handler(input, ctx) {
    const result = await performAdAction({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      adId: input.adId,
      action: { type: "PAUSE" },
    });
    if (!result.ok) return { error: result.error };
    return {
      ok: true,
      adId: result.adId,
      adName: result.adName,
      beforeStatus: result.beforeStatus,
      afterStatus: result.afterStatus,
    };
  },
});
