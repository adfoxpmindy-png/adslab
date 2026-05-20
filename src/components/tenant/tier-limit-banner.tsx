"use client";

import Link from "next/link";
import { AlertCircle, Clock, CreditCard } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

type Props = {
  status: "TRIALING" | "ACTIVE" | "PAST_DUE";
  planName: string;
  trialEndsAt: Date | null;
  tenantSlug: string;
};

const LOCALE_MAP: Record<string, string> = {
  th: "th-TH",
  en: "en-US",
  lo: "lo-LA",
};

export function TierLimitBanner({ status, planName, trialEndsAt, tenantSlug }: Props) {
  const t = useTranslations("banners.tierLimit");
  const locale = useLocale();
  const billingHref = `/t/${tenantSlug}/settings/billing`;

  if (status === "PAST_DUE") {
    return (
      <div className="border-b border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30">
        <div className="mx-auto flex max-w-screen-2xl items-center gap-3 px-6 py-2.5 text-sm">
          <AlertCircle className="size-4 shrink-0 text-red-600 dark:text-red-400" />
          <p className="flex-1 text-red-900 dark:text-red-100">{t("pastDueMessage")}</p>
          <Link
            href={billingHref}
            className="rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700"
          >
            {t("pastDueAction")}
          </Link>
        </div>
      </div>
    );
  }

  if (status === "TRIALING" && trialEndsAt) {
    const days = Math.ceil(
      // eslint-disable-next-line react-hooks/purity -- trial countdown intentionally depends on Date.now(); recomputed on each render
      (new Date(trialEndsAt).getTime() - Date.now()) / (24 * 3600 * 1000),
    );
    if (days <= 2) {
      const dateStr = new Date(trialEndsAt).toLocaleDateString(
        LOCALE_MAP[locale] ?? "en-US",
        {
          day: "numeric",
          month: "long",
        },
      );
      return (
        <div className="border-b border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30">
          <div className="mx-auto flex max-w-screen-2xl items-center gap-3 px-6 py-2.5 text-sm">
            <Clock className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="flex-1 text-amber-900 dark:text-amber-100">
              {t.rich("trialEndingSoon", {
                days,
                dateStr,
                planName,
                b: (chunks) => <b>{chunks}</b>,
              })}
            </p>
            <Link
              href={billingHref}
              className="rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700"
            >
              {t("manage")}
            </Link>
          </div>
        </div>
      );
    }
    if (days <= 7) {
      return (
        <div className="border-b border-cyan-100 bg-cyan-50 dark:border-cyan-900/40 dark:bg-cyan-950/20">
          <div className="mx-auto flex max-w-screen-2xl items-center gap-3 px-6 py-2 text-sm">
            <CreditCard className="size-4 shrink-0 text-cyan-600 dark:text-cyan-400" />
            <p className="flex-1 text-cyan-900 dark:text-cyan-100">
              {t("trialInProgress", { days })}
            </p>
            <Link
              href={billingHref}
              className="text-xs font-medium text-cyan-700 hover:underline dark:text-cyan-300"
            >
              {t("viewPlans")}
            </Link>
          </div>
        </div>
      );
    }
  }

  return null;
}
