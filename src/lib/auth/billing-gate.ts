/**
 * Subscription gate for tenant routes. Redirects to /setup-billing if
 * the tenant has no active or trialing subscription, OR if the
 * subscription is SUSPENDED.
 *
 * Called from `src/app/t/[tenantSlug]/layout.tsx` after
 * `requireTenantMember()`.
 */

import { cache } from "react";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";

export type ActiveSubscription = {
  status: "TRIALING" | "ACTIVE" | "PAST_DUE";
  planKey: string;
  planName: string;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  addOnKeys: string[];
};

/**
 * Throws via redirect() if no usable subscription. Returns subscription
 * details for layouts that want to surface trial state in the UI.
 */
export const requireActiveSubscription = cache(async function (
  tenantSlug: string,
): Promise<ActiveSubscription> {
  const sub = await prisma.tenantSubscription.findFirst({
    where: { tenant: { slug: tenantSlug } },
    include: { plan: true },
  });

  if (!sub) {
    redirect(`/setup-billing?tenant=${encodeURIComponent(tenantSlug)}&reason=no_subscription`);
  }

  if (sub.status === "SUSPENDED") {
    redirect(`/setup-billing?tenant=${encodeURIComponent(tenantSlug)}&reason=suspended`);
  }

  if (sub.status === "CANCELLED" && sub.currentPeriodEnd < new Date()) {
    redirect(`/setup-billing?tenant=${encodeURIComponent(tenantSlug)}&reason=expired`);
  }

  return {
    status: sub.status as ActiveSubscription["status"],
    planKey: sub.plan.key,
    planName: sub.plan.name,
    trialEndsAt: sub.trialEndsAt,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    addOnKeys: sub.addOnKeys,
  };
});
