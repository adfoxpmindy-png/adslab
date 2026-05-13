"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, X, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Step = {
  id: string;
  label: string;
  description: string;
  done: boolean;
  href: string;
  ctaLabel: string;
};

const DISMISS_KEY_PREFIX = "adslab:onboarding-dismissed:";

/**
 * 4-step checklist that meets the new user on the Dashboard. We don't
 * gate the app on it (no full-screen wizard) — instead we surface a
 * persistent collapsible card that completes progressively as the user
 * connects Meta, scopes the tenant, adds a naming template, and ships
 * their first campaign. Dismissed state is per-tenant in localStorage
 * so a user who's intentionally on a partial setup isn't pestered.
 */
export function OnboardingChecklist({
  tenantSlug,
  metaConnected,
  scopeSet,
  hasNamingTemplate,
  hasCampaign,
}: {
  tenantSlug: string;
  metaConnected: boolean;
  scopeSet: boolean;
  hasNamingTemplate: boolean;
  hasCampaign: boolean;
}) {
  const dismissKey = `${DISMISS_KEY_PREFIX}${tenantSlug}`;
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(dismissKey) === "1";
  });
  const [expanded, setExpanded] = useState(true);

  const steps: Step[] = [
    {
      id: "meta",
      label: "เชื่อมต่อ Meta Business Manager",
      description: "OAuth กับ Facebook เพื่อให้ AdsLab อ่านข้อมูล + จัดการ ads",
      done: metaConnected,
      href: `/t/${tenantSlug}/settings/integrations?tab=integrations`,
      ctaLabel: "เชื่อมเลย",
    },
    {
      id: "scope",
      label: "เลือก ad accounts ที่ tenant นี้ดูแล",
      description: "แทนที่จะดูทุก account ใน BM — เลือกเฉพาะที่เกี่ยวข้อง",
      done: scopeSet,
      href: `/t/${tenantSlug}/settings/integrations?tab=scope`,
      ctaLabel: "ตั้ง Scope",
    },
    {
      id: "naming",
      label: "กำหนด Naming Convention",
      description: "AdsLab จะแนะนำชื่อตามมาตรฐานที่ตั้งไว้ + auto-pin เข้า scope",
      done: hasNamingTemplate,
      href: `/t/${tenantSlug}/settings/integrations?tab=naming`,
      ctaLabel: "ตั้ง Template",
    },
    {
      id: "campaign",
      label: "สร้าง Campaign แรก",
      description: "ใช้ Campaign Builder — Smart Name Field + AI suggestions",
      done: hasCampaign,
      href: `/t/${tenantSlug}/campaigns/new`,
      ctaLabel: "สร้าง Campaign",
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const total = steps.length;
  const allDone = doneCount === total;

  // Auto-hide when everything is done (user can re-enable by clearing
  // localStorage if needed, but at that point there's nothing to nudge).
  if (allDone || dismissed) return null;

  function dismiss() {
    localStorage.setItem(dismissKey, "1");
    setDismissed(true);
  }

  return (
    <Card className="space-y-3 border-primary/30 bg-primary/5 p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <Zap className="size-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">
              เริ่มต้นใช้งาน AdsLab —{" "}
              <span className="tabular-nums text-primary">
                {doneCount}/{total}
              </span>{" "}
              เสร็จแล้ว
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                title={expanded ? "ย่อ" : "ขยาย"}
              >
                <ChevronDown
                  className={cn(
                    "size-4 transition-transform",
                    expanded && "rotate-180",
                  )}
                />
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                title="ซ่อนตลอดไป"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            ทำตามขั้นตอนข้างล่างเพื่อเริ่ม run แคมเปญแรกได้ใน ~5 นาที
          </p>
        </div>
      </div>

      {expanded && (
        <ul className="space-y-1.5">
          {steps.map((step, idx) => (
            <li
              key={step.id}
              className={cn(
                "flex items-center gap-3 rounded-md border bg-background px-3 py-2",
                step.done ? "border-emerald-200 dark:border-emerald-900/50" : "border-border",
              )}
            >
              <div
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums",
                  step.done
                    ? "bg-emerald-500 text-white"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {step.done ? <Check className="size-3.5" strokeWidth={3} /> : idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "truncate text-sm font-medium",
                    step.done && "text-muted-foreground line-through",
                  )}
                >
                  {step.label}
                </p>
                {!step.done && (
                  <p className="truncate text-[11px] text-muted-foreground">
                    {step.description}
                  </p>
                )}
              </div>
              {!step.done && (
                <Link
                  href={step.href}
                  className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {step.ctaLabel}
                  <ArrowRight className="size-3" />
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
