import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SiteFooter } from "@/components/site-footer";
import { COMPANY } from "@/lib/company";

const LAST_UPDATED = "2026-05-11";
const CONTACT_EMAIL = COMPANY.supportEmail;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pages.privacy");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function PrivacyPage() {
  const t = await getTranslations("pages.privacy");
  const deletionLink = (chunks: React.ReactNode) => (
    <Link className="text-primary underline-offset-4 hover:underline" href="/data-deletion">
      {chunks}
    </Link>
  );

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

      {/* ============== Thai version (primary market) ============== */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold tracking-tight">{t("thaiHeading")}</h2>

        <Block title={t("th.s1.title")}>
          {t("th.s1.body")}
        </Block>

        <Block title={t("th.s2.title")}>
          <ul className="ml-6 list-disc space-y-1.5">
            <li dangerouslySetInnerHTML={{ __html: t.raw("th.s2.item1") }} />
            <li dangerouslySetInnerHTML={{ __html: t.raw("th.s2.item2") }} />
            <li dangerouslySetInnerHTML={{ __html: t.raw("th.s2.item3") }} />
            <li dangerouslySetInnerHTML={{ __html: t.raw("th.s2.item4") }} />
            <li dangerouslySetInnerHTML={{ __html: t.raw("th.s2.item5") }} />
          </ul>
        </Block>

        <Block title={t("th.s3.title")}>
          <ul className="ml-6 list-disc space-y-1.5">
            <li>{t("th.s3.item1")}</li>
            <li>{t("th.s3.item2")}</li>
            <li>{t("th.s3.item3")}</li>
            <li>{t("th.s3.item4")}</li>
          </ul>
          <p className="mt-3" dangerouslySetInnerHTML={{ __html: t.raw("th.s3.doNot") }} />
        </Block>

        <Block title={t("th.s4.title")}>
          <ul className="ml-6 list-disc space-y-1.5">
            <li dangerouslySetInnerHTML={{ __html: t.raw("th.s4.item1") }} />
            <li dangerouslySetInnerHTML={{ __html: t.raw("th.s4.item2") }} />
            <li dangerouslySetInnerHTML={{ __html: t.raw("th.s4.item3") }} />
            <li dangerouslySetInnerHTML={{ __html: t.raw("th.s4.item4") }} />
            <li dangerouslySetInnerHTML={{ __html: t.raw("th.s4.item5") }} />
            <li dangerouslySetInnerHTML={{ __html: t.raw("th.s4.item6") }} />
          </ul>
        </Block>

        <Block title={t("th.s5.title")}>
          <ul className="ml-6 list-disc space-y-1.5">
            <li>{t("th.s5.item1")}</li>
            <li>{t("th.s5.item2")}</li>
            <li>{t("th.s5.item3")}</li>
            <li>{t("th.s5.item4")}</li>
          </ul>
        </Block>

        <Block title={t("th.s6.title")}>
          <p>{t("th.s6.intro")}</p>
          <ul className="ml-6 list-disc space-y-1.5">
            <li>{t("th.s6.item1")}</li>
            <li>{t("th.s6.item2")}</li>
            <li>{t.rich("th.s6.item3", { deletionLink })}</li>
            <li>{t("th.s6.item4")}</li>
            <li>{t("th.s6.item5")}</li>
            <li>{t("th.s6.item6")}</li>
          </ul>
          <p className="mt-3">
            {t("th.s6.contactLabel")}{" "}
            <a className="text-primary underline-offset-4 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </p>
        </Block>

        <Block title={t("th.s7.title")}>
          <ul className="ml-6 list-disc space-y-1.5">
            <li>{t("th.s7.item1")}</li>
            <li>{t("th.s7.item2")}</li>
            <li>{t("th.s7.item3")}</li>
            <li>{t("th.s7.item4")}</li>
          </ul>
        </Block>

        <Block title={t("th.s8.title")}>
          {t("th.s8.body")}
        </Block>

        <Block title={t("th.s9.title")}>
          {t("th.s9.emailLabel")} <a className="text-primary underline-offset-4 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </Block>
      </section>

      <hr className="my-12 border-border" />

      {/* ============== English version (for Meta reviewers + intl users) ============== */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold tracking-tight">{t("englishHeading")}</h2>

        <Block title={t("en.s1.title")}>
          {t("en.s1.body")}
        </Block>

        <Block title={t("en.s2.title")}>
          <ul className="ml-6 list-disc space-y-1.5">
            <li dangerouslySetInnerHTML={{ __html: t.raw("en.s2.item1") }} />
            <li dangerouslySetInnerHTML={{ __html: t.raw("en.s2.item2") }} />
            <li dangerouslySetInnerHTML={{ __html: t.raw("en.s2.item3") }} />
            <li dangerouslySetInnerHTML={{ __html: t.raw("en.s2.item4") }} />
            <li dangerouslySetInnerHTML={{ __html: t.raw("en.s2.item5") }} />
          </ul>
        </Block>

        <Block title={t("en.s3.title")}>
          <ul className="ml-6 list-disc space-y-1.5">
            <li>{t("en.s3.item1")}</li>
            <li>{t("en.s3.item2")}</li>
            <li>{t("en.s3.item3")}</li>
            <li>{t("en.s3.item4")}</li>
          </ul>
          <p className="mt-3" dangerouslySetInnerHTML={{ __html: t.raw("en.s3.doNot") }} />
        </Block>

        <Block title={t("en.s4.title")}>
          <ul className="ml-6 list-disc space-y-1.5">
            <li dangerouslySetInnerHTML={{ __html: t.raw("en.s4.item1") }} />
            <li dangerouslySetInnerHTML={{ __html: t.raw("en.s4.item2") }} />
            <li dangerouslySetInnerHTML={{ __html: t.raw("en.s4.item3") }} />
            <li dangerouslySetInnerHTML={{ __html: t.raw("en.s4.item4") }} />
            <li dangerouslySetInnerHTML={{ __html: t.raw("en.s4.item5") }} />
            <li dangerouslySetInnerHTML={{ __html: t.raw("en.s4.item6") }} />
          </ul>
        </Block>

        <Block title={t("en.s5.title")}>
          <ul className="ml-6 list-disc space-y-1.5">
            <li>{t("en.s5.item1")}</li>
            <li>{t("en.s5.item2")}</li>
            <li>{t("en.s5.item3")}</li>
            <li>{t("en.s5.item4")}</li>
          </ul>
        </Block>

        <Block title={t("en.s6.title")}>
          <p>{t("en.s6.intro")}</p>
          <ul className="ml-6 list-disc space-y-1.5">
            <li>{t("en.s6.item1")}</li>
            <li>{t("en.s6.item2")}</li>
            <li>{t.rich("en.s6.item3", { deletionLink })}</li>
            <li>{t("en.s6.item4")}</li>
            <li>{t("en.s6.item5")}</li>
            <li>{t("en.s6.item6")}</li>
          </ul>
          <p className="mt-3">
            {t("en.s6.contactLabel")}{" "}
            <a className="text-primary underline-offset-4 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </p>
        </Block>

        <Block title={t("en.s7.title")}>
          <ul className="ml-6 list-disc space-y-1.5">
            <li>{t("en.s7.item1")}</li>
            <li>{t("en.s7.item2")}</li>
            <li>{t("en.s7.item3")}</li>
            <li>{t("en.s7.item4")}</li>
          </ul>
        </Block>

        <Block title={t("en.s8.title")}>
          {t("en.s8.body")}
        </Block>

        <Block title={t("en.s9.title")}>
          {t("en.s9.emailLabel")} <a className="text-primary underline-offset-4 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </Block>
      </section>

      <footer className="mt-16 border-t border-border pt-6 text-sm text-muted-foreground">
        <Link href="/terms" className="underline-offset-4 hover:underline">{t("footer.terms")}</Link>
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
