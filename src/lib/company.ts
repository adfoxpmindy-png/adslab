/**
 * Company identity — single source of truth for legal info displayed
 * in footer, refund policy, terms, and KYC documents.
 *
 * **YOU MUST EDIT THESE VALUES** before submitting Omise KYC.
 * Omise reviewers verify that the legal name on your site matches
 * the company name on your DBD certificate exactly.
 *
 * After editing, redeploy via `git push`.
 */

export const COMPANY = {
  // Legal name as registered with DBD (Department of Business Development)
  // Example: "บริษัท แอดส์แล็บ จำกัด" / "AdsLab Co., Ltd."
  legalNameTh: "บริษัท แอดส์แล็บ จำกัด",
  legalNameEn: "AdsLab Co., Ltd.",

  // Brand name shown in marketing (can differ from legal name)
  brandName: "AdsLab",

  // 13-digit Thai tax ID (เลขประจำตัวผู้เสียภาษี)
  taxId: "0000000000000",

  // DBD registration number (เลขทะเบียนนิติบุคคล) — usually same as taxId
  dbdRegistrationNumber: "0000000000000",

  // Registered business address (must match DBD certificate)
  addressTh: "ที่อยู่บริษัทตามที่จดทะเบียน",
  addressEn: "Company registered address",

  // Contact for customers + Omise
  supportEmail: "support@adslab.app",
  contactPhone: "+66 X-XXXX-XXXX",

  // Optional: VAT registration (ภ.พ.20)
  vatRegistered: false,
} as const;

/**
 * Convenience: a one-line Thai legal footer string with name + tax ID
 * + address — ready to drop into UI components.
 */
export function companyFooterLineTh(): string {
  return `${COMPANY.legalNameTh} · เลขผู้เสียภาษี ${COMPANY.taxId} · ${COMPANY.addressTh}`;
}

export function companyFooterLineEn(): string {
  return `${COMPANY.legalNameEn} · Tax ID ${COMPANY.taxId} · ${COMPANY.addressEn}`;
}
