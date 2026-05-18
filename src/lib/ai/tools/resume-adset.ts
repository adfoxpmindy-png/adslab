import { z } from "zod";

import { performAdSetAction } from "@/lib/meta/adset-actions";
import { defineTool } from "./types";

const inputSchema = z.object({
  adSetId: z.string().describe("Meta ad set ID (digit string)."),
});

export const resumeAdSetTool = defineTool({
  name: "resumeAdSet",
  description:
    "Resume a paused Meta ad set. Idempotent — already-active ad sets return success. Mutate action — user will be asked to confirm.",
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
  summarize: (input) => `Resume ad set ${input.adSetId}`,
  async handler(input, ctx) {
    const result = await performAdSetAction({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      adSetId: input.adSetId,
      action: { type: "RESUME" },
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
