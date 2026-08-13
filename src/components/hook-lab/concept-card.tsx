"use client";

import { useState } from "react";
import {
  Copy,
  Loader2,
  Play,
  RefreshCw,
  Save,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Wand2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AndromedaRisk, HookConceptShape } from "@/lib/hooks/types";

type Props = {
  concept: HookConceptShape;
  tenantSlug: string;
  canEdit: boolean;
  onSave?: (concept: HookConceptShape) => void;
  onDelete?: (conceptId: string) => void;
  /** Human-readable heuristic reasoning attached to MEDIUM/HIGH concepts. */
  andromedaReasoning?: string | null;
  /** True while the debounced heuristic-check is still in flight. */
  andromedaChecking?: boolean;
};

const RISK_STYLES: Record<AndromedaRisk, string> = {
  LOW: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  MEDIUM:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  HIGH: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

const RISK_ICON = {
  LOW: ShieldCheck,
  MEDIUM: Shield,
  HIGH: ShieldAlert,
} as const;

const RISK_LABEL_KEY: Record<AndromedaRisk, "low" | "medium" | "high"> = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
};

export function ConceptCard({
  concept,
  canEdit,
  onSave,
  onDelete,
  andromedaReasoning,
  andromedaChecking,
}: Props) {
  const t = useTranslations("pages.hookLab.conceptCard");
  const tRisk = useTranslations("pages.hookLab.risk");
  const [busy, setBusy] = useState(false);

  const primaryHook =
    concept.textHookTh ?? concept.textHookEn ?? t("noHookText");

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("toastCopied", { label }));
    } catch {
      toast.error(t("toastCopyFail"));
    }
  };

  const buildMarkdown = (): string => {
    const lines: string[] = [];
    lines.push(`# ${primaryHook}`);
    if (concept.textHookEn && concept.textHookTh)
      lines.push(`_EN:_ ${concept.textHookEn}`);
    if (concept.bodyOutline) {
      lines.push("");
      lines.push("## Body");
      lines.push(concept.bodyOutline);
    }
    if (concept.hypothesis) {
      lines.push("");
      lines.push("## Hypothesis");
      lines.push(concept.hypothesis);
    }
    if (concept.visualDirections && concept.visualDirections.length > 0) {
      lines.push("");
      lines.push("## Visual directions");
      concept.visualDirections.forEach((v, idx) => {
        lines.push(`### ${idx + 1}. ${v.name}`);
        lines.push(v.description);
        if (v.shotList.length > 0) {
          lines.push("");
          v.shotList.forEach((s) => lines.push(`- ${s}`));
        }
        if (v.hypothesis) lines.push(`_Why:_ ${v.hypothesis}`);
      });
    }
    if (concept.citations && concept.citations.length > 0) {
      lines.push("");
      lines.push("## Sources");
      concept.citations.forEach((c) =>
        lines.push(`- [${c.ordinal}] ${c.title} — ${c.url}`),
      );
    }
    return lines.join("\n");
  };

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {concept.leverChanged && (
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-300">
              {t("leverLabel", { lever: concept.leverChanged })}
            </p>
          )}
          <p className="text-base font-semibold leading-snug text-foreground">
            {primaryHook}
          </p>
          {concept.textHookEn && concept.textHookTh && (
            <p className="mt-0.5 text-xs italic text-muted-foreground">
              {concept.textHookEn}
            </p>
          )}
        </div>
        {andromedaChecking && !concept.andromedaRisk && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            {tRisk("checking")}
          </span>
        )}
        {concept.andromedaRisk && (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              RISK_STYLES[concept.andromedaRisk],
            )}
          >
            {(() => {
              const Icon = RISK_ICON[concept.andromedaRisk];
              return <Icon className="size-3" />;
            })()}
            {tRisk(RISK_LABEL_KEY[concept.andromedaRisk])}
          </span>
        )}
      </div>

      {concept.andromedaRisk === "MEDIUM" && andromedaReasoning && (
        <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs leading-relaxed text-amber-900 dark:text-amber-100">
          <p className="flex items-center gap-1.5 font-medium">
            <Shield className="size-3.5" />
            {tRisk("reasoningIntro")}
          </p>
          <p className="mt-0.5">{andromedaReasoning}</p>
        </div>
      )}

      {concept.andromedaRisk === "HIGH" && andromedaReasoning && (
        <div className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs leading-relaxed text-rose-900 dark:text-rose-100">
          <p className="flex items-center gap-1.5 font-medium">
            <ShieldAlert className="size-3.5" />
            {tRisk("reasoningIntro")}
          </p>
          <p className="mt-0.5">{andromedaReasoning}</p>
        </div>
      )}

      {concept.bodyOutline && (
        <div className="mt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("bodyLabel")}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-foreground/80">
            {concept.bodyOutline}
          </p>
        </div>
      )}

      {concept.hypothesis && (
        <div className="mt-3 rounded-md bg-muted/40 p-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("hypothesisLabel")}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-foreground/80">
            {concept.hypothesis}
          </p>
        </div>
      )}

      {concept.angleChange && Object.keys(concept.angleChange).length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("angleChangeLabel")}
          </p>
          <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
            {Object.entries(concept.angleChange).map(([k, v]) =>
              v ? (
                <div key={k} className="flex gap-1">
                  <dt className="text-muted-foreground">{k}:</dt>
                  <dd className="truncate">{v}</dd>
                </div>
              ) : null,
            )}
          </dl>
        </div>
      )}

      {concept.visualDirections && concept.visualDirections.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("visualLabel", { n: concept.visualDirections.length })}
          </p>
          <ul className="mt-1.5 space-y-2">
            {concept.visualDirections.map((v, idx) => (
              <li
                key={idx}
                className="rounded-md border border-border p-2 text-xs"
              >
                <p className="font-medium text-foreground">
                  {idx + 1}. {v.name}
                </p>
                <p className="mt-0.5 text-muted-foreground">{v.description}</p>
                {v.hypothesis && (
                  <p className="mt-0.5 text-[11px] text-teal-700 dark:text-teal-300">
                    {v.hypothesis}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {concept.citations && concept.citations.length > 0 && (
        <div className="mt-3 border-t border-border pt-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("sourcesLabel")}
          </p>
          <ul className="mt-1 space-y-0.5">
            {concept.citations.map((c) => (
              <li key={c.ordinal} className="truncate text-[11px]">
                <a
                  className="text-teal-600 underline-offset-2 hover:underline dark:text-teal-300"
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  [{c.ordinal}] {c.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => copy(t("hookLabel"), primaryHook)}
        >
          <Copy className="size-3.5" />
          {t("copyHook")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => copy(t("briefLabel"), buildMarkdown())}
        >
          <Copy className="size-3.5" />
          {t("copyBrief")}
        </Button>
        {canEdit && onSave && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              onSave(concept);
              setBusy(false);
            }}
          >
            <Save className="size-3.5" />
            {t("save")}
          </Button>
        )}
        {canEdit && onDelete && (
          <Button
            size="sm"
            variant="ghost"
            className="text-rose-600 hover:bg-rose-500/10 dark:text-rose-300"
            disabled={busy}
            onClick={() => onDelete(concept.id)}
          >
            <Trash2 className="size-3.5" />
            {t("delete")}
          </Button>
        )}
      </div>

      {concept.andromedaRisk && concept.andromedaOverrideChosen && (
        <p className="mt-2 flex items-center gap-1 text-[10px] italic text-muted-foreground">
          <Play className="size-3" />
          {t("overrideChosen")}
        </p>
      )}
    </Card>
  );
}
