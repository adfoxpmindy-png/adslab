"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
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
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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

const ACTION_LABEL: Record<Suggestion["action"], string> = {
  PAUSE: "หยุด",
  RESUME: "เปิด",
  SET_BUDGET: "ปรับ budget",
  SET_END_DATE: "ตั้ง end date",
  DUPLICATE: "Duplicate",
};

function describeParams(s: Suggestion): string {
  if (s.action === "SET_BUDGET") {
    if (s.params?.dailyBudget !== undefined) {
      return `เป็น ฿${s.params.dailyBudget.toLocaleString("th-TH")}/day`;
    }
    if (s.params?.lifetimeBudget !== undefined) {
      return `เป็น ฿${s.params.lifetimeBudget.toLocaleString("th-TH")} lifetime`;
    }
  }
  if (s.action === "SET_END_DATE" && s.params?.endTime) {
    return `เป็น ${new Date(s.params.endTime).toLocaleString("th-TH")}`;
  }
  if (s.action === "DUPLICATE") {
    const bits: string[] = [];
    if (s.params?.dailyBudgetMultiplier) bits.push(`×${s.params.dailyBudgetMultiplier} budget`);
    if (s.params?.lifetimeBudgetMultiplier) bits.push(`×${s.params.lifetimeBudgetMultiplier} lifetime budget`);
    if (s.params?.dailyBudget) bits.push(`฿${s.params.dailyBudget}/day`);
    if (s.params?.lifetimeBudget) bits.push(`฿${s.params.lifetimeBudget} lifetime`);
    if (s.params?.initialStatus === "ACTIVE") bits.push("ACTIVE ทันที");
    return bits.length > 0 ? `(${bits.join(", ")})` : "";
  }
  return "";
}

export function ReportActionsPanel({
  tenantSlug,
  reportId,
  suggestions: initial,
  canApply,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [suggestions, setSuggestions] = useState<Suggestion[]>(initial);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(false);

  const pending = suggestions.filter((s) => s.status === "pending");
  const applied = suggestions.filter((s) => s.status === "applied");
  const dismissed = suggestions.filter((s) => s.status === "dismissed");

  async function callApi(suggestionId: string, decision: "apply" | "dismiss") {
    if (busy.has(suggestionId)) return;
    setBusy((prev) => new Set(prev).add(suggestionId));
    const toastId = toast.loading(decision === "apply" ? "กำลังทำ..." : "กำลังข้าม...");
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
        throw new Error(typeof data.error === "string" ? data.error : "ไม่สำเร็จ");
      }
      setSuggestions((prev) =>
        prev.map((s) => (s.id === suggestionId ? (data.suggestion as Suggestion) : s)),
      );
      toast.success(decision === "apply" ? "✓ ทำแล้ว" : "✓ ข้ามแล้ว", {
        id: toastId,
        duration: 2500,
      });
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ไม่สำเร็จ", {
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
    if (!confirm(`${ACTION_LABEL[s.action]} campaign "${s.campaignName}"?`)) return;
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
          <p className="text-sm font-semibold">AI แนะนำให้ทำ</p>
          <p className="text-xs text-muted-foreground">
            {pending.length} รอ · {applied.length} ทำแล้ว · {dismissed.length} ข้าม
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
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-primary" />
                  <span className="text-xs font-medium uppercase tracking-wide">
                    {ACTION_LABEL[s.action]}
                  </span>
                  {isApplied && (
                    <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] uppercase text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                      ทำแล้ว
                    </span>
                  )}
                  {isDismissed && (
                    <span className="rounded-md bg-zinc-200 px-1.5 py-0.5 text-[10px] uppercase text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      ข้าม
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={s.campaignName}>
                    {s.campaignName}{" "}
                    <span className="font-normal text-muted-foreground">{describeParams(s)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{s.reason}</p>
                  {s.errorMessage && (
                    <p className="mt-0.5 text-xs text-rose-600 dark:text-rose-300">
                      ⚠ {s.errorMessage}
                    </p>
                  )}
                </div>

                {canApply && !isApplied && !isDismissed && (
                  <div className="flex gap-1">
                    <Button size="sm" disabled={isBusy} onClick={() => applyOne(s)} className="gap-1.5">
                      <Check className="size-3" />
                      {ACTION_LABEL[s.action]}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isBusy}
                      onClick={() => callApi(s.id, "dismiss")}
                      className="gap-1.5"
                    >
                      <X className="size-3" />
                      ข้าม
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
