/**
 * Pure function: given a rule condition + an insights snapshot, decide
 * whether the condition matches. No I/O, no DB — easy to unit test.
 */
import type { EvaluationResult, RuleCondition, RuleMetric } from "./types";

/**
 * The minimum shape we need from a Meta insights row. Real Meta returns
 * more fields; the evaluator only reads what it needs. CPV is computed
 * from `spend / video_views` when not directly returned.
 */
export type InsightsSnapshot = {
  spend: number;
  impressions: number;
  reach: number;
  video_views?: number;
  clicks?: number;
  purchase_value?: number;
};

function computeMetric(metric: RuleMetric, s: InsightsSnapshot): number | null {
  switch (metric) {
    case "spend":
      return s.spend;
    case "cpv": {
      const views = s.video_views ?? 0;
      if (views === 0) return null; // division by zero → undefined
      return s.spend / views;
    }
    case "roas": {
      const rev = s.purchase_value ?? 0;
      if (s.spend === 0) return null;
      return rev / s.spend;
    }
    case "ctr": {
      if (s.impressions === 0) return null;
      const clicks = s.clicks ?? 0;
      return clicks / s.impressions;
    }
    case "frequency": {
      if (s.reach === 0) return null;
      return s.impressions / s.reach;
    }
  }
}

function compare(op: RuleCondition["op"], lhs: number, rhs: number): boolean {
  switch (op) {
    case "gt":
      return lhs > rhs;
    case "gte":
      return lhs >= rhs;
    case "lt":
      return lhs < rhs;
    case "lte":
      return lhs <= rhs;
  }
}

export function evaluateRule(
  condition: RuleCondition,
  snapshot: InsightsSnapshot,
): EvaluationResult {
  const value = computeMetric(condition.metric, snapshot);
  if (value === null) {
    // No data to compute the metric (zero impressions / views / spend).
    // Per spec, this is "skipped_no_data" rather than "not_matched".
    return { status: "skipped_no_data", threshold: condition.value };
  }
  const matched = compare(condition.op, value, condition.value);
  return {
    status: matched ? "matched" : "not_matched",
    evaluatedValue: value,
    threshold: condition.value,
  };
}
