import Link from "next/link";

import { COMPANY } from "@/lib/company";

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
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid gap-6 md:grid-cols-3">
          <div>
            <p className="font-semibold text-foreground">{COMPANY.legalNameTh}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{COMPANY.legalNameEn}</p>
            <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
              <div>
                <dt className="inline">เลขผู้เสียภาษี: </dt>
                <dd className="inline">{COMPANY.taxId}</dd>
              </div>
              <div>
                <dt className="inline">ที่อยู่: </dt>
                <dd className="inline">{COMPANY.addressTh}</dd>
              </div>
            </dl>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">ติดต่อ</p>
            <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
              <div>
                <dt className="inline">Email: </dt>
                <dd className="inline">
                  <a href={`mailto:${COMPANY.supportEmail}`} className="text-cyan-600 hover:underline">
                    {COMPANY.supportEmail}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="inline">โทร: </dt>
                <dd className="inline">{COMPANY.contactPhone}</dd>
              </div>
            </dl>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">นโยบาย</p>
            <ul className="mt-3 space-y-1 text-xs">
              <li>
                <Link href="/privacy" className="text-muted-foreground hover:text-foreground">
                  นโยบายความเป็นส่วนตัว (Privacy Policy)
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-muted-foreground hover:text-foreground">
                  ข้อกำหนดการใช้บริการ (Terms of Service)
                </Link>
              </li>
              <li>
                <Link href="/refund-policy" className="text-muted-foreground hover:text-foreground">
                  นโยบายการคืนเงิน (Refund Policy)
                </Link>
              </li>
              <li>
                <Link href="/data-deletion" className="text-muted-foreground hover:text-foreground">
                  การลบข้อมูล (Data Deletion)
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <p className="mt-8 text-center text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} {COMPANY.legalNameTh}. All rights reserved. ระบบชำระเงินผ่าน Omise (PCI DSS Level 1).
        </p>
      </div>
    </footer>
  );
}
