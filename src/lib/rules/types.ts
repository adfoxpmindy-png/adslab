/**
 * Shared types for the auto-rules engine.
 *
 * The condition shape is structured JSON (not a DSL string) so the
 * UI form, the AI suggester, and the evaluator all share the same
 * vocabulary — adding a metric is a one-line change in METRICS.
 */

export const METRICS = ["cpv", "roas", "spend", "frequency", "ctr"] as const;
export type RuleMetric = (typeof METRICS)[number];

export const OPS = ["gt", "lt", "gte", "lte"] as const;
export type RuleOp = (typeof OPS)[number];

/** Hours of insights to evaluate. Constrained to options the UI offers. */
export const WINDOWS = [1, 2, 6, 24] as const;
export type RuleWindowHours = (typeof WINDOWS)[number];

/** Which Meta entity level the metric is computed at. */
export type RuleScope = "adset" | "campaign";

export type RuleCondition = {
  metric: RuleMetric;
  op: RuleOp;
  /** Threshold to compare against. Units depend on metric (THB for cpv/spend, ratio for roas/ctr, count for frequency). */
  value: number;
  windowHours: RuleWindowHours;
  scope: RuleScope;
};

export const ACTIONS = [
  "pause_adset",
  "pause_campaign",
  "notify_email",
  "notify_in_app",
] as const;
export type RuleAction = (typeof ACTIONS)[number];

export const RULE_RUN_STATUSES = [
  "matched",
  "not_matched",
  "skipped_no_data",
  "matched_in_cooldown",
  "skipped_orphan",
  "skipped_throttled",
  "error",
] as const;
export type RuleRunStatus = (typeof RULE_RUN_STATUSES)[number];

export const ACTION_RESULTS = ["fired", "no_change_needed", "error"] as const;
export type ActionResult = (typeof ACTION_RESULTS)[number];

/** Allowed values for `AutoRule.minIntervalMinutes` — surfaced in the UI dropdown. */
export const MIN_INTERVAL_MINUTES = [60, 360, 720, 1440] as const;
export type MinIntervalMinutes = (typeof MIN_INTERVAL_MINUTES)[number];

/** Result of evaluating a single rule against a target entity's metrics. */
export type EvaluationResult =
  | {
      status: "matched";
      evaluatedValue: number;
      threshold: number;
    }
  | {
      status: "not_matched";
      evaluatedValue: number;
      threshold: number;
    }
  | {
      status: "skipped_no_data";
      threshold: number;
    };
