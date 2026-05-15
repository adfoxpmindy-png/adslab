/**
 * Pure tier-math functions. No DB access — everything is computed
 * against constants from plans.ts. Use these for: pricing display,
 * proration math, recommended-tier banners.
 */

import { type PlanKey, getPlan, BASE_PLAN_KEYS } from "./plans";

/** Thai VAT rate. Stated prices are VAT-inclusive. */
export const VAT_RATE = 0.07;

/**
 * Split a VAT-inclusive amount into ex-VAT base + VAT line.
 * Used on invoice receipts per Thai tax requirements.
 */
export function splitVat(totalInclusive: number): { base: number; vat: number } {
  const base = Math.round(totalInclusive / (1 + VAT_RATE));
  return { base, vat: totalInclusive - base };
}

/**
 * Total price for a (plan + add-ons + extraAdAccounts) bundle for a
 * single billing period.
 */
export function computePeriodTotal(opts: {
  planKey: PlanKey;
  interval: "MONTHLY" | "YEARLY";
  addOnKeys: readonly string[];
  extraAdAccounts: number;
}): number {
  const plan = getPlan(opts.planKey);
  let total = opts.interval === "MONTHLY" ? plan.priceMonthly : plan.priceYearly;
  for (const k of opts.addOnKeys) {
    const a = getPlan(k as PlanKey);
    total += opts.interval === "MONTHLY" ? a.priceMonthly : a.priceYearly;
  }
  if (opts.extraAdAccounts > 0) {
    const extra = getPlan("extra-ad-account");
    const unit = opts.interval === "MONTHLY" ? extra.priceMonthly : extra.priceYearly;
    total += unit * opts.extraAdAccounts;
  }
  return total;
}

/**
 * Proration on upgrade mid-period. Charges the difference between the
 * new and old period totals, scaled by unused days remaining.
 */
export function computeProration(opts: {
  oldTotal: number;
  newTotal: number;
  periodStart: Date;
  periodEnd: Date;
  now: Date;
}): number {
  const totalDays = Math.max(
    1,
    Math.round(
      (opts.periodEnd.getTime() - opts.periodStart.getTime()) / (24 * 3600 * 1000),
    ),
  );
  const usedDays = Math.max(
    0,
    Math.round(
      (opts.now.getTime() - opts.periodStart.getTime()) / (24 * 3600 * 1000),
    ),
  );
  const remainingDays = Math.max(0, totalDays - usedDays);
  const diff = Math.max(0, opts.newTotal - opts.oldTotal);
  return Math.round((diff * remainingDays) / totalDays);
}

/**
 * Pro-rated refund within the 7-day grace window.
 */
export function computeRefund(opts: {
  invoiceAmount: number;
  periodStart: Date;
  periodEnd: Date;
  now: Date;
}): number {
  const totalDays = Math.max(
    1,
    Math.round(
      (opts.periodEnd.getTime() - opts.periodStart.getTime()) / (24 * 3600 * 1000),
    ),
  );
  const usedDays = Math.max(
    0,
    Math.round(
      (opts.now.getTime() - opts.periodStart.getTime()) / (24 * 3600 * 1000),
    ),
  );
  const remainingDays = Math.max(0, totalDays - usedDays);
  return Math.round((opts.invoiceAmount * remainingDays) / totalDays);
}

/**
 * The effective tier index — used to decide "is this an upgrade or a
 * downgrade?". Returns -1 if planKey is not a base plan.
 */
export function tierIndex(planKey: PlanKey): number {
  return BASE_PLAN_KEYS.indexOf(planKey);
}

export function isUpgrade(from: PlanKey, to: PlanKey): boolean {
  const a = tierIndex(from);
  const b = tierIndex(to);
  return a >= 0 && b > a;
}

export function isDowngrade(from: PlanKey, to: PlanKey): boolean {
  const a = tierIndex(from);
  const b = tierIndex(to);
  return a >= 0 && b >= 0 && b < a;
}

/**
 * Max number of active auto-rules a tenant can have at a given tier.
 * Trial users (no active plan) fall through to 0 — they see the rules
 * page but get an upsell card prompting them to choose a plan.
 *
 * Numbers tuned so each tier has clear value vs the one below it without
 * being so high that misconfigured rules can spam Meta on free / cheap
 * tiers. Disabled rules don't count toward the cap.
 */
export function maxActiveRulesForPlan(planKey: PlanKey | null | undefined): number {
  if (!planKey) return 0;
  switch (planKey) {
    case "starter":
      return 5;
    case "growth":
      return 20;
    case "pro":
      return 100;
    case "scale":
      return 500;
    case "enterprise":
      return 999;
    default:
      return 0;
  }
}
