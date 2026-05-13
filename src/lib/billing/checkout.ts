/**
 * Checkout orchestrator. Called from /api/billing/checkout. Creates
 * the Omise customer + saves card, then creates a `TenantSubscription`
 * in TRIALING state. **No charge happens during trial setup** — the
 * first charge fires from the billing-tick cron on day 8.
 */

import { prisma } from "@/lib/prisma";

import { getPlan, type PlanKey } from "./plans";
import { computePeriodTotal } from "./tier-rules";
import { saveCardToCustomer } from "./omise/customer";

export type StartTrialResult = {
  subscriptionId: string;
  trialEndsAt: Date;
  planKey: PlanKey;
  interval: "MONTHLY" | "YEARLY";
  total: number;
};

const TRIAL_DAYS = 7;

export async function startTrial(opts: {
  tenantId: string;
  email: string;
  planKey: PlanKey;
  interval: "MONTHLY" | "YEARLY";
  addOnKeys: string[];
  extraAdAccounts: number;
  cardToken: string;
}): Promise<StartTrialResult> {
  const plan = await prisma.plan.findUnique({ where: { key: opts.planKey } });
  if (!plan) throw new Error(`Plan ${opts.planKey} not found`);

  // Step 1: save card with Omise (creates customer if first time).
  const { customerId, cardId } = await saveCardToCustomer({
    tenantId: opts.tenantId,
    email: opts.email,
    cardToken: opts.cardToken,
  });

  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 3600 * 1000);
  const interval = opts.interval;
  const periodEnd =
    interval === "YEARLY"
      ? new Date(trialEndsAt.getTime() + 365 * 24 * 3600 * 1000)
      : new Date(trialEndsAt.getTime() + 30 * 24 * 3600 * 1000);

  const total = computePeriodTotal({
    planKey: opts.planKey,
    interval,
    addOnKeys: opts.addOnKeys,
    extraAdAccounts: opts.extraAdAccounts,
  });

  const sub = await prisma.tenantSubscription.upsert({
    where: { tenantId: opts.tenantId },
    create: {
      tenantId: opts.tenantId,
      planId: plan.id,
      status: "TRIALING",
      interval,
      trialEndsAt,
      currentPeriodStart: trialEndsAt,
      currentPeriodEnd: periodEnd,
      omiseCustomerId: customerId,
      omiseCardId: cardId,
      addOnKeys: opts.addOnKeys,
      extraAdAccounts: opts.extraAdAccounts,
    },
    update: {
      planId: plan.id,
      status: "TRIALING",
      interval,
      trialEndsAt,
      currentPeriodStart: trialEndsAt,
      currentPeriodEnd: periodEnd,
      omiseCustomerId: customerId,
      omiseCardId: cardId,
      addOnKeys: opts.addOnKeys,
      extraAdAccounts: opts.extraAdAccounts,
    },
  });

  await prisma.billingEvent.create({
    data: {
      tenantId: opts.tenantId,
      kind: "TRIAL_STARTED",
      payload: {
        planKey: opts.planKey,
        interval,
        addOnKeys: opts.addOnKeys,
        extraAdAccounts: opts.extraAdAccounts,
        total,
        trialEndsAt: trialEndsAt.toISOString(),
      },
    },
  });

  return {
    subscriptionId: sub.id,
    trialEndsAt,
    planKey: opts.planKey,
    interval,
    total,
  };
}

/**
 * Build the line-items snapshot stored on each Invoice. Used to render
 * the receipt page later — never changes after charge.
 */
export function buildLineItems(opts: {
  planKey: PlanKey;
  interval: "MONTHLY" | "YEARLY";
  addOnKeys: readonly string[];
  extraAdAccounts: number;
  total: number;
  vat: number;
  base: number;
}) {
  const planDef = getPlan(opts.planKey);
  const planPrice =
    opts.interval === "MONTHLY" ? planDef.priceMonthly : planDef.priceYearly;
  const addOnLines = opts.addOnKeys.map((k) => {
    const a = getPlan(k as PlanKey);
    return {
      key: k,
      name: a.name,
      price: opts.interval === "MONTHLY" ? a.priceMonthly : a.priceYearly,
    };
  });
  const extra = getPlan("extra-ad-account");
  return {
    planKey: opts.planKey,
    planName: planDef.name,
    planPrice,
    interval: opts.interval,
    addOns: addOnLines,
    extraAdAccounts: opts.extraAdAccounts,
    extraAdAccountUnitPrice:
      opts.interval === "MONTHLY" ? extra.priceMonthly : extra.priceYearly,
    base: opts.base,
    vat: opts.vat,
    total: opts.total,
  };
}
