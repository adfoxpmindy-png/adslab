"use client";

import { Info } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Persistent, non-dismissible attribution + heuristic-guidance banner.
 *
 * Two lines:
 *   1. Nick Theriot public teaching attribution (RAG source).
 *   2. Meta's actual classifier is not published — treat verdicts as
 *      heuristic guidance, not guarantees.
 */
export function NickBanner() {
  const t = useTranslations("pages.hookLab.nickBanner");
  return (
    <div className="flex items-start gap-2 rounded-lg border border-teal-500/20 bg-teal-500/10 px-3 py-2 text-xs text-teal-900 dark:text-teal-100">
      <Info className="mt-0.5 size-3.5 shrink-0 text-teal-600 dark:text-teal-300" />
      <div className="min-w-0 space-y-0.5">
        <p className="font-medium leading-snug">{t("attribution")}</p>
        <p className="leading-snug text-teal-800/80 dark:text-teal-100/80">
          {t("heuristic")}
        </p>
      </div>
    </div>
  );
}
