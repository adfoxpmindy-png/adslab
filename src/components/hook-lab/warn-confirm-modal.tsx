"use client";

import { AlertTriangle, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  reasoning?: string;
  suggestion?: string;
  onSaveAnyway: () => void;
  onRevise: () => void;
  onClose: () => void;
};

/**
 * Warn+confirm modal for HIGH andromeda-risk saves. Non-destructive —
 * "Save anyway" logs andromedaOverrideChosen=true; "Let me revise" cancels.
 * Never a hard block per Nick's rule that the heuristic is guidance, not a
 * gate.
 */
export function WarnConfirmModal({
  open,
  reasoning,
  suggestion,
  onSaveAnyway,
  onRevise,
  onClose,
}: Props) {
  const t = useTranslations("pages.hookLab.warnConfirmModal");

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="warn-confirm-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-background p-6 shadow-lg ring-1 ring-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-300">
            <AlertTriangle className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="warn-confirm-title"
              className="text-base font-semibold tracking-tight"
            >
              {t("title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>
        </div>

        {reasoning && (
          <div className="mt-4 rounded-md bg-muted/50 p-3 text-xs leading-relaxed text-foreground">
            <p className="mb-1 flex items-center gap-1.5 font-medium text-muted-foreground">
              <ShieldAlert className="size-3.5" />
              {t("reasoningLabel")}
            </p>
            <p>{reasoning}</p>
          </div>
        )}

        {suggestion && (
          <div className="mt-2 rounded-md border border-teal-500/20 bg-teal-500/5 p-3 text-xs leading-relaxed text-teal-900 dark:text-teal-100">
            <p className="mb-1 font-medium">{t("suggestionLabel")}</p>
            <p>{suggestion}</p>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onRevise}>
            {t("revise")}
          </Button>
          <Button
            variant="outline"
            className="border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
            onClick={onSaveAnyway}
          >
            {t("saveAnyway")}
          </Button>
        </div>
      </div>
    </div>
  );
}
