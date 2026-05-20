import { Link } from "@/i18n/routing";
import type { Locale } from "@/i18n/locales";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SiteFooter } from "@/components/site-footer";
import { COMPANY, getCompanyAddress } from "@/lib/company";

export const revalidate = 86400;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("pages.refundPolicy");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function RefundPolicyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("pages.refundPolicy");
  const companyAddress = await getCompanyAddress(locale as Locale);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          {t("backHome")}
        </Link>

        <h1 className="mt-6 text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("lastUpdated")}</p>

        <section className="prose prose-sm mt-8 max-w-none dark:prose-invert">
          <h2>{t("trial.heading")}</h2>
          <p dangerouslySetInnerHTML={{ __html: t.raw("trial.body1") }} />
          <p>{t("trial.body2")}</p>

          <h2>{t("prorated.heading")}</h2>
          <p dangerouslySetInnerHTML={{ __html: t.raw("prorated.body") }} />
          <p>
            <strong>{t("prorated.formulaLabel")}</strong>
            <br />
            <code>{t("prorated.formula")}</code>
          </p>
          <p>
            <strong>{t("prorated.exampleLabel")}</strong> {t("prorated.exampleBody")}
            <br />
            {t("prorated.exampleCalc")}
          </p>

          <h2>{t("cancel.heading")}</h2>
          <p dangerouslySetInnerHTML={{ __html: t.raw("cancel.body") }} />
          <ul>
            <li>{t("cancel.item1")}</li>
            <li>{t("cancel.item2")}</li>
            <li>{t("cancel.item3")}</li>
          </ul>

          <h2>{t("nonRefundable.heading")}</h2>
          <p>{t("nonRefundable.body")}</p>
          <ul>
            <li>{t("nonRefundable.item1")}</li>
            <li>{t("nonRefundable.item2")}</li>
            <li>{t("nonRefundable.item3")}</li>
          </ul>

          <h2>{t("process.heading")}</h2>
          <ol>
            <li dangerouslySetInnerHTML={{ __html: t.raw("process.step1") }} />
            <li dangerouslySetInnerHTML={{ __html: t.raw("process.step2") }} />
            <li>{t("process.step3")}</li>
            <li>{t("process.step4")}</li>
          </ol>
          <p>
            {t("process.specialContact")}{" "}
            <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a>
          </p>

          <h2>{t("planChange.heading")}</h2>
          <p>{t("planChange.body")}</p>

          <h2>{t("contact.heading")}</h2>
          <p>
            {t("contact.emailLabel")} <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a>
            <br />
            {t("contact.phoneLabel")} {COMPANY.contactPhone}
            <br />
            {t("contact.addressLabel")} {companyAddress}
          </p>

          <hr />

          <h2 id="english">{t("english.heading")}</h2>
          <p dangerouslySetInnerHTML={{ __html: t.raw("english.trial") }} />
          <p dangerouslySetInnerHTML={{ __html: t.raw("english.prorated") }} />
          <p dangerouslySetInnerHTML={{ __html: t.raw("english.cancel") }} />
          <p dangerouslySetInnerHTML={{ __html: t.raw("english.nonRefundable") }} />
          <p>
            <span dangerouslySetInnerHTML={{ __html: t.raw("english.contactLabel") }} />{" "}
            {COMPANY.supportEmail} · {COMPANY.contactPhone}
          </p>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
