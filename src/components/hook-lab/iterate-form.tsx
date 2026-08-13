"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConceptCard } from "./concept-card";
import { StreamingProgress, type StreamingStage } from "./streaming-progress";
import { WarnConfirmModal } from "./warn-confirm-modal";
import { useHeuristicCheck } from "@/lib/hooks/use-heuristic-check";
import type {
  AndromedaRisk,
  HookConceptShape,
  HookLanguage,
  HookWinnerShape,
  IterationLever,
} from "@/lib/hooks/types";

type Props = {
  tenantSlug: string;
  canEdit: boolean;
  winners: HookWinnerShape[];
  savedWinners: HookConceptShape[];
  onIterationsGenerated: (concepts: HookConceptShape[]) => void;
};

type WinnerSource = "meta" | "pasted" | "savedConceptId";

const LEVERS: IterationLever[] = [
  "opening_beat",
  "first_frame",
  "actor_age",
  "actor_ethnicity",
  "format_style",
  "callout_wording",
];

export function IterateForm({
  tenantSlug,
  canEdit,
  winners,
  savedWinners,
  onIterationsGenerated,
}: Props) {
  const t = useTranslations("pages.hookLab.iterate");
  const tLevers = useTranslations("pages.hookLab.levers");

  const [source, setSource] = useState<WinnerSource>("meta");
  const [metaWinnerId, setMetaWinnerId] = useState<string>(
    winners[0]?.id ?? "",
  );
  const [savedConceptId, setSavedConceptId] = useState<string>(
    savedWinners[0]?.id ?? "",
  );
  const [pastedHook, setPastedHook] = useState("");
  const [pastedBody, setPastedBody] = useState("");
  const [iterationCount, setIterationCount] = useState<3 | 4 | 5>(3);
  const [lockedLevers, setLockedLevers] = useState<IterationLever[]>([]);
  const [language, setLanguage] = useState<HookLanguage>("both");
  const [submitting, setSubmitting] = useState(false);
  const [stages, setStages] = useState<StreamingStage[]>([]);
  const [drafted, setDrafted] = useState<HookConceptShape[]>([]);
  const [risks, setRisks] = useState<
    Record<
      string,
      {
        risk: AndromedaRisk | null;
        reasoning: string | null;
        suggestion: string | null;
        checking: boolean;
      }
    >
  >({});
  const [pendingSave, setPendingSave] = useState<{
    concept: HookConceptShape;
    reasoning: string | null;
    suggestion: string | null;
  } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Effective control text for the heuristic check — one of Meta winner,
  // saved-concept winner, or pasted text depending on the picked source.
  const controlPair = (() => {
    if (source === "meta") {
      const w = winners.find((x) => x.id === metaWinnerId);
      return { hook: w?.textHook ?? "", body: w?.body ?? "" };
    }
    if (source === "savedConceptId") {
      const c = savedWinners.find((x) => x.id === savedConceptId);
      return {
        hook: c?.textHookTh ?? c?.textHookEn ?? "",
        body: c?.bodyOutline ?? "",
      };
    }
    return { hook: pastedHook.trim(), body: pastedBody.trim() };
  })();

  const registerRisk = useCallback(
    (
      conceptId: string,
      value: {
        risk: AndromedaRisk | null;
        reasoning: string | null;
        suggestion: string | null;
        checking: boolean;
      },
    ) => {
      setRisks((prev) => {
        const existing = prev[conceptId];
        if (
          existing &&
          existing.risk === value.risk &&
          existing.reasoning === value.reasoning &&
          existing.suggestion === value.suggestion &&
          existing.checking === value.checking
        ) {
          return prev;
        }
        return { ...prev, [conceptId]: value };
      });
    },
    [],
  );

  const doSavePatch = async (
    concept: HookConceptShape,
    override: boolean,
  ): Promise<void> => {
    setSavingId(concept.id);
    try {
      const res = await fetch(`/api/ai/hooks/concepts/${concept.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantSlug,
          andromedaOverrideChosen: override,
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || String(res.status));
      }
      const json = (await res.json()) as { concept: HookConceptShape };
      setDrafted((prev) =>
        prev.map((c) => (c.id === concept.id ? { ...c, ...json.concept } : c)),
      );
      toast.success(t("savedToast"));
    } catch (err) {
      toast.error(
        t("saveFail", {
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveClick = (concept: HookConceptShape) => {
    const meta = risks[concept.id];
    const risk = meta?.risk ?? concept.andromedaRisk ?? null;
    if (risk === "HIGH") {
      setPendingSave({
        concept,
        reasoning: meta?.reasoning ?? null,
        suggestion: meta?.suggestion ?? null,
      });
      return;
    }
    void doSavePatch(concept, false);
  };

  const toggleLever = (lever: IterationLever) => {
    setLockedLevers((prev) =>
      prev.includes(lever)
        ? prev.filter((l) => l !== lever)
        : [...prev, lever],
    );
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit) return;

    const payload: Record<string, unknown> = {
      tenantSlug,
      winnerSource: source,
      iterationCount,
      lockedLevers,
      language,
    };
    if (source === "meta") {
      if (!metaWinnerId) {
        toast.error(t("selectWinner"));
        return;
      }
      payload.metaWinnerId = metaWinnerId;
    } else if (source === "savedConceptId") {
      if (!savedConceptId) {
        toast.error(t("selectSavedConcept"));
        return;
      }
      payload.savedConceptId = savedConceptId;
    } else {
      if (!pastedHook.trim() || !pastedBody.trim()) {
        toast.error(t("pastedRequired"));
        return;
      }
      payload.winnerTextHook = pastedHook;
      payload.winnerBody = pastedBody;
    }

    setSubmitting(true);
    setDrafted([]);
    setRisks({});
    setStages([
      { key: "load", label: t("stageLoadWinner"), status: "active" },
      { key: "draft", label: t("stageDraft"), status: "pending" },
    ]);

    try {
      const res = await fetch("/api/ai/hooks/iterate", {
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
            iterations?: HookConceptShape[];
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
          } else if (parsed.type === "result" && parsed.iterations) {
            setDrafted(parsed.iterations);
            onIterationsGenerated(parsed.iterations);
            setStages((prev) => prev.map((s) => ({ ...s, status: "done" })));
            toast.success(
              t("generatedToast", { n: parsed.iterations.length }),
            );
          } else if (parsed.type === "error") {
            throw new Error(parsed.message ?? "unknown_error");
          }
        }
      }
    } catch (err) {
      toast.error(
        t("iterateFail", {
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
            <p className="mb-1 text-xs font-medium">{t("sourceLabel")}</p>
            <div className="grid grid-cols-3 gap-1.5">
              <SourceTab
                active={source === "meta"}
                onClick={() => setSource("meta")}
                label={t("sourceOptions.meta")}
                sublabel={t("sourceOptions.metaHint")}
              />
              <SourceTab
                active={source === "savedConceptId"}
                onClick={() => setSource("savedConceptId")}
                label={t("sourceOptions.saved")}
                sublabel={t("sourceOptions.savedHint")}
              />
              <SourceTab
                active={source === "pasted"}
                onClick={() => setSource("pasted")}
                label={t("sourceOptions.pasted")}
                sublabel={t("sourceOptions.pastedHint")}
              />
            </div>
          </div>

          {source === "meta" && (
            <div>
              <p className="mb-1 text-xs font-medium">{t("winnerLabel")}</p>
              {winners.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                  {t("emptyNoWinners")}
                </p>
              ) : (
                <select
                  className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
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
          )}

          {source === "savedConceptId" && (
            <div>
              <p className="mb-1 text-xs font-medium">{t("savedLabel")}</p>
              {savedWinners.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                  {t("emptyNoSaved")}
                </p>
              ) : (
                <select
                  className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                  value={savedConceptId}
                  disabled={submitting}
                  onChange={(e) => setSavedConceptId(e.target.value)}
                >
                  {savedWinners.map((c) => (
                    <option key={c.id} value={c.id}>
                      {(c.textHookTh ?? c.textHookEn ?? "").slice(0, 80)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {source === "pasted" && (
            <>
              <div>
                <p className="mb-1 text-xs font-medium">
                  {t("pastedHookLabel")}
                </p>
                <textarea
                  className="min-h-[60px] w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm"
                  value={pastedHook}
                  disabled={submitting}
                  placeholder={t("pastedHookPlaceholder")}
                  onChange={(e) => setPastedHook(e.target.value)}
                />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium">
                  {t("pastedBodyLabel")}
                </p>
                <textarea
                  className="min-h-[100px] w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm"
                  value={pastedBody}
                  disabled={submitting}
                  placeholder={t("pastedBodyPlaceholder")}
                  onChange={(e) => setPastedBody(e.target.value)}
                />
              </div>
            </>
          )}

          <div>
            <p className="mb-1 text-xs font-medium">
              {t("iterationCountLabel")}
            </p>
            <div className="flex gap-1.5">
              {[3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setIterationCount(n as 3 | 4 | 5)}
                  className={
                    iterationCount === n
                      ? "rounded-md bg-teal-500/15 px-3 py-1 text-xs font-semibold text-teal-700 dark:text-teal-300"
                      : "rounded-md border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
                  }
                  disabled={submitting}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium">{t("lockedLeversLabel")}</p>
            <p className="mb-2 text-[11px] text-muted-foreground">
              {t("lockedLeversHint")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {LEVERS.map((lever) => {
                const on = lockedLevers.includes(lever);
                return (
                  <button
                    key={lever}
                    type="button"
                    disabled={submitting}
                    onClick={() => toggleLever(lever)}
                    className={
                      on
                        ? "rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300"
                        : "rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                    }
                  >
                    {tLevers(lever)}
                  </button>
                );
              })}
            </div>
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
              <RefreshCw className="size-3.5" />
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
        {drafted.length === 0 && !submitting && (
          <Card className="flex min-h-[200px] items-center justify-center p-6 text-center">
            <div className="max-w-sm space-y-1">
              <p className="text-sm font-medium">{t("emptyTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("emptyBody")}</p>
            </div>
          </Card>
        )}
        {drafted.map((c) => (
          <ConceptWithRiskCheck
            key={c.id}
            tenantSlug={tenantSlug}
            canEdit={canEdit && savingId !== c.id}
            concept={c}
            controlHook={controlPair.hook}
            controlBody={controlPair.body}
            language={language}
            onRisk={registerRisk}
            onSave={handleSaveClick}
          />
        ))}
      </div>

      <WarnConfirmModal
        open={pendingSave !== null}
        reasoning={pendingSave?.reasoning ?? undefined}
        suggestion={pendingSave?.suggestion ?? undefined}
        onSaveAnyway={() => {
          const target = pendingSave;
          setPendingSave(null);
          if (target) void doSavePatch(target.concept, true);
        }}
        onRevise={() => setPendingSave(null)}
        onClose={() => setPendingSave(null)}
      />
    </div>
  );
}

/**
 * Per-iteration wrapper — runs debounced heuristic-check against each iteration
 * as it streams in and lifts the result up to the parent form so the warn
 * modal can quote the reasoning.
 */
function ConceptWithRiskCheck({
  tenantSlug,
  canEdit,
  concept,
  controlHook,
  controlBody,
  language,
  onRisk,
  onSave,
}: {
  tenantSlug: string;
  canEdit: boolean;
  concept: HookConceptShape;
  controlHook: string;
  controlBody: string;
  language: HookLanguage;
  onRisk: (
    id: string,
    value: {
      risk: AndromedaRisk | null;
      reasoning: string | null;
      suggestion: string | null;
      checking: boolean;
    },
  ) => void;
  onSave: (concept: HookConceptShape) => void;
}) {
  const newTextHook = concept.textHookTh ?? concept.textHookEn ?? "";
  const newBody = concept.bodyOutline ?? undefined;
  const newVisualDirections = concept.visualDirections ?? undefined;

  const { risk, reasoning, suggestion, isChecking } = useHeuristicCheck({
    tenantSlug,
    controlTextHook: controlHook || undefined,
    controlBody: controlBody || undefined,
    newTextHook,
    newBody,
    newVisualDirections: newVisualDirections ?? undefined,
    language,
    enabled: Boolean(controlHook || controlBody),
  });

  const conceptId = concept.id;
  useEffect(() => {
    onRisk(conceptId, {
      risk,
      reasoning,
      suggestion,
      checking: isChecking,
    });
  }, [conceptId, risk, reasoning, suggestion, isChecking, onRisk]);

  const merged: HookConceptShape = risk
    ? { ...concept, andromedaRisk: risk }
    : concept;

  return (
    <ConceptCard
      concept={merged}
      tenantSlug={tenantSlug}
      canEdit={canEdit}
      onSave={onSave}
      andromedaReasoning={reasoning}
      andromedaChecking={isChecking}
    />
  );
}

function SourceTab({
  active,
  onClick,
  label,
  sublabel,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sublabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-lg border border-teal-500/40 bg-teal-500/10 p-2 text-left"
          : "rounded-lg border border-border bg-background p-2 text-left hover:bg-muted"
      }
    >
      <p
        className={
          active
            ? "text-xs font-semibold text-teal-700 dark:text-teal-300"
            : "text-xs font-semibold"
        }
      >
        {label}
      </p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{sublabel}</p>
    </button>
  );
}
