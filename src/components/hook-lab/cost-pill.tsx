"use client";

import { useEffect, useState } from "react";
import { DollarSign } from "lucide-react";
import { useTranslations } from "next-intl";

type CostSummary = {
  today: { costUsd: number; concepts: number; analyses: number };
  rateLimits: Array<{
    endpoint: string;
    cap: number;
    used: number;
  }>;
};

/**
 * Polls GET /api/ai/hooks/cost every 30s and shows today's USD cost + a
 * compact "calls remaining" figure summed across all Hook Lab endpoints.
 */
export function CostPill({ tenantSlug }: { tenantSlug: string }) {
  const t = useTranslations("pages.hookLab.costPill");
  const [data, setData] = useState<CostSummary | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const res = await fetch(
          `/api/ai/hooks/cost?tenantSlug=${encodeURIComponent(tenantSlug)}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!res.ok) return;
        const json = (await res.json()) as CostSummary;
        setData(json);
      } catch {
        // ignore transient errors — the pill self-recovers on next poll.
      }
    };
    void load();
    const id = window.setInterval(load, 30_000);
    return () => {
      controller.abort();
      window.clearInterval(id);
    };
  }, [tenantSlug]);

  const totalCalls = (data?.today.concepts ?? 0) + (data?.today.analyses ?? 0);
  const remaining = data
    ? data.rateLimits.reduce((sum, r) => sum + Math.max(0, r.cap - r.used), 0)
    : 0;
  const costLabel = data ? data.today.costUsd.toFixed(2) : "0.00";

  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
      <DollarSign className="size-3 text-teal-600" />
      <span className="tabular-nums text-foreground">${costLabel}</span>
      <span aria-hidden>·</span>
      <span className="tabular-nums">{t("callsToday", { n: totalCalls })}</span>
      <span aria-hidden>·</span>
      <span className="tabular-nums">{t("remaining", { n: remaining })}</span>
    </div>
  );
}
