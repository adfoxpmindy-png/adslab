import { CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { getPlan, type PlanKey } from "@/lib/billing/plans";
import { splitVat } from "@/lib/billing/tier-rules";
import { formatDate, formatNumber } from "@/lib/i18n/format";
import { SetPageTitle } from "@/components/tenant/topbar-page-title";

import { BillingActions } from "./billing-actions";

export default async function BillingPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant, role } = await requireTenantMember(tenantSlug);
  const t = await getTranslations("pages.settingsBilling");
  const locale = await getLocale();

  const subscription = await prisma.tenantSubscription.findUnique({
    where: { tenantId: tenant.id },
    include: { plan: true },
  });
  const invoices = await prisma.invoice.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
    take: 12,
  });

  if (!subscription) {
    // Shouldn't happen — gate would have redirected to /setup-billing.
    return <p className="text-muted-foreground">{t("noSubscription")}</p>;
  }

  const plan = subscription.plan;
  const planDef = getPlan(plan.key as PlanKey);
  const periodPrice =
    subscription.interval === "MONTHLY"
      ? plan.priceMonthly
      : plan.priceYearly;

  const statusLabel: Record<typeof subscription.status, { label: string; color: string; icon: React.ElementType }> = {
    TRIALING: { label: t("status.trialing"), color: "text-cyan-700 bg-cyan-50 dark:bg-cyan-950/30 dark:text-cyan-300", icon: Clock },
    ACTIVE: { label: t("status.active"), color: "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-300", icon: CheckCircle2 },
    PAST_DUE: { label: t("status.pastDue"), color: "text-red-700 bg-red-50 dark:bg-red-950/30 dark:text-red-300", icon: AlertCircle },
    SUSPENDED: { label: t("status.suspended"), color: "text-red-700 bg-red-50 dark:bg-red-950/30 dark:text-red-300", icon: AlertCircle },
    CANCELLED: { label: t("status.cancelled"), color: "text-muted-foreground bg-muted", icon: AlertCircle },
  };
  const sLabel = statusLabel[subscription.status];
  const Icon = sLabel.icon;

  const periodLabel =
    subscription.interval === "MONTHLY" ? t("periodMonth") : t("periodYear");

  return (
    <>
      <SetPageTitle
        title={t("title")}
        subtitle={t("subtitle")}
      />
      <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-6">
      {/* Current plan card */}
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("currentPlan")}</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">{plan.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("pricePeriod", { price: formatNumber(periodPrice, locale), periodLabel })}
            </p>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${sLabel.color}`}>
            <Icon className="size-3" />
            {sLabel.label}
          </span>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Ad accounts</dt>
            <dd className="mt-0.5 font-medium">
              {planDef.adAccountLimit + subscription.extraAdAccounts}
              {subscription.extraAdAccounts > 0 && (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({planDef.adAccountLimit} + {subscription.extraAdAccounts} extra)
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("aiMsgPerDay")}</dt>
            <dd className="mt-0.5 font-medium">
              {planDef.aiMsgPerDay ?? t("unlimited")}
            </dd>
          </div>
          {subscription.status === "TRIALING" && subscription.trialEndsAt && (
            <div className="col-span-2">
              <dt className="text-muted-foreground">{t("trialUntil")}</dt>
              <dd className="mt-0.5 font-medium">
                {formatDate(new Date(subscription.trialEndsAt), locale, { day: "numeric", month: "long", year: "numeric" })}
              </dd>
            </div>
          )}
          {subscription.status === "ACTIVE" && (
            <div className="col-span-2">
              <dt className="text-muted-foreground">{t("nextBilling")}</dt>
              <dd className="mt-0.5 font-medium">
                {formatDate(new Date(subscription.currentPeriodEnd), locale, { day: "numeric", month: "long", year: "numeric" })}
                {subscription.cancelAtPeriodEnd && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                    {t("willCancelToday")}
                  </span>
                )}
              </dd>
            </div>
          )}
        </dl>

        {/* Add-ons */}
        <div className="mt-6 border-t border-border pt-5">
          <h3 className="mb-3 text-sm font-semibold">Add-ons</h3>
          <ul className="grid gap-2 text-sm">
            {(["event-sdk", "white-label", "priority-ai"] as const).map((k) => {
              const a = getPlan(k);
              const active = subscription.addOnKeys.includes(k);
              const freeFromPlan = k === "white-label" && (plan.key === "scale" || plan.key === "enterprise");
              return (
                <li key={k} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <div>
                    <p className="font-medium">{a.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("perMonth", { price: formatNumber(a.priceMonthly, locale) })}
                      {freeFromPlan && <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">{t("includedInPlan")}</span>}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-0.5 text-xs font-semibold ${
                    active || freeFromPlan
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {active || freeFromPlan ? t("addOnOn") : t("addOnOff")}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {role === "OWNER" && subscription.status !== "CANCELLED" && (
          <BillingActions
            tenantSlug={tenantSlug}
            currentAddOns={subscription.addOnKeys}
            cancelAtPeriodEnd={subscription.cancelAtPeriodEnd}
            planKey={plan.key}
          />
        )}
      </section>

      {/* Invoices */}
      <section className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-lg font-semibold">{t("invoicesHeading")}</h3>
        {invoices.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("noInvoices")}</p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="pb-2 font-medium">{t("tableDate")}</th>
                <th className="pb-2 font-medium">{t("tableAmount")}</th>
                <th className="pb-2 font-medium">{t("tableStatus")}</th>
                <th className="pb-2 font-medium">{t("tableVat")}</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const { base, vat } = splitVat(inv.amount);
                return (
                  <tr key={inv.id} className="border-b border-border/50">
                    <td className="py-2.5">
                      {formatDate(new Date(inv.createdAt), locale, { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="py-2.5 font-medium tabular-nums">
                      ฿{formatNumber(inv.amount, locale)}
                    </td>
                    <td className="py-2.5">
                      <InvoiceStatusBadge status={inv.status} />
                    </td>
                    <td className="py-2.5 text-xs text-muted-foreground">
                      {t("vatSplit", { base: formatNumber(base, locale), vat: formatNumber(vat, locale) })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      </div>
    </>
  );
}

async function InvoiceStatusBadge({ status }: { status: "PENDING" | "PAID" | "FAILED" | "REFUNDED" }) {
  const t = await getTranslations("pages.settingsBilling.invoiceStatus");
  const styles: Record<typeof status, string> = {
    PENDING: "bg-amber-100 text-amber-800",
    PAID: "bg-emerald-100 text-emerald-800",
    FAILED: "bg-red-100 text-red-800",
    REFUNDED: "bg-blue-100 text-blue-800",
  };
  const labels: Record<typeof status, string> = {
    PENDING: t("pending"),
    PAID: t("paid"),
    FAILED: t("failed"),
    REFUNDED: t("refunded"),
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
