/**
 * Business identity — single source of truth for legal info displayed
 * in footer, refund policy, terms, and KYC documents.
 *
 * Supports both individual (sole proprietor) and juristic (company)
 * registration. Toggle `entityType` when upgrading from sole
 * proprietorship to company.
 *
 * Localized values (legal name, address, entity label) live in
 * messages/{th,en,lo}.json under the `company` namespace and are
 * resolved per-request. This file holds only locale-independent data
 * (tax id, support email, phone, etc.).
 *
 * **YOU MUST EDIT THESE VALUES** before submitting Omise KYC.
 * The legal name on your site must match the name on your Omise
 * merchant profile exactly.
 *
 * After editing, redeploy via `git push`.
 */

import { getTranslations } from "next-intl/server";

import type { Locale } from "@/i18n/locales";

export const COMPANY = {
  /**
   * INDIVIDUAL = sole proprietor (Omise KYC submits ID card)
   * JURISTIC   = company (Omise KYC submits DBD + VAT certificate)
   * Currently set for INDIVIDUAL — switch to JURISTIC after incorporating.
   */
  entityType: "INDIVIDUAL" as "INDIVIDUAL" | "JURISTIC",

  /**
   * If true, the footer + refund-policy page display the legal name.
   * Most Thai individual-merchant SaaS keep this off and show only the
   * brand name + contact info — increases trust without exposing the
   * operator's full name publicly. Omise's KYC doesn't require display
   * of the legal name; they verify it via ID card on file.
   */
  showLegalNamePublicly: false,

  /** Brand name shown everywhere customer-facing */
  brandName: "AdsLab",

  /**
   * 13-digit ID (citizen ID for individuals, tax ID for juristic).
   * Keep `showTaxIdPublicly = false` for individuals — Omise doesn't
   * require this in the public site, and showing your personal ID
   * number is uncomfortable. If you later register as a company, flip
   * this to true.
   */
  taxId: "0000000000000",
  showTaxIdPublicly: false,

  /** Customer-facing support contact */
  supportEmail: "support@ads-lab.xyz",
  contactPhone: "+66 64-904-3497",

  /** Operating website */
  websiteUrl: "https://ads-lab.xyz",

  /** Optional — only relevant when entityType=JURISTIC */
  vatRegistered: false,
} as const;

/** Footer label that adapts to entity type. Resolves per-locale. */
export async function getEntityLabel(locale: Locale): Promise<string> {
  const t = await getTranslations({ locale, namespace: "company.entityLabel" });
  return COMPANY.entityType === "JURISTIC" ? t("juristic") : t("individual");
}

/** Localized legal name (proper noun, transliterated per script). */
export async function getLegalName(locale: Locale): Promise<string> {
  const t = await getTranslations({ locale, namespace: "company" });
  return t("legalName");
}

/** Localized registered/operating address (used in footer for trust). */
export async function getCompanyAddress(locale: Locale): Promise<string> {
  const t = await getTranslations({ locale, namespace: "company" });
  return t("address");
}

/** True if taxId is a real value AND user opted to display it publicly */
export function hasDisplayableTaxId(): boolean {
  const id: string = COMPANY.taxId;
  return COMPANY.showTaxIdPublicly && id !== "0000000000000" && id.length === 13;
}
