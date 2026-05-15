"use client";

import Link from "next/link";
import { Camera } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AnalyzeCreativeButton } from "@/components/ads/analyze-creative-button";
import type { CreativeAnalysis } from "@/components/ads/creative-analysis-panel";

export type AdRow = {
  id: string;
  metaAdId: string;
  name: string;
  effectiveStatus: string;
  configuredStatus: string | null;
  adSetName: string;
  campaignName: string;
  accountName: string;
  creativeAnalysis: CreativeAnalysis | null;
  creativeAnalyzedAt: string | null;
};

type Props = {
  tenantSlug: string;
  ads: AdRow[];
  quotaRemaining: number;
  activeStatus: string;
};

const STATUS_TABS: Array<{ value: string; label: string }> = [
  { value: "all", label: "ทั้งหมด" },
  { value: "active", label: "กำลังรัน" },
  { value: "paused", label: "หยุด" },
];

function statusBadge(status: string) {
  switch (status) {
    case "ACTIVE":
      return (
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
          ACTIVE
        </span>
      );
    case "PAUSED":
      return (
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          PAUSED
        </span>
      );
    default:
      return (
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {status}
        </span>
      );
  }
}

export function AdsClient({ tenantSlug, ads, quotaRemaining, activeStatus }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-muted/40 p-1">
          {STATUS_TABS.map((t) => (
            <Link
              key={t.value}
              href={
                t.value === "all"
                  ? `/t/${tenantSlug}/ads`
                  : `/t/${tenantSlug}/ads?status=${t.value}`
              }
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                activeStatus === t.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Camera className="size-3.5" />
          เหลือ {quotaRemaining}/50 ครั้ง วิเคราะห์ภาพวันนี้
        </div>
      </div>

      {ads.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 border-dashed py-12 text-center">
          <p className="text-sm font-medium">ยังไม่มี ad ที่ตรงเงื่อนไข</p>
          <p className="text-xs text-muted-foreground">
            ลองสลับ tab หรือ sync ข้อมูลล่าสุดจาก Meta
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {ads.map((ad) => (
            <Card key={ad.id} className="p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {statusBadge(ad.effectiveStatus)}
                    <p className="truncate text-sm font-medium">{ad.name}</p>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {ad.accountName} · {ad.campaignName} · {ad.adSetName}
                  </p>
                  <p className="text-[10px] text-muted-foreground/70">
                    ad id: {ad.metaAdId}
                  </p>
                </div>
                <div className="shrink-0">
                  <AnalyzeCreativeButton
                    tenantSlug={tenantSlug}
                    adId={ad.metaAdId}
                    initialAnalysis={ad.creativeAnalysis}
                    initialAnalyzedAt={ad.creativeAnalyzedAt}
                    quotaRemaining={quotaRemaining}
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
