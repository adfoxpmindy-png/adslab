import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getEffectiveScope, applyScopeFilter } from "@/lib/tenant-scope";

import { defineTool } from "./types";

const inputSchema = z.object({
  status: z
    .enum(["ACTIVE", "PAUSED", "ARCHIVED", "ALL"])
    .optional()
    .describe("Filter by effective status. Default: ACTIVE only."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Max number of campaigns to return. Default: 20."),
});

export const listCampaignsTool = defineTool({
  name: "listCampaigns",
  description:
    "List the tenant's Meta campaigns (filtered by the user's active scope). Use this when the user asks about their campaigns, wants to find a campaign by name, or needs an overview.",
  kind: "read",
  inputSchema,
  jsonSchema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["ACTIVE", "PAUSED", "ARCHIVED", "ALL"],
        description: "Filter by effective status. Default: ACTIVE only.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 50,
        description: "Max number of campaigns to return. Default: 20.",
      },
    },
    additionalProperties: false,
  },
  summarize: (input) =>
    `list ${input.limit ?? 20} campaigns${
      input.status && input.status !== "ALL" ? ` (status: ${input.status})` : ""
    }`,
  async handler(input, ctx) {
    const status = input.status ?? "ACTIVE";
    const limit = input.limit ?? 20;

    const scope = await getEffectiveScope(ctx.userId, ctx.tenantId);
    const scopeFilter = applyScopeFilter(scope);

    const conn = await prisma.metaConnection.findUnique({
      where: { tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!conn) return { campaigns: [], total: 0 };

    const where = {
      metaConnectionId: conn.id,
      ...scopeFilter,
      ...(status === "ALL" ? {} : { effectiveStatus: status }),
    };

    const [campaigns, total] = await Promise.all([
      prisma.metaCampaign.findMany({
        where,
        orderBy: [{ effectiveStatus: "asc" }, { name: "asc" }],
        take: limit,
        select: {
          id: true,
          metaCampaignId: true,
          name: true,
          effectiveStatus: true,
          metaObjective: true,
          dailyBudget: true,
          lifetimeBudget: true,
          metaAccountId: true,
        },
      }),
      prisma.metaCampaign.count({ where }),
    ]);

    return {
      campaigns: campaigns.map((c) => ({
        id: c.metaCampaignId,
        name: c.name,
        status: c.effectiveStatus,
        objective: c.metaObjective,
        dailyBudgetThb: c.dailyBudget !== null ? c.dailyBudget / 100 : null,
        lifetimeBudgetThb:
          c.lifetimeBudget !== null ? c.lifetimeBudget / 100 : null,
        accountId: c.metaAccountId,
      })),
      total,
      shown: campaigns.length,
    };
  },
});
