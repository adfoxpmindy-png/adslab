"use client";

import { CheckCircle2, AlertCircle, Lightbulb } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";

import { formatDateTime } from "@/lib/i18n/format";

export type CreativeAnalysis = {
  hook: string;
  visualHierarchy: number;
  textLegibility: number;
  emotionalTone: string;
  dominantColor: string;
  strengths: string[];
  weaknesses: string[];
  suggestedFixes: string[];
};

function Pips({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          className={
            i < value
              ? "h-1.5 w-3 rounded-full bg-teal-500"
              : "h-1.5 w-3 rounded-full bg-muted"
          }
        />
      ))}
    </span>
  );
}

export function CreativeAnalysisPanel({
  analysis,
  cachedAt,
}: {
  analysis: CreativeAnalysis;
  cachedAt?: string;
}) {
  const tAds = useTranslations("ads");
  const locale = useLocale();
  const cachedLabel = cachedAt
    ? formatDateTime(cachedAt, locale, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        year: undefined,
      })
    : null;

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{tAds("panelHook")}</p>
          <p className="font-medium leading-snug">🎯 {analysis.hook}</p>
        </div>
        {cachedLabel && (
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
            {tAds("panelSavedAt", { when: cachedLabel })}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="space-y-1">
          <p className="text-muted-foreground">{tAds("panelFocus")}</p>
          <Pips value={analysis.visualHierarchy} />
        </div>
        <div className="space-y-1">
          <p className="text-muted-foreground">{tAds("panelReadability")}</p>
          <Pips value={analysis.textLegibility} />
        </div>
        <div>
          <p className="text-muted-foreground">{tAds("panelTone")}</p>
          <p className="font-medium">{analysis.emotionalTone}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{tAds("panelColor")}</p>
          <p className="font-medium">{analysis.dominantColor}</p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-3.5" /> {tAds("panelStrengths")}
          </p>
          <ul className="space-y-0.5 pl-5 text-xs">
            {analysis.strengths.map((s, i) => (
              <li key={i} className="list-disc">
                {s}
              </li>
            ))}
          </ul>
        </div>

        {analysis.weaknesses.length > 0 && (
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
              <AlertCircle className="size-3.5" /> {tAds("panelWeaknesses")}
            </p>
            <ul className="space-y-0.5 pl-5 text-xs">
              {analysis.weaknesses.map((s, i) => (
                <li key={i} className="list-disc">
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {analysis.suggestedFixes.length > 0 && (
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-violet-600 dark:text-violet-400">
              <Lightbulb className="size-3.5" /> {tAds("panelFixes")}
            </p>
            <ul className="space-y-0.5 pl-5 text-xs">
              {analysis.suggestedFixes.map((s, i) => (
                <li key={i} className="list-disc">
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
