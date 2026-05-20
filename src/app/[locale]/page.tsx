import Image from "next/image";
import { Link } from "@/i18n/routing";
import { redirect } from "next/navigation";
import { Brain, BarChart3, Crosshair, Layers, Megaphone, Zap, Check } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button";
import { SiteFooter } from "@/components/site-footer";
import { cn } from "@/lib/utils";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatNumber } from "@/lib/i18n/format";

export async function generateMetadata() {
  const t = await getTranslations("pages.landing.meta");
  return {
    title: t("title"),
    description: t("description"),
    openGraph: {
      title: t("ogTitle"),
      description: t("ogDescription"),
      images: ["/adslab-logo.png"],
    },
  };
}

export default async function HomePage() {
  // Logged-in users → straight to their dashboard.
  const session = await getSession();
  if (session.userId) {
    const m = await prisma.tenantMember.findFirst({
      where: { userId: session.userId },
      orderBy: { createdAt: "asc" },
      select: { tenant: { select: { slug: true } } },
    });
    // Send directly to the Insights section (= dashboard overview) so we
    // skip the proxy hop from the legacy /dashboard → /insights redirect.
    if (m) redirect(`/t/${m.tenant.slug}/insights`);
  }

  const t = await getTranslations("pages.landing");
  const locale = await getLocale();
  const starterBullets = (await getTranslations("pages.landing.pricing")).raw("starterBullets") as string[];
  const growthBullets = (await getTranslations("pages.landing.pricing")).raw("growthBullets") as string[];
  const proBullets = (await getTranslations("pages.landing.pricing")).raw("proBullets") as string[];
  const scaleBullets = (await getTranslations("pages.landing.pricing")).raw("scaleBullets") as string[];

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-white/80 backdrop-blur dark:bg-background/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Image
            src="/adslab-logo.png"
            alt="AdsLab"
            width={400}
            height={120}
            priority
            className="h-8 w-auto dark:brightness-0 dark:invert"
          />
          <nav className="flex items-center gap-3 text-sm">
            <Link href="#pricing" className="hidden text-muted-foreground hover:text-foreground sm:block">
              {t("header.pricing")}
            </Link>
            <Link href="/login" className="text-muted-foreground hover:text-foreground">
              {t("header.login")}
            </Link>
            <Link href="/signup" className={cn(buttonVariants({ size: "sm" }))}>
              {t("header.signup")}
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <div className="mx-auto inline-block rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300">
            {t("hero.pill")}
          </div>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight sm:text-5xl">
            {t("hero.headline")}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            {t("hero.subtitle")}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className={cn(buttonVariants({ size: "lg" }), "min-w-[200px]")}
            >
              {t("hero.ctaPrimary")}
            </Link>
            <Link
              href="#pricing"
              className={cn(buttonVariants({ size: "lg", variant: "outline" }), "min-w-[200px]")}
            >
              {t("hero.ctaSecondary")}
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {t("hero.microcopy")}
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-center text-3xl font-bold tracking-tight">
            {t("features.heading")}
          </h2>
          <p className="mt-3 text-center text-muted-foreground">
            {t("features.subheading")}
          </p>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={BarChart3}
              title={t("features.dashboardTitle")}
              desc={t("features.dashboardDesc")}
            />
            <FeatureCard
              icon={Brain}
              title={t("features.aiTitle")}
              desc={t("features.aiDesc")}
            />
            <FeatureCard
              icon={Crosshair}
              title={t("features.audienceTitle")}
              desc={t("features.audienceDesc")}
            />
            <FeatureCard
              icon={Megaphone}
              title={t("features.builderTitle")}
              desc={t("features.builderDesc")}
            />
            <FeatureCard
              icon={Layers}
              title={t("features.sdkTitle")}
              desc={t("features.sdkDesc")}
            />
            <FeatureCard
              icon={Zap}
              title={t("features.journeyTitle")}
              desc={t("features.journeyDesc")}
            />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-b border-border bg-muted/20">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-center text-3xl font-bold tracking-tight">{t("pricing.heading")}</h2>
          <p className="mt-3 text-center text-muted-foreground">
            {t("pricing.subheading")}
          </p>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <PricingCard
              name="Starter"
              priceThb={1490}
              priceLabel={formatNumber(1490, locale)}
              perMonth={t("pricing.perMonth")}
              suitableFor={t("pricing.starterSuitable")}
              bullets={starterBullets}
            />
            <PricingCard
              name="Growth"
              priceThb={3890}
              priceLabel={formatNumber(3890, locale)}
              perMonth={t("pricing.perMonth")}
              suitableFor={t("pricing.growthSuitable")}
              bullets={growthBullets}
              recommendedBadge={t("pricing.recommendedBadge")}
              recommended
            />
            <PricingCard
              name="Pro"
              priceThb={10990}
              priceLabel={formatNumber(10990, locale)}
              perMonth={t("pricing.perMonth")}
              suitableFor={t("pricing.proSuitable")}
              bullets={proBullets}
            />
            <PricingCard
              name="Scale"
              priceThb={44990}
              priceLabel={formatNumber(44990, locale)}
              perMonth={t("pricing.perMonth")}
              suitableFor={t("pricing.scaleSuitable")}
              bullets={scaleBullets}
            />
          </div>

          <div className="mt-12 rounded-xl border border-border bg-card p-6">
            <h3 className="font-semibold">{t("pricing.addonsHeading")}</h3>
            <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <li className="flex items-baseline gap-2">
                <span className="text-cyan-600">·</span>
                <span><b>{t("pricing.addon1Name")}</b> — {t("pricing.addon1Price")}</span>
              </li>
              <li className="flex items-baseline gap-2">
                <span className="text-cyan-600">·</span>
                <span><b>{t("pricing.addon2Name")}</b> — {t("pricing.addon2Price")}</span>
              </li>
              <li className="flex items-baseline gap-2">
                <span className="text-cyan-600">·</span>
                <span><b>{t("pricing.addon3Name")}</b> — {t("pricing.addon3Price")}</span>
              </li>
              <li className="flex items-baseline gap-2">
                <span className="text-cyan-600">·</span>
                <span><b>{t("pricing.addon4Name")}</b> — {t("pricing.addon4Price")}</span>
              </li>
            </ul>
            <p className="mt-5 text-xs text-muted-foreground">
              {t("pricing.enterpriseQuestion")} <a href="mailto:support@ads-lab.xyz?subject=Enterprise%20plan%20inquiry" className="text-cyan-600 hover:underline">{t("pricing.enterpriseCta")}</a> {t("pricing.enterpriseSuffix")}
            </p>
          </div>

          <div className="mt-12 rounded-xl border border-cyan-200 bg-cyan-50 p-6 text-sm dark:border-cyan-900 dark:bg-cyan-950/30">
            <h3 className="font-semibold text-cyan-900 dark:text-cyan-100">{t("pricing.payHeading")}</h3>
            <ul className="mt-3 space-y-1.5 text-cyan-900 dark:text-cyan-100">
              <li className="flex items-start gap-1.5"><Check className="mt-0.5 size-3.5 shrink-0" /><span>{t("pricing.pay1")}</span></li>
              <li className="flex items-start gap-1.5"><Check className="mt-0.5 size-3.5 shrink-0" /><span>{t("pricing.pay2")}</span></li>
              <li className="flex items-start gap-1.5"><Check className="mt-0.5 size-3.5 shrink-0" /><span>{t("pricing.pay3")}</span></li>
              <li className="flex items-start gap-1.5"><Check className="mt-0.5 size-3.5 shrink-0" /><span>{t("pricing.pay4")}</span></li>
              <li className="flex items-start gap-1.5"><Check className="mt-0.5 size-3.5 shrink-0" /><span>{t("pricing.pay5")}</span></li>
            </ul>
            <p className="mt-4 text-xs">
              {t("pricing.payLinkPrefix")} <Link href="/refund-policy" className="font-semibold underline-offset-2 hover:underline">{t("pricing.payRefundLink")}</Link>
              {" · "}<Link href="/terms" className="font-semibold underline-offset-2 hover:underline">{t("pricing.payTermsLink")}</Link>
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="text-3xl font-bold tracking-tight">{t("cta.heading")}</h2>
          <p className="mt-3 text-muted-foreground">
            {t("cta.subtitle")}
          </p>
          <Link
            href="/signup"
            className={cn(buttonVariants({ size: "lg" }), "mt-8 min-w-[240px]")}
          >
            {t("cta.button")}
          </Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

function FeatureCard({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 transition-all hover:border-cyan-300 hover:shadow-sm">
      <div className="flex size-10 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-300">
        <Icon className="size-5" />
      </div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function PricingCard({
  name,
  priceLabel,
  perMonth,
  suitableFor,
  bullets,
  recommended,
  recommendedBadge,
}: {
  name: string;
  priceThb: number;
  priceLabel: string;
  perMonth: string;
  suitableFor: string;
  bullets: string[];
  recommended?: boolean;
  recommendedBadge?: string;
}) {
  return (
    <div
      className={cn(
        "relative rounded-xl border bg-card p-6",
        recommended ? "border-cyan-500 shadow-md" : "border-border",
      )}
    >
      {recommended && recommendedBadge && (
        <span className="absolute -top-2 left-4 rounded-full bg-cyan-600 px-2 py-0.5 text-[10px] font-semibold text-white">
          {recommendedBadge}
        </span>
      )}
      <p className="text-lg font-bold">{name}</p>
      <p className="mt-2 text-3xl font-extrabold tracking-tight">
        ฿{priceLabel}
        <span className="ml-1 text-sm font-normal text-muted-foreground">{perMonth}</span>
      </p>
      <p className="mt-1.5 text-xs text-muted-foreground">{suitableFor}</p>
      <ul className="mt-4 space-y-1.5 text-xs">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-1.5">
            <Check className="mt-0.5 size-3 shrink-0 text-cyan-600" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
