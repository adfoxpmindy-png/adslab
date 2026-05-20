/**
 * Billing-tick: the daily heartbeat that drives the entire trial +
 * charge lifecycle. Called by /api/cron/billing-tick at 03:00 UTC.
 *
 * For each TenantSubscription:
 *
 *   TRIALING — send reminders at day -2/-1/0; charge on day +1.
 *   ACTIVE   — if currentPeriodEnd is past, recurring charge.
 *   PAST_DUE — if 3+ days past last failed charge, SUSPEND.
 *
 * Idempotent: reminders are guarded by BillingEvent records; charges
 * are guarded by Invoice rows for the upcoming period.
 */

import { prisma } from "@/lib/prisma";

import { chargeTenant } from "./omise/charge";
import { buildLineItems } from "./checkout";
import { computePeriodTotal, splitVat } from "./tier-rules";
import { sendEmail } from "@/lib/email/send";
import {
  trialReminder2dTemplate,
  trialReminder1dTemplate,
  invoicePaidTemplate,
  invoiceFailedTemplate,
  subscriptionCancelledTemplate,
} from "@/lib/email/templates/billing";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/locales";
import { formatDate } from "@/lib/i18n/format";
import { type PlanKey } from "./plans";

type TickStats = {
  total: number;
  remindersSent: number;
  charged: number;
  failed: number;
  suspended: number;
  cancelled: number;
  errors: { tenantId: string; message: string }[];
};

export async function runBillingTick(opts: {
  now?: Date;
  appUrl: string;
}): Promise<TickStats> {
  const now = opts.now ?? new Date();
  const stats: TickStats = {
    total: 0,
    remindersSent: 0,
    charged: 0,
    failed: 0,
    suspended: 0,
    cancelled: 0,
    errors: [],
  };

  const subs = await prisma.tenantSubscription.findMany({
    where: { status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] } },
    include: { plan: true, tenant: { include: { members: { where: { role: "OWNER" }, include: { user: true } } } } },
  });

  for (const sub of subs) {
    stats.total++;
    try {
      const owner = sub.tenant.members[0]?.user;
      if (!owner) continue;
      const dashUrl = `${opts.appUrl}/t/${sub.tenant.slug}/settings/billing`;
      const locale: Locale = isLocale(owner.preferredLocale)
        ? owner.preferredLocale
        : DEFAULT_LOCALE;

      if (sub.status === "TRIALING" && sub.trialEndsAt) {
        const daysToEnd = daysBetween(now, sub.trialEndsAt);

        if (daysToEnd === 2) {
          if (await sendReminderOnce(sub.tenantId, "TRIAL_REMINDER_2D")) {
            const t = await trialReminder2dTemplate({
              name: owner.name,
              planName: sub.plan.name,
              priceThb:
                sub.interval === "MONTHLY"
                  ? sub.plan.priceMonthly
                  : sub.plan.priceYearly,
              dashboardUrl: dashUrl,
              locale,
            });
            await sendEmail({ to: owner.email, ...t });
            stats.remindersSent++;
          }
        } else if (daysToEnd === 1) {
          if (await sendReminderOnce(sub.tenantId, "TRIAL_REMINDER_1D")) {
            const t = await trialReminder1dTemplate({
              name: owner.name,
              planName: sub.plan.name,
              priceThb:
                sub.interval === "MONTHLY"
                  ? sub.plan.priceMonthly
                  : sub.plan.priceYearly,
              dashboardUrl: dashUrl,
              locale,
            });
            await sendEmail({ to: owner.email, ...t });
            stats.remindersSent++;
          }
        } else if (daysToEnd <= 0) {
          // Trial ended — charge now.
          const result = await chargeForPeriod({
            tenantId: sub.tenantId,
            customerId: sub.omiseCustomerId!,
            planKey: sub.plan.key as PlanKey,
            interval: sub.interval,
            addOnKeys: sub.addOnKeys,
            extraAdAccounts: sub.extraAdAccounts,
            periodStart: now,
            periodEnd: addInterval(now, sub.interval),
          });

          if (result.kind === "paid") {
            await prisma.tenantSubscription.update({
              where: { tenantId: sub.tenantId },
              data: {
                status: "ACTIVE",
                currentPeriodStart: now,
                currentPeriodEnd: addInterval(now, sub.interval),
              },
            });
            const { base, vat } = splitVat(result.charge.amount);
            await sendEmail({
              to: owner.email,
              ...(await invoicePaidTemplate({
                name: owner.name,
                amountThb: result.charge.amount,
                vatThb: vat,
                baseThb: base,
                planName: sub.plan.name,
                invoiceUrl: dashUrl,
                locale,
              })),
            });
            stats.charged++;
          } else if (result.kind === "failed") {
            await prisma.tenantSubscription.update({
              where: { tenantId: sub.tenantId },
              data: { status: "PAST_DUE" },
            });
            await sendEmail({
              to: owner.email,
              ...(await invoiceFailedTemplate({
                name: owner.name,
                amountThb: 0,
                reason: result.failureMessage,
                retryUrl: dashUrl,
                locale,
              })),
            });
            stats.failed++;
          }
        }
      } else if (sub.status === "ACTIVE") {
        // Check if period ended.
        if (sub.currentPeriodEnd <= now) {
          if (sub.cancelAtPeriodEnd) {
            await prisma.tenantSubscription.update({
              where: { tenantId: sub.tenantId },
              data: { status: "CANCELLED", cancelledAt: now },
            });
            await sendEmail({
              to: owner.email,
              ...(await subscriptionCancelledTemplate({
                name: owner.name,
                accessUntil: formatDate(sub.currentPeriodEnd, locale),
                resubscribeUrl: dashUrl,
                locale,
              })),
            });
            stats.cancelled++;
          } else {
            // Recurring charge.
            const result = await chargeForPeriod({
              tenantId: sub.tenantId,
              customerId: sub.omiseCustomerId!,
              planKey: sub.plan.key as PlanKey,
              interval: sub.interval,
              addOnKeys: sub.addOnKeys,
              extraAdAccounts: sub.extraAdAccounts,
              periodStart: sub.currentPeriodEnd,
              periodEnd: addInterval(sub.currentPeriodEnd, sub.interval),
            });
            if (result.kind === "paid") {
              await prisma.tenantSubscription.update({
                where: { tenantId: sub.tenantId },
                data: {
                  currentPeriodStart: sub.currentPeriodEnd,
                  currentPeriodEnd: addInterval(
                    sub.currentPeriodEnd,
                    sub.interval,
                  ),
                },
              });
              stats.charged++;
            } else {
              await prisma.tenantSubscription.update({
                where: { tenantId: sub.tenantId },
                data: { status: "PAST_DUE" },
              });
              stats.failed++;
            }
          }
        }
      } else if (sub.status === "PAST_DUE") {
        // Look at most recent failed invoice — suspend if 3+ days old.
        const lastFailed = await prisma.invoice.findFirst({
          where: { tenantId: sub.tenantId, status: "FAILED" },
          orderBy: { createdAt: "desc" },
        });
        if (
          lastFailed &&
          now.getTime() - lastFailed.createdAt.getTime() >=
            3 * 24 * 3600 * 1000
        ) {
          await prisma.tenantSubscription.update({
            where: { tenantId: sub.tenantId },
            data: { status: "SUSPENDED" },
          });
          await prisma.billingEvent.create({
            data: {
              tenantId: sub.tenantId,
              kind: "SUSPENDED",
              payload: { reason: "past_due_3d" },
            },
          });
          stats.suspended++;
        }
      }
    } catch (err) {
      stats.errors.push({
        tenantId: sub.tenantId,
        message: (err as Error).message,
      });
      console.error(`[billing-tick] tenant=${sub.tenantId}`, err);
    }
  }

  return stats;
}

/** Send a reminder of a given kind exactly once per subscription. */
async function sendReminderOnce(
  tenantId: string,
  kind: "TRIAL_REMINDER_2D" | "TRIAL_REMINDER_1D",
): Promise<boolean> {
  const existing = await prisma.billingEvent.findFirst({
    where: {
      tenantId,
      kind: "TRIAL_REMINDER_SENT",
      payload: { path: ["kind"], equals: kind },
    },
  });
  if (existing) return false;
  await prisma.billingEvent.create({
    data: { tenantId, kind: "TRIAL_REMINDER_SENT", payload: { kind } },
  });
  return true;
}

async function chargeForPeriod(opts: {
  tenantId: string;
  customerId: string;
  planKey: PlanKey;
  interval: "MONTHLY" | "YEARLY";
  addOnKeys: string[];
  extraAdAccounts: number;
  periodStart: Date;
  periodEnd: Date;
}) {
  const total = computePeriodTotal({
    planKey: opts.planKey,
    interval: opts.interval,
    addOnKeys: opts.addOnKeys,
    extraAdAccounts: opts.extraAdAccounts,
  });
  const { base, vat } = splitVat(total);
  const lineItems = buildLineItems({
    planKey: opts.planKey,
    interval: opts.interval,
    addOnKeys: opts.addOnKeys,
    extraAdAccounts: opts.extraAdAccounts,
    total,
    base,
    vat,
  });
  return chargeTenant({
    tenantId: opts.tenantId,
    customerId: opts.customerId,
    amountThb: total,
    description: `AdsLab ${opts.planKey} (${opts.interval}) ${opts.periodStart.toISOString().slice(0, 10)} → ${opts.periodEnd.toISOString().slice(0, 10)}`,
    periodStart: opts.periodStart,
    periodEnd: opts.periodEnd,
    lineItems,
  });
}

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / (24 * 3600 * 1000));
}

function addInterval(d: Date, interval: "MONTHLY" | "YEARLY"): Date {
  const x = new Date(d);
  if (interval === "MONTHLY") x.setMonth(x.getMonth() + 1);
  else x.setFullYear(x.getFullYear() + 1);
  return x;
}
