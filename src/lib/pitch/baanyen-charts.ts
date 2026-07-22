/**
 * Precomputed breakdowns for the BaanYen pitch page charts.
 *
 * All numbers are derived from the same 30-day pull (2026-06-22 → 2026-07-21)
 * that produced src/lib/pitch/baanyen.ts. Values are hard-coded so the pitch
 * page stays static (no API dependency when a prospect opens the link).
 */

export type AgeBucket = {
  age: string;
  ctr: number;
  spend: number;
  spendPct: number;
};

export type GenderRow = {
  gender: string;
  spend: number;
  reach: number;
  cpe: number;
  cpm: number;
  ctr: number;
};

export type PlatformRow = {
  platform: string;
  spend: number;
  ctr: number;
  cpe: number;
  cpm: number;
};

export type RegionRow = {
  region: string;
  spend: number;
  ctr: number;
  spendPct: number;
  underserved?: boolean;
};

export type FunnelStep = {
  step: string;
  value: number;
  note?: string;
};

export type ImpactRow = {
  code: string;
  title: string;
  impactThb: number;
};

/** CTR by age bucket. Highlight bucket: 65+ (hidden gem). */
export const AGE_BREAKDOWN: AgeBucket[] = [
  { age: "18-24", ctr: 2.1, spend: 380, spendPct: 2.0 },
  { age: "25-34", ctr: 4.35, spend: 4720, spendPct: 24.7 },
  { age: "35-44", ctr: 4.87, spend: 5120, spendPct: 26.8 },
  { age: "45-54", ctr: 5.42, spend: 4180, spendPct: 21.8 },
  { age: "55-64", ctr: 6.14, spend: 3041, spendPct: 15.9 },
  { age: "65+", ctr: 7.89, spend: 1700, spendPct: 8.9 },
];

/** Facebook vs Instagram — CTR/CPE/CPM comparison. */
export const PLATFORM_COMPARISON: PlatformRow[] = [
  { platform: "Facebook", spend: 18292, ctr: 4.97, cpe: 0.88, cpm: 322 },
  { platform: "Instagram", spend: 849, ctr: 1.94, cpe: 1.5, cpm: 374 },
];

/** Gender allocation. Male gets better economics at same spend. */
export const GENDER_COMPARISON: GenderRow[] = [
  { gender: "Male", spend: 9414, reach: 19000, cpe: 0.75, cpm: 259, ctr: 4.45 },
  { gender: "Female", spend: 9459, reach: 11300, cpe: 1.09, cpm: 423, ctr: 5.51 },
  { gender: "Unknown", spend: 268, reach: 1500, cpe: 0, cpm: 0, ctr: 0 },
];

/** Spend allocation by region + regional CTR. */
export const REGION_BREAKDOWN: RegionRow[] = [
  { region: "Bangkok", spend: 14018, ctr: 4.55, spendPct: 73 },
  { region: "Nonthaburi", spend: 2300, ctr: 5.1, spendPct: 12 },
  { region: "Pathum Thani", spend: 773, ctr: 5.43, spendPct: 4, underserved: true },
  { region: "Samut Prakan", spend: 580, ctr: 4.2, spendPct: 3 },
  { region: "Nakhon Pathom", spend: 152, ctr: 5.28, spendPct: 0.8, underserved: true },
  { region: "Chiang Mai", spend: 34, ctr: 5.75, spendPct: 0.2, underserved: true },
  { region: "Others", spend: 1284, ctr: 4.6, spendPct: 6 },
];

/** Video funnel: hook rate 93% good, hold rate 14% low. */
export const FUNNEL_DROP: FunnelStep[] = [
  { step: "Impressions", value: 59106 },
  { step: "3s views", value: 55000, note: "Hook 93%" },
  { step: "ThruPlay 15s", value: 7700, note: "Hold 14%" },
  { step: "Engagement", value: 21400 },
  { step: "Messages", value: 682 },
];

/** Findings with projected impact > 0, sorted desc. */
export const IMPACT_BY_FINDING: ImpactRow[] = [
  { code: "A9", title: "Hold rate ต่ำ", impactThb: 2900 },
  { code: "A6", title: "Gender balance", impactThb: 2900 },
  { code: "A5", title: "Region expansion", impactThb: 1800 },
  { code: "A3", title: "Age 65+ scale", impactThb: 1700 },
  { code: "A2", title: "IG cut", impactThb: 400 },
];

/** Total account average — used as reference line in age chart. */
export const ACCOUNT_AVG_CTR = 4.86;
