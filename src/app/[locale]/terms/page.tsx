import { Link } from "@/i18n/routing";
import type { Locale } from "@/i18n/locales";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SiteFooter } from "@/components/site-footer";
import { COMPANY } from "@/lib/company";

const LAST_UPDATED = "2026-05-11";
const CONTACT_EMAIL = COMPANY.supportEmail;

export const revalidate = 86400;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("pages.terms");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("pages.terms");
  const privacyLink = (chunks: React.ReactNode) => (
    <Link className="text-primary underline-offset-4 hover:underline" href="/privacy">
      {chunks}
    </Link>
  );
  const deletionLink = (chunks: React.ReactNode) => (
    <Link className="text-primary underline-offset-4 hover:underline" href="/data-deletion">
      {chunks}
    </Link>
  );
  const strong = (chunks: React.ReactNode) => <strong>{chunks}</strong>;

  return (
    <>
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8">
        <Link href="/" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          {t("backHome")}
        </Link>
      </div>

      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("lastUpdated", { date: LAST_UPDATED })}</p>
      </header>

      {/* ============== Thai ============== */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold tracking-tight">{t("thaiHeading")}</h2>

        <Block title={t("th.s1.title")}>
          {t.rich("th.s1.body", { privacyLink })}
        </Block>

        <Block title={t("th.s2.title")}>
          {t.rich("th.s2.body", { strong })}
        </Block>

        <Block title={t("th.s3.title")}>
          <ul className="ml-6 list-disc space-y-1.5">
            <li>{t("th.s3.item1")}</li>
            <li>{t("th.s3.item2")}</li>
            <li>{t("th.s3.item3")}</li>
            <li>{t("th.s3.item4")}</li>
          </ul>
        </Block>

        <Block title={t("th.s4.title")}>
          {t("th.s4.intro")}
          <ul className="ml-6 list-disc space-y-1.5">
            <li>{t("th.s4.item1")}</li>
            <li>{t("th.s4.item2")}</li>
            <li>{t("th.s4.item3")}</li>
            <li>{t("th.s4.item4")}</li>
            <li>{t("th.s4.item5")}</li>
          </ul>
        </Block>

        <Block title={t("th.s5.title")}>
          {t("th.s5.intro")}
          <ul className="ml-6 list-disc space-y-1.5">
            <li>{t("th.s5.item1")}</li>
            <li>{t("th.s5.item2")}</li>
            <li>{t("th.s5.item3")}</li>
            <li>{t("th.s5.item4")}</li>
          </ul>
        </Block>

        <Block title={t("th.s6.title")}>
          {t("th.s6.body")}
        </Block>

        <Block title={t("th.s7.title")}>
          <ul className="ml-6 list-disc space-y-1.5">
            <li>{t("th.s7.item1")}</li>
            <li>{t("th.s7.item2")}</li>
            <li>{t("th.s7.item3")}</li>
          </ul>
        </Block>

        <Block title={t("th.s8.title")}>
          {t.rich("th.s8.body", { deletionLink })}
        </Block>

        <Block title={t("th.s9.title")}>
          {t("th.s9.body")}
        </Block>

        <Block title={t("th.s10.title")}>
          {t("th.s10.body")}
        </Block>

        <Block title={t("th.s11.title")}>
          {t("th.s11.emailLabel")} <a className="text-primary underline-offset-4 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </Block>
      </section>

      <hr className="my-12 border-border" />

      {/* ============== English ============== */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold tracking-tight">{t("englishHeading")}</h2>

        <Block title={t("en.s1.title")}>
          {t.rich("en.s1.body", { privacyLink })}
        </Block>

        <Block title={t("en.s2.title")}>
          {t.rich("en.s2.body", { strong })}
        </Block>

        <Block title={t("en.s3.title")}>
          <ul className="ml-6 list-disc space-y-1.5">
            <li>{t("en.s3.item1")}</li>
            <li>{t("en.s3.item2")}</li>
            <li>{t("en.s3.item3")}</li>
            <li>{t("en.s3.item4")}</li>
          </ul>
        </Block>

        <Block title={t("en.s4.title")}>
          {t("en.s4.intro")}
          <ul className="ml-6 list-disc space-y-1.5">
            <li>{t("en.s4.item1")}</li>
            <li>{t("en.s4.item2")}</li>
            <li>{t("en.s4.item3")}</li>
            <li>{t("en.s4.item4")}</li>
            <li>{t("en.s4.item5")}</li>
          </ul>
        </Block>

        <Block title={t("en.s5.title")}>
          {t("en.s5.intro")}
          <ul className="ml-6 list-disc space-y-1.5">
            <li>{t("en.s5.item1")}</li>
            <li>{t("en.s5.item2")}</li>
            <li>{t("en.s5.item3")}</li>
            <li>{t("en.s5.item4")}</li>
          </ul>
        </Block>

        <Block title={t("en.s6.title")}>
          {t("en.s6.body")}
        </Block>

        <Block title={t("en.s7.title")}>
          <ul className="ml-6 list-disc space-y-1.5">
            <li>{t("en.s7.item1")}</li>
            <li>{t("en.s7.item2")}</li>
            <li>{t("en.s7.item3")}</li>
          </ul>
        </Block>

        <Block title={t("en.s8.title")}>
          {t.rich("en.s8.body", { deletionLink })}
        </Block>

        <Block title={t("en.s9.title")}>
          {t("en.s9.body")}
        </Block>

        <Block title={t("en.s10.title")}>
          {t("en.s10.body")}
        </Block>

        <Block title={t("en.s11.title")}>
          {t("en.s11.emailLabel")} <a className="text-primary underline-offset-4 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </Block>
      </section>

      <footer className="mt-16 border-t border-border pt-6 text-sm text-muted-foreground">
        <Link href="/privacy" className="underline-offset-4 hover:underline">{t("footer.privacy")}</Link>
        {" · "}
        <Link href="/refund-policy" className="underline-offset-4 hover:underline">{t("footer.refund")}</Link>
        {" · "}
        <Link href="/data-deletion" className="underline-offset-4 hover:underline">{t("footer.deletion")}</Link>
        {" · "}
        <Link href="/" className="underline-offset-4 hover:underline">{t("footer.home")}</Link>
      </footer>
    </main>
    <SiteFooter />
    </>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      <div className="mt-2 text-sm leading-relaxed text-foreground/90">{children}</div>
    </div>
  );
}
