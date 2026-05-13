"use client";

import Link from "next/link";
import { AlertCircle, Clock, CreditCard } from "lucide-react";

type Props = {
  status: "TRIALING" | "ACTIVE" | "PAST_DUE";
  planName: string;
  trialEndsAt: Date | null;
  tenantSlug: string;
};

export function TierLimitBanner({ status, planName, trialEndsAt, tenantSlug }: Props) {
  const billingHref = `/t/${tenantSlug}/settings/billing`;

  if (status === "PAST_DUE") {
    return (
      <div className="border-b border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30">
        <div className="mx-auto flex max-w-screen-2xl items-center gap-3 px-6 py-2.5 text-sm">
          <AlertCircle className="size-4 shrink-0 text-red-600 dark:text-red-400" />
          <p className="flex-1 text-red-900 dark:text-red-100">
            การชำระเงินล่าสุดไม่สำเร็จ — กรุณาอัปเดตบัตรภายใน 3 วัน
          </p>
          <Link
            href={billingHref}
            className="rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700"
          >
            อัปเดตบัตร
          </Link>
        </div>
      </div>
    );
  }

  if (status === "TRIALING" && trialEndsAt) {
    const days = Math.ceil(
      (new Date(trialEndsAt).getTime() - Date.now()) / (24 * 3600 * 1000),
    );
    if (days <= 2) {
      const dateStr = new Date(trialEndsAt).toLocaleDateString("th-TH", {
        day: "numeric",
        month: "long",
      });
      return (
        <div className="border-b border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30">
          <div className="mx-auto flex max-w-screen-2xl items-center gap-3 px-6 py-2.5 text-sm">
            <Clock className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="flex-1 text-amber-900 dark:text-amber-100">
              ทดลองใช้ AdsLab เหลือ <b>{days}</b> วัน — เริ่มเก็บเงิน {dateStr} ตามแพ็กเกจ <b>{planName}</b>
            </p>
            <Link
              href={billingHref}
              className="rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700"
            >
              จัดการ
            </Link>
          </div>
        </div>
      );
    }
    if (days <= 7) {
      return (
        <div className="border-b border-cyan-100 bg-cyan-50 dark:border-cyan-900/40 dark:bg-cyan-950/20">
          <div className="mx-auto flex max-w-screen-2xl items-center gap-3 px-6 py-2 text-sm">
            <CreditCard className="size-4 shrink-0 text-cyan-600 dark:text-cyan-400" />
            <p className="flex-1 text-cyan-900 dark:text-cyan-100">
              คุณกำลังทดลองใช้ AdsLab — เหลือ {days} วัน
            </p>
            <Link
              href={billingHref}
              className="text-xs font-medium text-cyan-700 hover:underline dark:text-cyan-300"
            >
              ดูแพ็กเกจ →
            </Link>
          </div>
        </div>
      );
    }
  }

  return null;
}
