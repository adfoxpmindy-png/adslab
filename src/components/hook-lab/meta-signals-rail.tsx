"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, Info, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

type Anomaly = {
  metric: string;
  severity?: string;
  direction?: string;
  timestamp?: string;
};

type Opportunity = {
  score: number | null;
  recommendations: Array<{
    type?: string;
    severity?: string;
    recommendation?: string;
  }>;
};

type Signals = {
  anomalies: Anomaly[];
  opportunityScore: Opportunity | null;
  accountOpportunityScore: Opportunity | null;
  warnings: string[];
};

type Props = {
  tenantSlug: string;
  metaCampaignId: string | null;
};

export function MetaSignalsRail({ tenantSlug, metaCampaignId }: Props) {
  const t = useTranslations("pages.hookLab.metaSignals");
  const [data, setData] = useState<Signals | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!metaCampaignId) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const r = await fetch(
          `/api/ai/hooks/meta/signals?tenantSlug=${encodeURIComponent(tenantSlug)}&metaCampaignId=${encodeURIComponent(metaCampaignId)}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!r.ok) throw new Error(String(r.status));
        const json = (await r.json()) as Signals;
        if (controller.signal.aborted) return;
        setData(json);
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => {
      controller.abort();
    };
  }, [tenantSlug, metaCampaignId]);

  if (!metaCampaignId) {
    return (
      <aside className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
        <Info className="mb-1 size-3.5" />
        <p>{t("emptyNoCampaign")}</p>
      </aside>
    );
  }

  return (
    <aside className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-1.5">
        <ExternalLink className="size-3.5 text-muted-foreground" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("heading")}
        </h3>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {t("loading")}
        </div>
      )}

      {error && (
        <p className="text-xs text-rose-600 dark:text-rose-300">
          {t("errorMessage", { message: error })}
        </p>
      )}

      {data && !loading && (
        <>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">
              {t("opportunityCampaign")}
            </p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
              {data.opportunityScore?.score ?? "—"}
            </p>
            {data.opportunityScore?.recommendations
              .slice(0, 2)
              .map((r, idx) => (
                <p
                  key={idx}
                  className="mt-1 line-clamp-2 text-[11px] text-muted-foreground"
                >
                  {r.recommendation ?? r.type}
                </p>
              ))}
          </div>

          <div>
            <p className="text-[11px] font-medium text-muted-foreground">
              {t("opportunityAccount")}
            </p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
              {data.accountOpportunityScore?.score ?? "—"}
            </p>
          </div>

          <div>
            <p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <AlertTriangle className="size-3" />
              {t("anomalies")}
            </p>
            {data.anomalies.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/70">
                {t("noAnomalies")}
              </p>
            ) : (
              <ul className="space-y-1">
                {data.anomalies.slice(0, 4).map((a, idx) => (
                  <li key={idx} className="text-[11px]">
                    <span className="font-medium">{a.metric}</span>
                    {a.direction && (
                      <span className="ml-1 text-muted-foreground">
                        {a.direction}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {data.warnings.length > 0 && (
            <p className="text-[10px] text-muted-foreground">
              {t("partial", { list: data.warnings.join(", ") })}
            </p>
          )}
        </>
      )}
    </aside>
  );
}
