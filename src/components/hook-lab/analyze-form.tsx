"use client";

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StreamingProgress, type StreamingStage } from "./streaming-progress";
import type {
  AndromedaRisk,
  HookAnalysisShape,
  HookLanguage,
  HookWinnerShape,
} from "@/lib/hooks/types";

type Props = {
  tenantSlug: string;
  canEdit: boolean;
  winners: HookWinnerShape[];
};

const RISK_STYLES: Record<AndromedaRisk, string> = {
  LOW: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  MEDIUM: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  HIGH: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

export function AnalyzeForm({ tenantSlug, canEdit, winners }: Props) {
  const t = useTranslations("pages.hookLab.analyze");
  const tRisk = useTranslations("pages.hookLab.risk");

  const [textHook, setTextHook] = useState("");
  const [bodyOutline, setBodyOutline] = useState("");
  const [controlHookText, setControlHookText] = useState("");
  const [controlBodyText, setControlBodyText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [product, setProduct] = useState("");
  const [audience, setAudience] = useState("");
  const [language, setLanguage] = useState<HookLanguage>("both");
  const [useMetaWinner, setUseMetaWinner] = useState(false);
  const [metaWinnerId, setMetaWinnerId] = useState(winners[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [stages, setStages] = useState<StreamingStage[]>([]);
  const [result, setResult] = useState<HookAnalysisShape | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit) return;
    if (!textHook.trim()) {
      toast.error(t("hookRequired"));
      return;
    }

    setSubmitting(true);
    setResult(null);
    setStages([
      { key: "load", label: t("stageLoad"), status: "active" },
      { key: "score", label: t("stageScore"), status: "pending" },
    ]);

    try {
      const payload: Record<string, unknown> = {
        tenantSlug,
        textHook,
        language,
      };
      if (bodyOutline.trim()) payload.bodyOutline = bodyOutline.trim();
      if (imageUrl.trim()) payload.imageUrl = imageUrl.trim();
      if (product.trim()) payload.product = product.trim();
      if (audience.trim()) payload.audience = audience.trim();
      if (useMetaWinner && metaWinnerId) {
        payload.useMetaWinner = true;
        payload.metaWinnerId = metaWinnerId;
      } else {
        if (controlHookText.trim())
          payload.controlHookText = controlHookText.trim();
        if (controlBodyText.trim())
          payload.controlBodyText = controlBodyText.trim();
      }

      const res = await fetch("/api/ai/hooks/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || String(res.status));
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const parsed = JSON.parse(line.slice(5).trim()) as {
            type: string;
            analysis?: HookAnalysisShape;
            message?: string;
          };
          if (parsed.type === "progress") {
            setStages((prev) =>
              prev.map((s, idx) =>
                idx === 0
                  ? { ...s, status: "done" }
                  : { ...s, status: "active" },
              ),
            );
          } else if (parsed.type === "result" && parsed.analysis) {
            setResult(parsed.analysis);
            setStages((prev) => prev.map((s) => ({ ...s, status: "done" })));
            toast.success(t("scoredToast"));
          } else if (parsed.type === "error") {
            throw new Error(parsed.message ?? "unknown_error");
          }
        }
      }
    } catch (err) {
      toast.error(
        t("analyzeFail", {
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <Card className="p-6">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <p className="mb-1 text-xs font-medium">{t("hookLabel")}</p>
            <textarea
              className="min-h-[70px] w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm"
              value={textHook}
              placeholder={t("hookPlaceholder")}
              disabled={submitting}
              onChange={(e) => setTextHook(e.target.value)}
            />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium">{t("bodyLabel")}</p>
            <textarea
              className="min-h-[80px] w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm"
              value={bodyOutline}
              placeholder={t("bodyPlaceholder")}
              disabled={submitting}
              onChange={(e) => setBodyOutline(e.target.value)}
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={useMetaWinner}
                disabled={submitting}
                onChange={(e) => setUseMetaWinner(e.target.checked)}
              />
              {t("useMetaWinner")}
            </label>
            {useMetaWinner && winners.length > 0 && (
              <select
                className="mt-2 h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                value={metaWinnerId}
                disabled={submitting}
                onChange={(e) => setMetaWinnerId(e.target.value)}
              >
                {winners.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.textHook.slice(0, 80)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {!useMetaWinner && (
            <>
              <div>
                <p className="mb-1 text-xs font-medium">
                  {t("controlHookLabel")}
                </p>
                <Input
                  value={controlHookText}
                  disabled={submitting}
                  placeholder={t("controlHookPlaceholder")}
                  onChange={(e) => setControlHookText(e.target.value)}
                />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium">
                  {t("controlBodyLabel")}
                </p>
                <textarea
                  className="min-h-[70px] w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm"
                  value={controlBodyText}
                  disabled={submitting}
                  placeholder={t("controlBodyPlaceholder")}
                  onChange={(e) => setControlBodyText(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1 text-xs font-medium">{t("productLabel")}</p>
              <Input
                value={product}
                disabled={submitting}
                onChange={(e) => setProduct(e.target.value)}
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium">{t("audienceLabel")}</p>
              <Input
                value={audience}
                disabled={submitting}
                onChange={(e) => setAudience(e.target.value)}
              />
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium">{t("imageUrlLabel")}</p>
            <Input
              value={imageUrl}
              disabled={submitting}
              placeholder={t("imageUrlPlaceholder")}
              onChange={(e) => setImageUrl(e.target.value)}
            />
          </div>

          <div>
            <p className="mb-1 text-xs font-medium">{t("languageLabel")}</p>
            <select
              className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              value={language}
              disabled={submitting}
              onChange={(e) => setLanguage(e.target.value as HookLanguage)}
            >
              <option value="th">{t("languageOptions.th")}</option>
              <option value="en">{t("languageOptions.en")}</option>
              <option value="both">{t("languageOptions.both")}</option>
            </select>
          </div>

          <Button type="submit" disabled={submitting || !canEdit}>
            {submitting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Search className="size-3.5" />
            )}
            {t("submit")}
          </Button>
        </form>

        {submitting && stages.length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <StreamingProgress stages={stages} />
          </div>
        )}
      </Card>

      <div className="space-y-3">
        {!result && !submitting && (
          <Card className="flex min-h-[200px] items-center justify-center p-6 text-center">
            <div className="max-w-sm space-y-1">
              <p className="text-sm font-medium">{t("emptyTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("emptyBody")}</p>
            </div>
          </Card>
        )}
        {result && (
          <Card className="p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold">{t("resultTitle")}</h3>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {result.inputTextHook}
                </p>
              </div>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${RISK_STYLES[result.andromedaRisk]}`}
              >
                {tRisk(`short.${result.andromedaRisk}`)}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-4 gap-2 text-center">
              {(
                [
                  ["stopScroll", result.scoreStopScroll],
                  ["curiosity", result.scoreCuriosity],
                  ["benefit", result.scoreBenefit],
                  ["alignment", result.scoreAlignment],
                ] as const
              ).map(([axis, score]) => (
                <div key={axis} className="rounded-md bg-muted/40 p-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t(`axis.${axis}`)}
                  </p>
                  <p className="mt-0.5 text-2xl font-bold tabular-nums text-teal-600 dark:text-teal-300">
                    {score}
                    <span className="text-[10px] text-muted-foreground">
                      /5
                    </span>
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-2 text-xs">
              {(["stopScroll", "curiosity", "benefit", "alignment"] as const).map(
                (axis) => (
                  <div key={axis}>
                    <p className="font-medium text-foreground">
                      {t(`axis.${axis}`)}
                    </p>
                    <p className="text-muted-foreground">
                      {result.reasoning[axis]}
                    </p>
                  </div>
                ),
              )}
            </div>

            {result.rewrites.length > 0 && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("rewritesLabel")}
                </p>
                <ul className="space-y-2">
                  {result.rewrites.map((r, idx) => (
                    <li
                      key={idx}
                      className="rounded-md border border-border p-2 text-xs"
                    >
                      <p className="font-medium">{r.text}</p>
                      <p className="mt-0.5 text-teal-700 dark:text-teal-300">
                        {r.angle}
                      </p>
                      <p className="mt-0.5 text-muted-foreground">
                        {r.whyBetter}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.andromedaReasoning && (
              <p className="mt-3 rounded-md bg-muted/40 p-2 text-[11px] italic text-muted-foreground">
                {result.andromedaReasoning}
              </p>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
