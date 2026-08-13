"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ConceptCard } from "./concept-card";
import { StreamingProgress, type StreamingStage } from "./streaming-progress";
import { WarnConfirmModal } from "./warn-confirm-modal";
import { useHeuristicCheck } from "@/lib/hooks/use-heuristic-check";
import type {
  AndromedaRisk,
  HookConceptShape,
  HookLanguage,
  HookProfileShape,
  HookWinnerShape,
} from "@/lib/hooks/types";

type Props = {
  tenantSlug: string;
  canEdit: boolean;
  profile: HookProfileShape | null;
  winners: HookWinnerShape[];
  onConceptsGenerated: (concepts: HookConceptShape[]) => void;
};

type FormState = {
  product: string;
  audience: string;
  desire: string;
  awarenessStage: string;
  sophisticationStage: string;
  language: HookLanguage;
  controlWinnerId: string;
  controlHookText: string;
  controlBodyText: string;
};

export function GenerateForm({
  tenantSlug,
  canEdit,
  profile,
  winners,
  onConceptsGenerated,
}: Props) {
  const t = useTranslations("pages.hookLab.generate");

  const [form, setForm] = useState<FormState>({
    product: profile?.product ?? "",
    audience: profile?.audience ?? "",
    desire: profile?.desire ?? "",
    awarenessStage: profile?.awarenessDefault ?? "",
    sophisticationStage:
      profile?.sophisticationDefault !== null &&
      profile?.sophisticationDefault !== undefined
        ? String(profile.sophisticationDefault)
        : "",
    language: profile?.language ?? "both",
    controlWinnerId: "",
    controlHookText: "",
    controlBodyText: "",
  });
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

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Resolve the effective control text — either the picked Meta-winner or the
  // manually pasted text. Shared with each concept card so heuristic-check
  // has a valid "control" to diff against.
  const controlHook = (() => {
    if (form.controlWinnerId) {
      const w = winners.find((x) => x.id === form.controlWinnerId);
      if (w) return w.textHook;
    }
    return form.controlHookText.trim();
  })();
  const controlBody = (() => {
    if (form.controlWinnerId) {
      const w = winners.find((x) => x.id === form.controlWinnerId);
      if (w) return w.body ?? "";
    }
    return form.controlBodyText.trim();
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

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit) return;

    let controlHookText = form.controlHookText.trim() || undefined;
    let controlBodyText = form.controlBodyText.trim() || undefined;
    if (form.controlWinnerId) {
      const w = winners.find((x) => x.id === form.controlWinnerId);
      if (w) {
        controlHookText = w.textHook;
        controlBodyText = w.body ?? undefined;
      }
    }

    setSubmitting(true);
    setDrafted([]);
    setRisks({});
    const initial: StreamingStage[] = [
      { key: "search", label: t("stageSearch"), status: "active" },
      { key: "draft", label: t("stageDraft"), status: "pending" },
      { key: "score", label: t("stageScore"), status: "pending" },
    ];
    setStages(initial);

    try {
      const res = await fetch("/api/ai/hooks/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantSlug,
          product: form.product,
          audience: form.audience,
          desire: form.desire,
          language: form.language,
          awarenessStage: form.awarenessStage || undefined,
          sophisticationStage: form.sophisticationStage
            ? Number(form.sophisticationStage)
            : undefined,
          controlHookText,
          controlBodyText,
        }),
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
          const payload = JSON.parse(line.slice(5).trim()) as {
            type: string;
            concepts?: HookConceptShape[];
            message?: string;
          };
          if (payload.type === "progress") {
            setStages((prev) =>
              prev.map((s, idx) =>
                idx === 0
                  ? { ...s, status: "done" }
                  : idx === 1
                    ? { ...s, status: "active" }
                    : s,
              ),
            );
          } else if (payload.type === "result" && payload.concepts) {
            setDrafted(payload.concepts);
            onConceptsGenerated(payload.concepts);
            setStages((prev) =>
              prev.map((s) => ({ ...s, status: "done" })),
            );
            toast.success(t("generatedToast", { n: payload.concepts.length }));
          } else if (payload.type === "error") {
            throw new Error(payload.message ?? "unknown_error");
          }
        }
      }
    } catch (err) {
      toast.error(
        t("generateFail", {
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
          <FormField label={t("productLabel")}>
            <Input
              value={form.product}
              placeholder={t("productPlaceholder")}
              onChange={(e) => update("product", e.target.value)}
              disabled={submitting || !canEdit}
              required
            />
          </FormField>
          <FormField label={t("audienceLabel")}>
            <Input
              value={form.audience}
              placeholder={t("audiencePlaceholder")}
              onChange={(e) => update("audience", e.target.value)}
              disabled={submitting || !canEdit}
              required
            />
          </FormField>
          <FormField label={t("desireLabel")}>
            <Input
              value={form.desire}
              placeholder={t("desirePlaceholder")}
              onChange={(e) => update("desire", e.target.value)}
              disabled={submitting || !canEdit}
              required
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("awarenessLabel")}>
              <SelectField
                value={form.awarenessStage}
                disabled={submitting || !canEdit}
                onChange={(v) => update("awarenessStage", v)}
                options={[
                  { value: "", label: t("awarenessAny") },
                  { value: "unaware", label: t("awarenessOptions.unaware") },
                  { value: "problem", label: t("awarenessOptions.problem") },
                  { value: "solution", label: t("awarenessOptions.solution") },
                  { value: "product", label: t("awarenessOptions.product") },
                  {
                    value: "most-aware",
                    label: t("awarenessOptions.mostAware"),
                  },
                ]}
              />
            </FormField>
            <FormField label={t("sophisticationLabel")}>
              <SelectField
                value={form.sophisticationStage}
                disabled={submitting || !canEdit}
                onChange={(v) => update("sophisticationStage", v)}
                options={[
                  { value: "", label: t("awarenessAny") },
                  { value: "1", label: "1" },
                  { value: "2", label: "2" },
                  { value: "3", label: "3" },
                  { value: "4", label: "4" },
                  { value: "5", label: "5" },
                ]}
              />
            </FormField>
          </div>

          <FormField label={t("languageLabel")}>
            <SelectField
              value={form.language}
              disabled={submitting || !canEdit}
              onChange={(v) => update("language", v as HookLanguage)}
              options={[
                { value: "th", label: t("languageOptions.th") },
                { value: "en", label: t("languageOptions.en") },
                { value: "both", label: t("languageOptions.both") },
              ]}
            />
          </FormField>

          <FormField label={t("controlWinnerLabel")}>
            <SelectField
              value={form.controlWinnerId}
              disabled={submitting || !canEdit}
              onChange={(v) => update("controlWinnerId", v)}
              options={[
                { value: "", label: t("controlWinnerNone") },
                ...winners.map((w) => ({
                  value: w.id,
                  label: `${w.textHook.slice(0, 60)}${w.textHook.length > 60 ? "…" : ""}`,
                })),
              ]}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t("controlWinnerHint")}
            </p>
          </FormField>

          {!form.controlWinnerId && (
            <>
              <FormField label={t("controlHookLabel")}>
                <textarea
                  className="min-h-[60px] w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm"
                  placeholder={t("controlHookPlaceholder")}
                  value={form.controlHookText}
                  disabled={submitting || !canEdit}
                  onChange={(e) => update("controlHookText", e.target.value)}
                />
              </FormField>
              <FormField label={t("controlBodyLabel")}>
                <textarea
                  className="min-h-[80px] w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm"
                  placeholder={t("controlBodyPlaceholder")}
                  value={form.controlBodyText}
                  disabled={submitting || !canEdit}
                  onChange={(e) => update("controlBodyText", e.target.value)}
                />
              </FormField>
            </>
          )}

          <Button type="submit" disabled={submitting || !canEdit}>
            {submitting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
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
            controlHook={controlHook}
            controlBody={controlBody}
            language={form.language}
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
 * Per-concept wrapper that runs the debounced heuristic-check and hands the
 * badge + reasoning down to ConceptCard. Kept inline because it is only used
 * here and in IterateForm (see iterate-form.tsx for its twin).
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

  // Push results up so the parent can render the warn-confirm modal with the
  // right reasoning + block Save on HIGH. The setter dedupes so this only
  // triggers a parent re-render when values actually change.
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

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-foreground">{label}</p>
      {children}
    </div>
  );
}

function SelectField({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <select
      className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
