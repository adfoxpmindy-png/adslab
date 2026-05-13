import { prisma } from "@/lib/prisma";
import type { ParsedInsight } from "@/lib/meta/insights";

/**
 * Upsert MetaCampaign rows for every campaign returned by the latest
 * Meta insights fetch, then return a map (campaignId → metaCampaignId of
 * our table row) that callers can use to attach goals.
 *
 * Why a separate table instead of just reading campaigns from the
 * insights cache? Two reasons:
 *   1. Goals live across cache refreshes — the campaign row needs to
 *      exist before a user can assign a goal.
 *   2. The dashboard cache only covers active windows; we still want
 *      goals for campaigns paused for longer than the cache TTL.
 */
export async function syncCampaignsFromInsights(params: {
  tenantId: string;
  metaConnectionId: string;
  accounts: ParsedInsight[];
}): Promise<{ syncedCount: number }> {
  const { metaConnectionId, accounts } = params;

  let syncedCount = 0;
  // No need for a transaction here — each upsert is independent and
  // idempotent. A failure on row N still leaves rows 1..N-1 correctly
  // synced, which is what we want.
  for (const account of accounts) {
    for (const c of account.campaigns) {
      const endTime = c.endTime ? new Date(c.endTime) : null;
      await prisma.metaCampaign.upsert({
        where: {
          metaConnectionId_metaCampaignId: {
            metaConnectionId,
            metaCampaignId: c.campaignId,
          },
        },
        update: {
          name: c.campaignName,
          metaObjective: c.metaObjective,
          effectiveStatus: c.effectiveStatus,
          configuredStatus: c.configuredStatus,
          dailyBudget: c.dailyBudget,
          lifetimeBudget: c.lifetimeBudget,
          endTime,
          metaAccountId: account.accountId,
          lastFetchedAt: new Date(),
        },
        create: {
          metaConnectionId,
          metaCampaignId: c.campaignId,
          metaAccountId: account.accountId,
          name: c.campaignName,
          metaObjective: c.metaObjective,
          effectiveStatus: c.effectiveStatus,
          configuredStatus: c.configuredStatus,
          dailyBudget: c.dailyBudget,
          lifetimeBudget: c.lifetimeBudget,
          endTime,
        },
      });
      syncedCount++;
    }
  }

  return { syncedCount };
}
