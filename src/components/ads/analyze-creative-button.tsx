"use client";

import { useState, useTransition } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  analyzeAdCreativeAction,
  type AnalyzeCreativeActionResult,
} from "@/app/t/[tenantSlug]/ads/_actions/analyze-creative";
import {
  CreativeAnalysisPanel,
  type CreativeAnalysis,
} from "./creative-analysis-panel";

type Props = {
  tenantSlug: string;
  adId: string;
  initialAnalysis: CreativeAnalysis | null;
  initialAnalyzedAt: string | null;
  quotaRemaining: number;
};

export function AnalyzeCreativeButton({
  tenantSlug,
  adId,
  initialAnalysis,
  initialAnalyzedAt,
  quotaRemaining: initialQuota,
}: Props) {
  const [analysis, setAnalysis] = useState<CreativeAnalysis | null>(
    initialAnalysis,
  );
  const [cachedAt, setCachedAt] = useState<string | null>(initialAnalyzedAt);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [quotaRemaining, setQuotaRemaining] = useState(initialQuota);

  const quotaLow = quotaRemaining > 0 && quotaRemaining <= 5;
  const quotaOut = quotaRemaining <= 0;

  function handleClick() {
    // Cache-hit: just toggle the panel, no API call.
    if (analysis && !pending) {
      setOpen((v) => !v);
      return;
    }
    if (quotaOut) {
      toast.info("วันนี้ใช้ครบ quota แล้ว — เริ่มใหม่ 00:00 UTC (07:00 ประเทศไทย)");
      return;
    }
    startTransition(async () => {
      let result: AnalyzeCreativeActionResult;
      try {
        result = await analyzeAdCreativeAction(tenantSlug, adId);
      } catch (err) {
        toast.error("เรียก AI ไม่สำเร็จ", {
          description: (err as Error).message,
        });
        return;
      }
      if (!result.ok) {
        const msg = friendlyError(result.error, result.message);
        toast.error(msg);
        return;
      }
      setAnalysis(result.analysis as CreativeAnalysis);
      setCachedAt(result.cachedAt ?? new Date().toISOString());
      setOpen(true);
      if (!result.cached) {
        setQuotaRemaining((q) => Math.max(0, q - 1));
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={analysis ? "secondary" : "outline"}
          disabled={pending || (quotaOut && !analysis)}
          onClick={handleClick}
          className="gap-1.5"
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Camera className="size-3.5" />
          )}
          {analysis ? (open ? "ปิดผลวิเคราะห์" : "ดูผลวิเคราะห์") : "วิเคราะห์ภาพด้วย AI"}
        </Button>
        {!analysis && (
          <span
            className={cn(
              "text-[11px]",
              quotaOut
                ? "text-rose-500"
                : quotaLow
                  ? "text-amber-500"
                  : "text-muted-foreground",
            )}
          >
            เหลือ {quotaRemaining}/50 ครั้งวันนี้
          </span>
        )}
      </div>

      {open && analysis && (
        <CreativeAnalysisPanel analysis={analysis} cachedAt={cachedAt ?? undefined} />
      )}
    </div>
  );
}

function friendlyError(code: string, message?: string): string {
  switch (code) {
    case "quota_exceeded":
      return "วันนี้ใช้ครบ quota แล้ว — เริ่มใหม่ 00:00 UTC";
    case "no_meta_connection":
      return "ยังไม่ได้เชื่อมต่อ Meta";
    case "no_visual_asset":
      return "ad นี้ไม่มีรูป/วิดีโอให้วิเคราะห์";
    case "fetch_creative_failed":
      return `ดึงรูปจาก Meta ไม่สำเร็จ${message ? ` (${message})` : ""}`;
    case "vision_call_failed":
      return `Vision AI ตอบไม่สำเร็จ${message ? ` (${message})` : ""}`;
    case "openrouter_key_missing":
      return "ระบบยังไม่ได้ตั้งค่า OpenRouter key";
    default:
      return message ?? "เกิดข้อผิดพลาดที่ไม่รู้จัก";
  }
}
