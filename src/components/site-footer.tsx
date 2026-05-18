"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { COMPANY, hasDisplayableTaxId } from "@/lib/company";

/**
 * Site-wide footer with company legal info, contact details, and
 * required policy links. Mount on every public-facing page (landing,
 * login, signup, /privacy, /terms, /refund-policy, /data-deletion,
 * /verify-email, /setup-billing).
 *
 * Omise reviewers verify that:
 *   - legal company name matches DBD registration
 *   - tax ID is displayed
 *   - contact info is reachable
 *   - links to refund/privacy/terms are present from every page
 *
 * Client component so it can render inside both server pages (landing,
 * privacy, terms) and client pages (login, signup). Translations are
 * resolved via the NextIntlClientProvider that wraps the app.
 */
export function SiteFooter() {
  const t = useTranslations("siteFooter");
  const tCompany = useTranslations("company");

  const entityLabel =
    COMPANY.entityType === "JURISTIC"
      ? tCompany("entityLabel.juristic")
      : tCompany("entityLabel.individual");
  const taxIdLabel =
    COMPANY.entityType === "JURISTIC"
      ? t("taxIdLabel.juristic")
      : t("taxIdLabel.individual");
  const legalName = tCompany("legalName");
  const address = tCompany("address");

  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid gap-6 md:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{entityLabel}</p>
            <p className="mt-1 font-semibold text-foreground">
              {COMPANY.showLegalNamePublicly ? legalName : COMPANY.brandName}
            </p>
            <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
              {hasDisplayableTaxId() && (
                <div>
                  <dt className="inline">{taxIdLabel}: </dt>
                  <dd className="inline">{COMPANY.taxId}</dd>
                </div>
              )}
              <div>
                <dt className="inline">{t("addressLabel")}: </dt>
                <dd className="inline">{address}</dd>
              </div>
            </dl>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("contactHeading")}</p>
            <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
              <div>
                <dt className="inline">{t("emailLabel")}: </dt>
                <dd className="inline">
                  <a href={`mailto:${COMPANY.supportEmail}`} className="text-cyan-600 hover:underline">
                    {COMPANY.supportEmail}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="inline">{t("phoneLabel")}: </dt>
                <dd className="inline">{COMPANY.contactPhone}</dd>
              </div>
            </dl>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("policyHeading")}</p>
            <ul className="mt-3 space-y-1 text-xs">
              <li>
                <Link href="/privacy" className="text-muted-foreground hover:text-foreground">
                  {t("links.privacy")}
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-muted-foreground hover:text-foreground">
                  {t("links.terms")}
                </Link>
              </li>
              <li>
                <Link href="/refund-policy" className="text-muted-foreground hover:text-foreground">
                  {t("links.refund")}
                </Link>
              </li>
              <li>
                <Link href="/data-deletion" className="text-muted-foreground hover:text-foreground">
                  {t("links.dataDeletion")}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <p className="mt-8 text-center text-[11px] text-muted-foreground">
          {t("copyright", { year: new Date().getFullYear(), brand: COMPANY.brandName })}
        </p>
      </div>
    </footer>
  );
}
