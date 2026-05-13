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
   * Legal name as shown on Omise merchant profile.
   * For INDIVIDUAL: full Thai name e.g. "นาย สมชาย ใจดี"
   * For JURISTIC:   company name e.g. "บริษัท แอดส์แล็บ จำกัด"
   */
  legalNameTh: "นาย ชื่อ นามสกุล",
  legalNameEn: "Mr./Ms. Name Surname",

  /** Brand name shown in marketing — can differ from legal name */
  brandName: "AdsLab",

  /**
   * For INDIVIDUAL: 13-digit National ID (เลขบัตรประชาชน)
   *                 — also serves as personal tax ID
   * For JURISTIC:   13-digit company tax ID (เลขผู้เสียภาษีนิติบุคคล)
   *
   * Note: it's conventional in Thailand to show this on receipts. If
   * you'd rather not display it publicly while registered as individual,
   * leave as "0000000000000" and the footer will hide the line.
   */
  taxId: "0000000000000",

  /**
   * Registered address. For INDIVIDUAL = address on national ID card
   * (or your operating address if different). For JURISTIC = DBD
   * registered head office.
   */
  addressTh: "ที่อยู่ดำเนินการ",
  addressEn: "Business address",

  /** Customer-facing support contact */
  supportEmail: "support@adslab.app",
  contactPhone: "+66 X-XXXX-XXXX",

  /** Optional — only relevant when entityType=JURISTIC */
  vatRegistered: false,
} as const;

/** Footer label that adapts to entity type */
export function entityLabelTh(): string {
  return COMPANY.entityType === "JURISTIC" ? "ดำเนินการโดย" : "ผู้ให้บริการ";
}

/** True if taxId is a real value (not the placeholder) */
export function hasRealTaxId(): boolean {
  const id: string = COMPANY.taxId;
  return id !== "0000000000000" && id.length === 13;
}
