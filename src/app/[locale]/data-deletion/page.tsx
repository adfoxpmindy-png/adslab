import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SiteFooter } from "@/components/site-footer";
import { COMPANY } from "@/lib/company";

const CONTACT_EMAIL = COMPANY.supportEmail;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pages.dataDeletion");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function DataDeletionPage() {
  const t = await getTranslations("pages.dataDeletion");
  const email = () => (
    <a
      className="text-primary underline-offset-4 hover:underline"
      href={`mailto:${CONTACT_EMAIL}?subject=Data%20Deletion%20Request`}
    >
      {CONTACT_EMAIL}
    </a>
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
        <p className="mt-3 text-sm text-muted-foreground">{t("intro")}</p>
      </header>

      {/* Thai */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold tracking-tight">{t("thaiHeading")}</h2>

        <Block title={t("th.s1.title")}>
          {t("th.s1.intro")}
          <ol className="ml-6 mt-2 list-decimal space-y-1.5">
            <li>{t("th.s1.step1")}</li>
            <li dangerouslySetInnerHTML={{ __html: t.raw("th.s1.step2") }} />
            <li dangerouslySetInnerHTML={{ __html: t.raw("th.s1.step3") }} />
            <li>{t("th.s1.step4")}</li>
          </ol>
          <p className="mt-3 text-sm text-muted-foreground">{t("th.s1.timing")}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            <em>{t("th.s1.note")}</em>
          </p>
        </Block>

        <Block title={t("th.s2.title")}>
          {t.rich("th.s2.intro", { email })}
          <ul className="ml-6 mt-2 list-disc space-y-1.5">
            <li>{t("th.s2.item1")}</li>
            <li>{t("th.s2.item2")}</li>
            <li>{t("th.s2.item3")}</li>
          </ul>
          <p className="mt-3 text-sm">{t("th.s2.ack")}</p>
        </Block>

        <Block title={t("th.s3.title")}>
          {t("th.s3.body")}
        </Block>

        <Block title={t("th.s4.title")}>
          <ul className="ml-6 list-disc space-y-1.5">
            <li>{t("th.s4.item1")}</li>
            <li>{t("th.s4.item2")}</li>
            <li>{t("th.s4.item3")}</li>
            <li>{t("th.s4.item4")}</li>
            <li>{t("th.s4.item5")}</li>
          </ul>
          <p className="mt-3" dangerouslySetInnerHTML={{ __html: t.raw("th.s4.retained") }} />
        </Block>
      </section>

      <hr className="my-12 border-border" />

      {/* English */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold tracking-tight">{t("englishHeading")}</h2>

        <Block title={t("en.s1.title")}>
          {t("en.s1.intro")}
          <ol className="ml-6 mt-2 list-decimal space-y-1.5">
            <li>{t("en.s1.step1")}</li>
            <li dangerouslySetInnerHTML={{ __html: t.raw("en.s1.step2") }} />
            <li dangerouslySetInnerHTML={{ __html: t.raw("en.s1.step3") }} />
            <li>{t("en.s1.step4")}</li>
          </ol>
          <p className="mt-3 text-sm text-muted-foreground">{t("en.s1.timing")}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            <em>{t("en.s1.note")}</em>
          </p>
        </Block>

        <Block title={t("en.s2.title")}>
          {t.rich("en.s2.intro", { email })}
          <ul className="ml-6 mt-2 list-disc space-y-1.5">
            <li>{t("en.s2.item1")}</li>
            <li>{t("en.s2.item2")}</li>
            <li>{t("en.s2.item3")}</li>
          </ul>
          <p className="mt-3 text-sm">{t("en.s2.ack")}</p>
        </Block>

        <Block title={t("en.s3.title")}>
          {t("en.s3.body")}
        </Block>

        <Block title={t("en.s4.title")}>
          <ul className="ml-6 list-disc space-y-1.5">
            <li>{t("en.s4.item1")}</li>
            <li>{t("en.s4.item2")}</li>
            <li>{t("en.s4.item3")}</li>
            <li>{t("en.s4.item4")}</li>
            <li>{t("en.s4.item5")}</li>
          </ul>
          <p className="mt-3" dangerouslySetInnerHTML={{ __html: t.raw("en.s4.retained") }} />
        </Block>
      </section>

      <footer className="mt-16 border-t border-border pt-6 text-sm text-muted-foreground">
        <Link href="/privacy" className="underline-offset-4 hover:underline">{t("footer.privacy")}</Link>
        {" · "}
        <Link href="/terms" className="underline-offset-4 hover:underline">{t("footer.terms")}</Link>
        {" · "}
        <Link href="/refund-policy" className="underline-offset-4 hover:underline">{t("footer.refund")}</Link>
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
