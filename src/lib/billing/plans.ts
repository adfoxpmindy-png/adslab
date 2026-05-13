/**
 * Plan catalog — single source of truth for billing tiers and add-ons.
 *
 * This is intentionally a plain object array rather than DB-only data
 * because (a) tier rules and prices are referenced at compile time by
 * gate checks, and (b) the seeder reads from here.
 *
 * Add-on rows have `isAddOn: true` and `spendCeilingThb: null`. They
 * still go through Plan table so they're referenced uniformly.
 */

export type PlanKey =
  | "starter"
  | "growth"
  | "pro"
  | "scale"
  | "enterprise"
  | "event-sdk"
  | "extra-ad-account"
  | "white-label"
  | "priority-ai";

export type PlanDef = {
  key: PlanKey;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  /** null = unlimited / enterprise / not applicable (add-on) */
  spendCeilingThb: number | null;
  adAccountLimit: number;
  /** null = unlimited */
  aiMsgPerDay: number | null;
  isAddOn: boolean;
};

export const PLANS: readonly PlanDef[] = [
  {
    key: "starter",
    name: "Starter",
    priceMonthly: 1490,
    priceYearly: 14990,
    spendCeilingThb: 10_000,
    adAccountLimit: 1,
    aiMsgPerDay: 30,
    isAddOn: false,
  },
  {
    key: "growth",
    name: "Growth",
    priceMonthly: 3890,
    priceYearly: 38990,
    spendCeilingThb: 30_000,
    adAccountLimit: 3,
    aiMsgPerDay: 100,
    isAddOn: false,
  },
  {
    key: "pro",
    name: "Pro",
    priceMonthly: 10_990,
    priceYearly: 109_990,
    spendCeilingThb: 100_000,
    adAccountLimit: 10,
    aiMsgPerDay: 300,
    isAddOn: false,
  },
  {
    key: "scale",
    name: "Scale",
    priceMonthly: 44_990,
    priceYearly: 449_990,
    spendCeilingThb: 500_000,
    adAccountLimit: 25,
    aiMsgPerDay: null,
    isAddOn: false,
  },
  {
    key: "enterprise",
    name: "Enterprise",
    priceMonthly: 0,
    priceYearly: 0,
    spendCeilingThb: null,
    adAccountLimit: 999,
    aiMsgPerDay: null,
    isAddOn: false,
  },
  // Add-ons
  {
    key: "event-sdk",
    name: "Event SDK + Pixel Tracking",
    priceMonthly: 590,
    priceYearly: 5990,
    spendCeilingThb: null,
    adAccountLimit: 0,
    aiMsgPerDay: null,
    isAddOn: true,
  },
  {
    key: "extra-ad-account",
    name: "Extra Ad Account",
    priceMonthly: 190,
    priceYearly: 1990,
    spendCeilingThb: null,
    adAccountLimit: 1,
    aiMsgPerDay: null,
    isAddOn: true,
  },
  {
    key: "white-label",
    name: "White-label Reports",
    priceMonthly: 490,
    priceYearly: 4990,
    spendCeilingThb: null,
    adAccountLimit: 0,
    aiMsgPerDay: null,
    isAddOn: true,
  },
  {
    key: "priority-ai",
    name: "Priority AI (Claude Opus)",
    priceMonthly: 890,
    priceYearly: 8990,
    spendCeilingThb: null,
    adAccountLimit: 0,
    aiMsgPerDay: null,
    isAddOn: true,
  },
];

const PLAN_BY_KEY: Record<string, PlanDef> = Object.fromEntries(
  PLANS.map((p) => [p.key, p]),
);

export function getPlan(key: PlanKey): PlanDef {
  const p = PLAN_BY_KEY[key];
  if (!p) throw new Error(`Unknown plan key: ${key}`);
  return p;
}

/** Base plans only, in ascending spend ceiling order. */
export const BASE_PLAN_KEYS: readonly PlanKey[] = [
  "starter",
  "growth",
  "pro",
  "scale",
  "enterprise",
];

/**
 * Pick the cheapest base plan whose spend ceiling is greater than the
 * given monthly ad spend. Enterprise (null ceiling) is the catch-all.
 */
export function pickRecommendedTier(adSpendThb: number): PlanKey {
  for (const key of BASE_PLAN_KEYS) {
    const p = PLAN_BY_KEY[key];
    if (p.spendCeilingThb === null) return key as PlanKey;
    if (adSpendThb < p.spendCeilingThb) return key as PlanKey;
  }
  return "enterprise";
}

/** True if planKey is the next tier above currentKey. */
export function isNextTier(currentKey: PlanKey, candidateKey: PlanKey): boolean {
  const i = BASE_PLAN_KEYS.indexOf(currentKey);
  const j = BASE_PLAN_KEYS.indexOf(candidateKey);
  return i >= 0 && j === i + 1;
}
