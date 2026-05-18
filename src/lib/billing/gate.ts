/**
 * Feature gating. Single entry point: `requireFeature(tenantId, key, locale)`
 * throws `FeatureGateError` if the tenant's effective subscription
 * does not allow the requested feature.
 *
 * The `upgradeHint` on the error is already localized to the caller's
 * `locale` (resolved via `resolveUserLocale(userId)` at the call site).
 * Callers translate the error into HTTP 402 (Payment Required) with
 * `gateErrorToResponse()`.
 */

import { cache } from "react";
import { getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import type { Locale } from "@/i18n/locales";
import {
  type PlanKey,
  getPlan,
} from "./plans";

export type FeatureKey =
  | "ai-chat"
  | "ai-chat-msg"
  | "ad-account-count"
  | "event-sdk"
  | "white-label"
  | "priority-ai";

export type GateReason =
  | "TIER_LIMIT"
  | "ADDON_REQUIRED"
  | "TRIAL_EXPIRED"
  | "SUSPENDED"
  | "NO_SUBSCRIPTION";

export class FeatureGateError extends Error {
  reason: GateReason;
  feature: FeatureKey;
  upgradeHint?: string;
  constructor(feature: FeatureKey, reason: GateReason, upgradeHint?: string) {
    super(`Gate blocked: ${feature} — ${reason}`);
    this.reason = reason;
    this.feature = feature;
    this.upgradeHint = upgradeHint;
  }
}

/**
 * Returns the tenant's subscription + plan, or null if no
 * subscription row exists yet. Cached per request via React cache().
 */
export const getEffectiveSubscription = cache(async (tenantId: string) => {
  return prisma.tenantSubscription.findUnique({
    where: { tenantId },
    include: { plan: true },
  });
});

/**
 * Check a feature. Throws on block. The current-day counter for
 * `ai-chat-msg` is read from UsageMetric.
 *
 * @param locale  Caller-resolved locale. Used to localize the
 *                `upgradeHint` on `FeatureGateError`. Pass the result
 *                of `resolveUserLocale(userId)` from
 *                `@/lib/i18n/server`.
 */
export async function requireFeature(
  tenantId: string,
  feature: FeatureKey,
  locale: Locale,
  ctx?: { delta?: number },
): Promise<void> {
  const sub = await getEffectiveSubscription(tenantId);
  if (!sub) {
    throw new FeatureGateError(feature, "NO_SUBSCRIPTION");
  }

  if (sub.status === "SUSPENDED") {
    throw new FeatureGateError(feature, "SUSPENDED");
  }

  if (sub.status === "CANCELLED") {
    // Access continues until currentPeriodEnd; after that, gates fail.
    if (sub.currentPeriodEnd < new Date()) {
      throw new FeatureGateError(feature, "TRIAL_EXPIRED");
    }
  }

  if (sub.status === "PAST_DUE") {
    // 3-day grace already allowed (handled by cron). Block AI features
    // only — let user keep dashboard read access to find the bill.
    if (feature === "ai-chat" || feature === "ai-chat-msg") {
      throw new FeatureGateError(feature, "SUSPENDED");
    }
  }

  const planKey = sub.plan.key as PlanKey;
  const planDef = getPlan(planKey);
  const t = await getTranslations({ locale, namespace: "billing.gate" });

  switch (feature) {
    case "ai-chat":
      // gated by status only (already checked above)
      return;

    case "ai-chat-msg": {
      if (planDef.aiMsgPerDay === null) return; // unlimited
      const today = startOfDayUtc(new Date());
      const usage = await prisma.usageMetric.findUnique({
        where: { tenantId_date: { tenantId, date: today } },
      });
      const used = usage?.aiMessagesCount ?? 0;
      const delta = ctx?.delta ?? 1;
      if (used + delta > planDef.aiMsgPerDay) {
        throw new FeatureGateError(
          "ai-chat-msg",
          "TIER_LIMIT",
          t("aiMsgLimit", { limit: planDef.aiMsgPerDay }),
        );
      }
      return;
    }

    case "ad-account-count": {
      const limit = planDef.adAccountLimit + sub.extraAdAccounts;
      // Count active accounts via MetaConnection.adAccounts
      const conn = await prisma.metaConnection.findUnique({
        where: { tenantId },
        select: { _count: { select: { adAccounts: true } } },
      });
      const current = conn?._count.adAccounts ?? 0;
      const delta = ctx?.delta ?? 1;
      if (current + delta > limit) {
        throw new FeatureGateError(
          "ad-account-count",
          "TIER_LIMIT",
          t("adAccountLimit", { limit }),
        );
      }
      return;
    }

    case "event-sdk": {
      if (!sub.addOnKeys.includes("event-sdk")) {
        throw new FeatureGateError(
          "event-sdk",
          "ADDON_REQUIRED",
          t("eventSdkAddon"),
        );
      }
      return;
    }

    case "white-label": {
      const free = planKey === "scale" || planKey === "enterprise";
      if (free) return;
      if (!sub.addOnKeys.includes("white-label")) {
        throw new FeatureGateError(
          "white-label",
          "ADDON_REQUIRED",
          t("whiteLabelAddon"),
        );
      }
      return;
    }

    case "priority-ai": {
      if (!sub.addOnKeys.includes("priority-ai")) {
        throw new FeatureGateError(
          "priority-ai",
          "ADDON_REQUIRED",
          t("priorityAiAddon"),
        );
      }
      return;
    }
  }
}

/** Non-throwing variant. Returns true if allowed. */
export async function checkFeature(
  tenantId: string,
  feature: FeatureKey,
  locale: Locale,
  ctx?: { delta?: number },
): Promise<{ ok: true } | { ok: false; reason: GateReason; hint?: string }> {
  try {
    await requireFeature(tenantId, feature, locale, ctx);
    return { ok: true };
  } catch (err) {
    if (err instanceof FeatureGateError) {
      return { ok: false, reason: err.reason, hint: err.upgradeHint };
    }
    throw err;
  }
}

/** Convert a thrown FeatureGateError into a Response. */
export function gateErrorToResponse(err: FeatureGateError): Response {
  return Response.json(
    {
      error: "feature_gated",
      feature: err.feature,
      reason: err.reason,
      hint: err.upgradeHint,
    },
    { status: 402 },
  );
}

function startOfDayUtc(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
