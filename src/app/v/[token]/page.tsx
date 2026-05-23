import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";

import { getViewerLinkByToken } from "@/lib/viewer-link";
import { getDashboardData } from "@/lib/meta/dashboard-service";
import { DEFAULT_LOCALE, isLocale, resolveLocaleFromString, type Locale } from "@/i18n/locales";
import type { DateRangeKey } from "@/lib/meta/insights";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic"; // viewCount per-request

const DATE_RANGE_TO_DAYS: Record<string, number> = { "7d": 7, "14d": 14, "30d": 30 };
const DATE_RANGE_TO_KEY: Record<string, DateRangeKey> = {
  "7d": "last_7d",
  "14d": "last_7d", // 14d not yet exposed in the cache; closest is 7d (v2 cache addition)
  "30d": "last_30d",
};

function resolveViewerLocale(headerValue: string | null, langParam: string | null): Locale {
  if (langParam && isLocale(langParam)) return langParam;
  if (headerValue) {
    const fromHeader = resolveLocaleFromString(headerValue);
    return fromHeader;
  }
  return DEFAULT_LOCALE === "th" ? "en" : DEFAULT_LOCALE; // viewer defaults to English when no signal
}

function formatThb(value: number, locale: Locale): string {
  try {
    return new Intl.NumberFormat(locale === "th" ? "th-TH" : locale === "lo" ? "lo-LA" : "en-US", {
      style: "currency",
      currency: "THB",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `฿${Math.round(value).toLocaleString()}`;
  }
}

function formatNumber(value: number, locale: Locale, opts: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(locale === "th" ? "th-TH" : locale === "lo" ? "lo-LA" : "en-US", opts).format(
    value,
  );
}

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ lang?: string }>;
};

export default async function ViewerPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { lang } = await searchParams;

  const link = await getViewerLinkByToken(token);
  if (!link) {
    notFound();
  }

  const h = await headers();
  const acceptLang = h.get("accept-language");
  const locale = resolveViewerLocale(acceptLang, lang ?? null);
  const t = await getTranslations({ locale, namespace: "viewer" });

  // Campaign scope ships in Commit 5; for now show a clear placeholder.
  if (link.scope === "CAMPAIGN") {
    return (
      <ViewerShell locale={locale}>
        <EmptyState message={t("campaignScopeUnsupported")} />
        <Footer poweredBy={t("poweredBy")} />
      </ViewerShell>
    );
  }

  const rangeKey = DATE_RANGE_TO_KEY[link.dateRange] ?? "last_7d";
  const days = DATE_RANGE_TO_DAYS[link.dateRange] ?? 7;

  let payload;
  try {
    const result = await getDashboardData(link.tenantId, rangeKey);
    payload = result.payload;
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("no Meta connection") || message.includes("Connection status is")) {
      return (
        <ViewerShell locale={locale}>
          <EmptyState message={t("noConnection")} />
          <Footer poweredBy={t("poweredBy")} />
        </ViewerShell>
      );
    }
    throw err;
  }

  const account = payload.accounts.find((a) => a.accountId === link.targetId);
  if (!account) {
    return (
      <ViewerShell locale={locale}>
        <EmptyState message={t("accountDeleted")} />
        <Footer poweredBy={t("poweredBy")} />
      </ViewerShell>
    );
  }

  const activeCampaigns = account.campaigns.filter((c) => c.effectiveStatus === "ACTIVE");
  const totalSpend = activeCampaigns.reduce((s, c) => s + c.spend, 0);
  const totalConversions = activeCampaigns.reduce((s, c) => s + c.conversions, 0);
  const totalPurchaseValue = activeCampaigns.reduce((s, c) => s + c.purchaseValue, 0);
  const roas = totalSpend > 0 ? totalPurchaseValue / totalSpend : 0;

  const fetchedAt = new Date(payload.fetchedAt);
  const fetchedLabel = new Intl.DateTimeFormat(
    locale === "th" ? "th-TH" : locale === "lo" ? "lo-LA" : "en-US",
    { dateStyle: "medium", timeStyle: "short" },
  ).format(fetchedAt);

  return (
    <ViewerShell locale={locale}>
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{link.tenant.name}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{account.accountName}</h1>
        <p className="text-sm text-muted-foreground">
          {t("dateRangeLabel", { days })} · {t("lastUpdated", { date: fetchedLabel })}
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label={t("kpi.spend")} value={formatThb(totalSpend, locale)} />
        <KpiCard label={t("kpi.purchase")} value={formatNumber(totalConversions, locale)} />
        <KpiCard label={t("kpi.roas")} value={`${roas.toFixed(2)}x`} />
        <KpiCard label={t("kpi.activeCampaigns")} value={formatNumber(activeCampaigns.length, locale)} />
      </section>

      {activeCampaigns.length === 0 ? (
        <EmptyState message={t("empty")} />
      ) : (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeCampaigns.map((c) => {
            const cpa = c.conversions > 0 ? c.spend / c.conversions : 0;
            const campaignRoas = c.spend > 0 ? c.purchaseValue / c.spend : 0;
            return (
              <Card key={c.campaignId} className="overflow-hidden">
                {/* Creative preview placeholder — wired in Commit 3. */}
                <div className="aspect-video w-full bg-muted/40" aria-hidden />
                <CardContent className="flex flex-col gap-2 px-4 pt-3 pb-4 text-sm">
                  <div className="line-clamp-2 font-medium text-foreground">{c.campaignName}</div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <CampaignMetric label={t("campaign.spend")} value={formatThb(c.spend, locale)} />
                    <CampaignMetric
                      label={t("campaign.ctr")}
                      value={`${c.ctr.toFixed(2)}%`}
                    />
                    <CampaignMetric
                      label={t("campaign.cpa")}
                      value={cpa > 0 ? formatThb(cpa, locale) : "—"}
                    />
                    <CampaignMetric label={t("campaign.roas")} value={`${campaignRoas.toFixed(2)}x`} />
                  </dl>
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}

      <Footer poweredBy={t("poweredBy")} />
    </ViewerShell>
  );
}

function ViewerShell({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <div lang={locale} className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:py-10">{children}</div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card size="sm" className="px-4">
      <div className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="text-xl font-semibold tabular-nums">{value}</span>
      </div>
    </Card>
  );
}

function CampaignMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] uppercase tracking-wide">{label}</dt>
      <dd className={cn("font-medium tabular-nums text-foreground")}>{value}</dd>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card className="px-6 py-10 text-center text-sm text-muted-foreground">
      <CardContent>{message}</CardContent>
    </Card>
  );
}

function Footer({ poweredBy }: { poweredBy: string }) {
  return (
    <footer className="pt-2 text-center text-xs text-muted-foreground">
      <a
        href="https://adslab-theta.vercel.app"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-foreground"
      >
        {poweredBy}
      </a>
    </footer>
  );
}
