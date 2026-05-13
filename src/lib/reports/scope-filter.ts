import type { DashboardPayload, DashboardSummary, ParsedInsight } from "@/lib/meta/insights";
import { convertToThb } from "@/lib/meta/fx";

/** Scope filter — Meta account ids and/or Meta campaign ids. */
export type ScopeFilter = {
  accountIds: string[]; // empty = all accounts
  campaignIds: string[]; // empty = all campaigns in selected accounts
};

/**
 * Reduce a full dashboard payload to just the data inside the given
 * scope. Re-aggregates the summary so KPIs reflect ONLY the filtered
 * accounts/campaigns — otherwise the AI sees scoped accounts but
 * tenant-wide totals, which would confuse it.
 *
 * Empty filter → returns the payload unchanged (caller handles the
 * "full tenant" case before invoking).
 */
export function applyScopeFilter(
  payload: DashboardPayload,
  filter: ScopeFilter,
): DashboardPayload {
  const hasAccountFilter = filter.accountIds.length > 0;
  const hasCampaignFilter = filter.campaignIds.length > 0;
  if (!hasAccountFilter && !hasCampaignFilter) return payload;

  const accountSet = new Set(filter.accountIds);
  const campaignSet = new Set(filter.campaignIds);

  const filteredAccounts: ParsedInsight[] = [];
  for (const account of payload.accounts) {
    if (hasAccountFilter && !accountSet.has(account.accountId)) continue;

    // Filter campaigns within this account.
    const campaigns = hasCampaignFilter
      ? account.campaigns.filter((c) => campaignSet.has(c.campaignId))
      : account.campaigns;

    // When a campaign filter is set and zero campaigns matched in this
    // account, drop the account entirely — the AI shouldn't see an
    // account row that has no relevant campaigns.
    if (hasCampaignFilter && campaigns.length === 0) continue;

    // Re-aggregate the account totals from the filtered campaigns when
    // we narrowed down. Without this, an "account total" can include
    // campaigns the user explicitly filtered out.
    if (hasCampaignFilter) {
      let spend = 0;
      let impressions = 0;
      let clicks = 0;
      let conversions = 0;
      let purchaseValue = 0;
      for (const c of campaigns) {
        spend += c.spend;
        impressions += c.impressions;
        clicks += c.clicks;
        conversions += c.conversions;
        purchaseValue += c.purchaseValue;
      }
      filteredAccounts.push({
        ...account,
        spend,
        impressions,
        clicks,
        conversions,
        purchaseValue,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        roas: spend > 0 ? purchaseValue / spend : 0,
        campaigns,
      });
    } else {
      filteredAccounts.push({ ...account, campaigns });
    }
  }

  return {
    range: payload.range,
    summary: aggregate(filteredAccounts),
    accounts: filteredAccounts,
    fetchedAt: payload.fetchedAt,
  };
}

function aggregate(accounts: ParsedInsight[]): DashboardSummary {
  let spendThb = 0;
  let purchaseValueThb = 0;
  let impressions = 0;
  let clicks = 0;
  let conversions = 0;

  for (const a of accounts) {
    spendThb += convertToThb(a.spend, a.currency);
    purchaseValueThb += convertToThb(a.purchaseValue, a.currency);
    impressions += a.impressions;
    clicks += a.clicks;
    conversions += a.conversions;
  }

  return {
    spendThb,
    impressions,
    clicks,
    conversions,
    purchaseValueThb,
    roas: spendThb > 0 ? purchaseValueThb / spendThb : 0,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpm: impressions > 0 ? (spendThb / impressions) * 1000 : 0,
  };
}
