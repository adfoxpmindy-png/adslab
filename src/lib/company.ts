/**
 * Business identity — single source of truth for legal info displayed
 * in footer, refund policy, terms, and KYC documents.
 *
 * Supports both individual (บุคคลธรรมดา) and juristic (นิติบุคคล)
 * registration. Toggle `entityType` when upgrading from sole
 * proprietorship to company.
 *
 * **YOU MUST EDIT THESE VALUES** before submitting Omise KYC.
 * The legal name on your site must match the name on your Omise
 * merchant profile exactly.
 *
 * After editing, redeploy via `git push`.
 */

export const COMPANY = {
  /**
   * INDIVIDUAL = sole proprietor / บุคคลธรรมดา (Omise KYC submits ID card)
   * JURISTIC   = company / นิติบุคคล (Omise KYC submits DBD + ภพ.20)
   * Currently set for INDIVIDUAL — switch to JURISTIC after incorporating.
   */
  entityType: "INDIVIDUAL" as "INDIVIDUAL" | "JURISTIC",

  /**
   * Legal name as submitted to Omise. Used internally (receipts, KYC
   * records) — NOT shown publicly unless `showLegalNamePublicly` = true.
   */
  legalNameTh: "นภดล รัตนน้ำอ้อม",
  legalNameEn: "Nopphadon Rattananam-om",

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
   * 13-digit ID (เลขบัตรประชาชน for individuals, เลขผู้เสียภาษี for
   * juristic). Keep `showTaxIdPublicly = false` for individuals — Omise
   * doesn't require this in the public site, and showing your personal
   * ID number is uncomfortable. If you later register as a company,
   * flip this to true.
   */
  taxId: "0000000000000",
  showTaxIdPublicly: false,

  /** Registered / operating address — shown in footer for trust */
  addressTh: "8/26 ถนนวิภาวดีรังสิต ซอยวิภาวดีรังสิต 22 แขวงจอมพล เขตจตุจักร กรุงเทพฯ 10900",
  addressEn: "8/26 Vibhavadi Rangsit Rd., Soi Vibhavadi Rangsit 22, Chom Phon, Chatuchak, Bangkok 10900",

  /** Customer-facing support contact */
  supportEmail: "support@ads-lab.xyz",
  contactPhone: "+66 64-904-3497",

  /** Operating website */
  websiteUrl: "https://ads-lab.xyz",

  /** Optional — only relevant when entityType=JURISTIC */
  vatRegistered: false,
} as const;

/** Footer label that adapts to entity type */
export function entityLabelTh(): string {
  return COMPANY.entityType === "JURISTIC" ? "ดำเนินการโดย" : "ผู้ให้บริการ";
}

/** True if taxId is a real value AND user opted to display it publicly */
export function hasDisplayableTaxId(): boolean {
  const id: string = COMPANY.taxId;
  return COMPANY.showTaxIdPublicly && id !== "0000000000000" && id.length === 13;
}
