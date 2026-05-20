"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/routing";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  DollarSign,
  Pause,
  Play,
  Sparkles,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  OutcomeBadgeView,
  ConfidenceBadgeView,
} from "@/components/tenant/ai-result-badges";
import type { OutcomeBadge } from "@/lib/reports/enrich-suggestions";
import type { ConfidenceResult } from "@/lib/ai/recommendation-stats";

type Suggestion = {
  id: string;
  internalCampaignId: string;
  metaCampaignId: string;
  campaignName: string;
  action: "PAUSE" | "RESUME" | "SET_BUDGET" | "SET_END_DATE" | "DUPLICATE";
  params?: {
    dailyBudget?: number;
    lifetimeBudget?: number;
    endTime?: string;
    newName?: string;
    dailyBudgetMultiplier?: number;
    lifetimeBudgetMultiplier?: number;
    initialStatus?: "PAUSED" | "ACTIVE";
  };
  reason: string;
  status: "pending" | "applied" | "dismissed";
  appliedLogId?: string;
  errorMessage?: string;
  newCampaignName?: string;
  outcomeBadge?: OutcomeBadge | null;
  confidenceBadge?: ConfidenceResult | null;
};

type Props = {
  tenantSlug: string;
  reportId: string;
  suggestions: Suggestion[];
  canApply: boolean;
};

const ACTION_ICON: Record<Suggestion["action"], React.ComponentType<{ className?: string }>> = {
  PAUSE: Pause,
  RESUME: Play,
  SET_BUDGET: DollarSign,
  SET_END_DATE: CalendarClock,
  DUPLICATE: Copy,
};

const ACTION_LABEL_KEY: Record<Suggestion["action"], string> = {
  PAUSE: "actionPause",
  RESUME: "actionResume",
  SET_BUDGET: "actionSetBudget",
  SET_END_DATE: "actionSetEndDate",
  DUPLICATE: "actionDuplicate",
};

const LOCALE_MAP: Record<string, string> = {
  th: "th-TH",
  en: "en-US",
  lo: "lo-LA",
};

export function ReportActionsPanel({
  tenantSlug,
  reportId,
  suggestions: initial,
  canApply,
}: Props) {
  const t = useTranslations("pages.reports.actionsPanel");
  const locale = useLocale();
  const intlLocale = LOCALE_MAP[locale] ?? "en-US";
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [suggestions, setSuggestions] = useState<Suggestion[]>(initial);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(false);

  const pending = suggestions.filter((s) => s.status === "pending");
  const applied = suggestions.filter((s) => s.status === "applied");
  const dismissed = suggestions.filter((s) => s.status === "dismissed");

  function describeParams(s: Suggestion): string {
    if (s.action === "SET_BUDGET") {
      if (s.params?.dailyBudget !== undefined) {
        return t("paramSetBudgetDaily", { amount: s.params.dailyBudget.toLocaleString(intlLocale) });
      }
      if (s.params?.lifetimeBudget !== undefined) {
        return t("paramSetBudgetLifetime", { amount: s.params.lifetimeBudget.toLocaleString(intlLocale) });
      }
    }
    if (s.action === "SET_END_DATE" && s.params?.endTime) {
      return t("paramSetEndDate", { when: new Date(s.params.endTime).toLocaleString(intlLocale) });
    }
    if (s.action === "DUPLICATE") {
      const bits: string[] = [];
      if (s.params?.dailyBudgetMultiplier) bits.push(t("paramDailyBudgetMultiplier", { value: s.params.dailyBudgetMultiplier }));
      if (s.params?.lifetimeBudgetMultiplier) bits.push(t("paramLifetimeBudgetMultiplier", { value: s.params.lifetimeBudgetMultiplier }));
      if (s.params?.dailyBudget) bits.push(`฿${s.params.dailyBudget}/day`);
      if (s.params?.lifetimeBudget) bits.push(`฿${s.params.lifetimeBudget} lifetime`);
      if (s.params?.initialStatus === "ACTIVE") bits.push(t("paramActiveImmediately"));
      return bits.length > 0 ? `(${bits.join(", ")})` : "";
    }
    return "";
  }

  async function callApi(suggestionId: string, decision: "apply" | "dismiss") {
    if (busy.has(suggestionId)) return;
    setBusy((prev) => new Set(prev).add(suggestionId));
    const toastId = toast.loading(decision === "apply" ? t("doing") : t("skipping"));
    try {
      const res = await fetch(`/api/reports/suggestion?tenantSlug=${tenantSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, suggestionId, decision }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Still update local state if the server returned the updated suggestion
        if (data.suggestion) {
          setSuggestions((prev) =>
            prev.map((s) => (s.id === suggestionId ? (data.suggestion as Suggestion) : s)),
          );
        }
        throw new Error(typeof data.error === "string" ? data.error : t("failed"));
      }
      setSuggestions((prev) =>
        prev.map((s) => (s.id === suggestionId ? (data.suggestion as Suggestion) : s)),
      );
      toast.success(decision === "apply" ? t("done") : t("skipped"), {
        id: toastId,
        duration: 2500,
      });
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failed"), {
        id: toastId,
        duration: 5000,
      });
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(suggestionId);
        return next;
      });
    }
  }

  async function applyOne(s: Suggestion) {
    if (!confirm(t("confirmAction", { action: t(ACTION_LABEL_KEY[s.action] as Parameters<typeof t>[0]), name: s.campaignName }))) return;
    await callApi(s.id, "apply");
  }

  return (
    <Card className="border-primary/30 bg-primary/5 p-0 dark:bg-primary/10">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-3 text-left"
      >
        <Sparkles className="size-4 text-primary" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{t("title")}</p>
          <p className="text-xs text-muted-foreground">
            {t("stats", { pending: pending.length, applied: applied.length, dismissed: dismissed.length })}
          </p>
        </div>
        {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
      </button>

      {!collapsed && (
        <ul className="divide-y divide-border/60 border-t border-border/60">
          {[...pending, ...applied, ...dismissed].map((s) => {
            const Icon = ACTION_ICON[s.action];
            const isBusy = busy.has(s.id);
            const isDismissed = s.status === "dismissed";
            const isApplied = s.status === "applied";

            return (
              <li
                key={s.id}
                id={`action-${s.id}`}
                className={cn(
                  "grid grid-cols-1 gap-3 px-5 py-3 sm:grid-cols-[auto_1fr_auto] sm:items-center",
                  isDismissed && "opacity-50",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Icon className="size-4 text-primary" />
                  <span className="text-xs font-medium uppercase tracking-wide">
                    {t(ACTION_LABEL_KEY[s.action] as Parameters<typeof t>[0])}
                  </span>
                  {isApplied && (
                    <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] uppercase text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                      {t("applied")}
                    </span>
                  )}
                  {isDismissed && (
                    <span className="rounded-md bg-zinc-200 px-1.5 py-0.5 text-[10px] uppercase text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {t("dismissed")}
                    </span>
                  )}
                  {s.outcomeBadge && <OutcomeBadgeView badge={s.outcomeBadge} />}
                  {s.confidenceBadge && !s.outcomeBadge && (
                    <ConfidenceBadgeView result={s.confidenceBadge} />
                  )}
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={s.campaignName}>
                    {s.campaignName}{" "}
                    <span className="font-normal text-muted-foreground">{describeParams(s)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{s.reason}</p>
                  {s.errorMessage && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-rose-600 dark:text-rose-300">
                      <AlertTriangle className="size-3 shrink-0" />
                      <span>{s.errorMessage}</span>
                    </p>
                  )}
                </div>

                {canApply && !isApplied && !isDismissed && (
                  <div className="flex gap-1">
                    <Button size="sm" disabled={isBusy} onClick={() => applyOne(s)} className="gap-1.5">
                      <Check className="size-3" />
                      {t(ACTION_LABEL_KEY[s.action] as Parameters<typeof t>[0])}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isBusy}
                      onClick={() => callApi(s.id, "dismiss")}
                      className="gap-1.5"
                    >
                      <X className="size-3" />
                      {t("dismiss")}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
