/**
 * Daily insights fetch — separate from the per-campaign fetch so we can
 * cache + render the Dashboard timeline chart independently.
 *
 * Uses Meta's `time_increment: 1` parameter which makes the insights API
 * return one row PER DAY (instead of a single aggregate). We pull this
 * at account level (no campaign nesting) since the Dashboard chart
 * shows tenant-wide totals per day.
 */

import { graphFetch } from "./graph-api";
import type { DateRangeKey } from "./insights";

export type DailyDataPoint = {
  /** YYYY-MM-DD */
  date: string;
  spendThb: number;
  salesThb: number;
  roas: number;
  clicks: number;
};

type RawAction = { action_type: string; value: string };
type RawDailyInsight = {
  date_start: string;
  date_stop: string;
  spend?: string;
  clicks?: string;
  actions?: RawAction[];
  action_values?: RawAction[];
};
type RawAccountDailyResponse = {
  data: Array<{
    id: string;
    insights?: { data: RawDailyInsight[] };
  }>;
  paging?: { next?: string };
};

const PURCHASE_VALUE_TYPES = new Set([
  "purchase",
  "omni_purchase",
  "offsite_conversion.fb_pixel_purchase",
]);

function rangeToParam(range: DateRangeKey): { date_preset?: string; time_range?: string } {
  const PRESETS = new Set(["today", "yesterday", "last_7d", "last_30d"]);
  if (PRESETS.has(range)) return { date_preset: range };
  if (range.startsWith("custom:")) {
    const dates = range.slice("custom:".length).split("..");
    if (dates.length === 2 && dates[0] && dates[1]) {
      return { time_range: JSON.stringify({ since: dates[0], until: dates[1] }) };
    }
  }
  return { date_preset: "last_7d" };
}

function num(v: string | undefined): number {
  if (!v) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sumActions(actions: RawAction[] | undefined, allowed: Set<string>): number {
  if (!actions) return 0;
  let total = 0;
  for (const a of actions) if (allowed.has(a.action_type)) total += num(a.value);
  return total;
}

/**
 * Fetch daily aggregates across all ad accounts for the given range.
 * Returns one DailyDataPoint per day, summed across accounts.
 */
export async function fetchDailyAggregates(
  accessToken: string,
  range: DateRangeKey,
): Promise<DailyDataPoint[]> {
  const rangeParam = rangeToParam(range);
  const fields = "spend,clicks,actions,action_values";
  const insightSubQuery = rangeParam.time_range
    ? `insights.time_range(${rangeParam.time_range}).time_increment(1){${fields}}`
    : `insights.date_preset(${rangeParam.date_preset}).time_increment(1){${fields}}`;

  // Aggregate per-day across all accounts
  const dailyMap = new Map<string, DailyDataPoint>();

  let page = await graphFetch<RawAccountDailyResponse>("/me/adaccounts", {
    accessToken,
    searchParams: { fields: `id,${insightSubQuery}`, limit: 100 },
  });

  const processPage = (p: RawAccountDailyResponse) => {
    for (const account of p.data) {
      const insightsArr = account.insights?.data ?? [];
      for (const day of insightsArr) {
        const date = day.date_start;
        const existing = dailyMap.get(date) ?? {
          date,
          spendThb: 0,
          salesThb: 0,
          roas: 0,
          clicks: 0,
        };
        existing.spendThb += num(day.spend);
        existing.salesThb += sumActions(day.action_values, PURCHASE_VALUE_TYPES);
        existing.clicks += num(day.clicks);
        dailyMap.set(date, existing);
      }
    }
  };

  processPage(page);
  while (page.paging?.next) {
    const next = await fetch(page.paging.next);
    if (!next.ok) break;
    page = (await next.json()) as RawAccountDailyResponse;
    processPage(page);
  }

  // Compute ROAS per day + sort chronologically
  const series = Array.from(dailyMap.values())
    .map((d) => ({
      ...d,
      roas: d.spendThb > 0 ? d.salesThb / d.spendThb : 0,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return series;
}
