"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Target, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DISMISS_KEY_PREFIX = "adslab:scope-banner-dismissed:";

/**
 * Dashboard banner that nudges the OWNER to set Tenant Scope. We only
 * render it when scope is fully empty (no accounts/campaigns/patterns)
 * AND the user hasn't dismissed it from this browser. Dismissal is
 * client-side only — re-appears if the user clears localStorage or
 * uses another device, which is fine for a "discover this feature"
 * prompt rather than a permanent toggle.
 */
export function ScopePromptBanner({ tenantSlug }: { tenantSlug: string }) {
  const key = `${DISMISS_KEY_PREFIX}${tenantSlug}`;
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(key) === "1";
  });

  if (dismissed) return null;

  function dismiss() {
    localStorage.setItem(key, "1");
    setDismissed(true);
  }

  return (
    <Card className="flex items-start gap-3 border-primary/30 bg-primary/5 p-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
        <Target className="size-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-medium">
          ตั้งค่า Tenant Scope เพื่อโฟกัสเฉพาะ accounts/campaigns ที่ใช้
        </p>
        <p className="text-xs text-muted-foreground">
          ตอนนี้ดูทุก ad account ของ Business Manager ที่เชื่อมไว้ —
          ตั้ง scope ได้เพื่อให้ Dashboard, Reports, และ AI Report
          วิเคราะห์เฉพาะ scope ที่กำหนด
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Link
          href={`/t/${tenantSlug}/settings/integrations`}
          className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
        >
          ตั้งค่าตอนนี้
          <ArrowRight className="size-3.5" />
        </Link>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={dismiss}
          title="ซ่อน"
        >
          <X className="size-4" />
        </Button>
      </div>
    </Card>
  );
}
