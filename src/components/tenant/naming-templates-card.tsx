"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Lightbulb, Loader2, Plus, Sparkles, Trash2, Type, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Template = {
  id: string;
  name: string;
  pattern: string;
  description: string | null;
  isDefault: boolean;
};

type AiSuggestion = {
  name: string;
  pattern: string;
  description: string;
  evidence_examples?: string[];
};

const PLACEHOLDER_TOKENS = [
  { token: "{MM}", hintKey: "MM" },
  { token: "{YY}", hintKey: "YY" },
  { token: "{YYYY}", hintKey: "YYYY" },
  { token: "{DD}", hintKey: "DD" },
  { token: "{Month}", hintKey: "Month" },
  { token: "{Custom}", hintKey: "Custom" },
] as const;

/**
 * Renders a preview string for a template pattern by substituting
 * date placeholders with current (Bangkok) date values. Mirrors
 * `src/lib/naming-template.ts#renderTemplate`.
 *
 * `customFallback` is the localized placeholder shown for `{Custom}`
 * so the preview reads naturally in the user's language.
 */
function renderPreview(pattern: string, customFallback: string): string {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const yy = String(now.getUTCFullYear() % 100).padStart(2, "0");
  const yyyy = String(now.getUTCFullYear());
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const monthShort = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ][now.getUTCMonth()];
  return pattern
    .replace(/\{MM\}/g, mm)
    .replace(/\{YY\}/g, yy)
    .replace(/\{YYYY\}/g, yyyy)
    .replace(/\{DD\}/g, dd)
    .replace(/\{Month\}/g, monthShort)
    .replace(/\{Custom\}/g, customFallback);
}

export function NamingTemplatesCard({
  tenantSlug,
  canEdit,
}: {
  tenantSlug: string;
  canEdit: boolean;
}) {
  const t = useTranslations("pages.naming.templates");
  const customFallback = t("previewFallback");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-then-setState pattern, guarded with cancelled flag
    setLoading(true);
    fetch(`/api/naming-templates?tenantSlug=${tenantSlug}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setTemplates(d.templates ?? []);
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, refreshKey]);

  async function deleteTemplate(id: string) {
    if (!confirm(t("toast.confirmDelete"))) return;
    try {
      const res = await fetch(
        `/api/naming-templates/${id}?tenantSlug=${tenantSlug}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("toast.deleteFail"));
      toast.success(t("toast.deleted"), { duration: 2000 });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toast.deleteFail"));
    }
  }

  return (
    <section className="space-y-3">
      <header className="flex items-start gap-3">
        <div className="flex size-9 items-center justify-center rounded-md bg-orange-500/10">
          <Type className="size-5 text-orange-600" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">{t("header.title")}</h2>
            <span className="rounded-md bg-orange-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-orange-700 dark:bg-orange-950/60 dark:text-orange-300">
              {t("header.badge")}
            </span>
          </div>
          <p
            className="mt-1 text-sm text-muted-foreground"
            // The intro text contains a small <code> snippet for the example
            // pattern; render via dangerouslySetInnerHTML so translators can
            // place the snippet appropriately in their language.
            dangerouslySetInnerHTML={{
              __html: t("header.intro", { example: "{MM}{YY}" }),
            }}
          />
        </div>
      </header>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm">
            <span className="text-muted-foreground">{t("templatesCount")}</span>{" "}
            <span className="font-semibold tabular-nums">{templates.length}</span>
          </p>
          {canEdit && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAiOpen(true)}
                className="gap-1.5"
              >
                <Sparkles className="size-3.5" />
                {t("actions.aiAnalyze")}
              </Button>
              <Button
                size="sm"
                onClick={() => setShowCreate(true)}
                className="gap-1.5"
              >
                <Plus className="size-3.5" />
                {t("actions.addTemplate")}
              </Button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{t("loading")}</span>
          </div>
        ) : templates.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            {t("empty")}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {templates.map((tpl) => (
              <li key={tpl.id} className="flex items-start gap-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{tpl.name}</span>
                    {tpl.isDefault && (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium uppercase text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        {t("suggestBadge")}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {t("patternWord")}: <code className="text-foreground">{tpl.pattern}</code>
                    {" · "}{t("previewWord")}:{" "}
                    <code className="text-foreground">{renderPreview(tpl.pattern, customFallback)}</code>
                  </p>
                  {tpl.description && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {tpl.description}
                    </p>
                  )}
                </div>
                {canEdit && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => deleteTemplate(tpl.id)}
                    className="text-destructive"
                    title={t("deleteTooltip")}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {showCreate && (
        <CreateTemplateModal
          tenantSlug={tenantSlug}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {aiOpen && (
        <AiSuggestModal
          tenantSlug={tenantSlug}
          onClose={() => setAiOpen(false)}
          onAccepted={() => {
            setAiOpen(false);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </section>
  );
}

function CreateTemplateModal({
  tenantSlug,
  onClose,
  onCreated,
}: {
  tenantSlug: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations("pages.naming.templates");
  const customFallback = t("previewFallback");
  const [name, setName] = useState("");
  const [pattern, setPattern] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!name.trim() || !pattern.trim()) {
      return toast.error(t("create.errors.nameAndPattern"));
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/naming-templates?tenantSlug=${tenantSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          pattern: pattern.trim(),
          description: description.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("create.errors.createFail"));
      toast.success(t("create.success"), { duration: 2500 });
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("create.errors.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg space-y-3 rounded-lg border border-border bg-background p-5 shadow-lg"
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold">{t("create.title")}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("create.subtitle")}
            </p>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            {t("create.nameLabel")}
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("create.namePlaceholder")}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            {t("create.patternLabel")}
          </label>
          <Input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder={t("create.patternPlaceholder")}
          />
          {pattern && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t("previewNow")}{" "}
              <code className="font-medium text-foreground">
                {renderPreview(pattern, customFallback)}
              </code>
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            {PLACEHOLDER_TOKENS.map((h) => (
              <button
                key={h.token}
                type="button"
                onClick={() => setPattern((p) => p + h.token)}
                className="rounded-md border border-border bg-muted/30 px-2 py-0.5 text-[11px] hover:bg-muted"
                title={t(`placeholderHints.${h.hintKey}`)}
              >
                <code>{h.token}</code>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            {t("create.descriptionLabel")}
          </label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("create.descriptionPlaceholder")}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            {t("create.cancel")}
          </Button>
          <Button
            size="sm"
            onClick={submit}
            disabled={submitting || !name.trim() || !pattern.trim()}
          >
            {submitting && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            {t("create.createBtn")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AiSuggestModal({
  tenantSlug,
  onClose,
  onAccepted,
}: {
  tenantSlug: string;
  onClose: () => void;
  onAccepted: () => void;
}) {
  const t = useTranslations("pages.naming.templates");
  const customFallback = t("previewFallback");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [notes, setNotes] = useState<string | null>(null);
  const [analyzed, setAnalyzed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/naming-templates/ai-suggest?tenantSlug=${tenantSlug}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "lite" }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("aiModal.errors.generic"));
      const sugg = data.suggestion as {
        templates?: AiSuggestion[];
        notes?: string;
      };
      setSuggestions(sugg?.templates ?? []);
      setNotes(sugg?.notes ?? null);
      setAnalyzed(data.analyzed ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("aiModal.errors.aiFail"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- run() does async fetch; setState happens after await, intentional mount fetch
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function accept(s: AiSuggestion) {
    try {
      const res = await fetch(`/api/naming-templates?tenantSlug=${tenantSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: s.name.slice(0, 120),
          pattern: s.pattern.slice(0, 200),
          description: s.description.slice(0, 300),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("aiModal.errors.addFail"));
      toast.success(t("aiModal.addedToast", { name: s.name }), { duration: 2000 });
      // Allow user to accept more without closing — refresh list happens via parent on close
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("aiModal.errors.generic"));
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl space-y-3 rounded-lg border border-border bg-background p-5 shadow-lg"
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold">
              <Sparkles className="size-4 text-orange-600" />
              {t("aiModal.title")}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("aiModal.subtitle")}
            </p>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {t("aiModal.loading")}
            </span>
          </div>
        ) : error ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
            {error}
          </div>
        ) : (
          <>
            <p className="text-[11px] text-muted-foreground">
              {t("aiModal.analyzedSummary", { analyzed, count: suggestions.length })}
            </p>
            {notes && (
              <p className="flex items-start gap-1.5 rounded-md border border-blue-200 bg-blue-50/60 p-2 text-xs text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
                <Lightbulb className="mt-0.5 size-3.5 shrink-0" />
                <span>{notes}</span>
              </p>
            )}
            <ul className="space-y-2">
              {suggestions.map((s, idx) => (
                <li
                  key={idx}
                  className={cn(
                    "rounded-md border border-border p-3",
                    "flex items-start gap-3",
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {t("patternWord")}: <code className="text-foreground">{s.pattern}</code>
                      {" · "}{t("previewWord")}:{" "}
                      <code className="text-foreground">{renderPreview(s.pattern, customFallback)}</code>
                    </p>
                    {s.description && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {s.description}
                      </p>
                    )}
                    {s.evidence_examples && s.evidence_examples.length > 0 && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        e.g. {s.evidence_examples.join(", ")}
                      </p>
                    )}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => accept(s)}>
                    {t("aiModal.useBtn")}
                  </Button>
                </li>
              ))}
            </ul>
            {suggestions.length === 0 && (
              <p className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                {t("aiModal.noPatterns")}
              </p>
            )}
          </>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("aiModal.closeBtn")}
          </Button>
          <Button size="sm" onClick={onAccepted}>
            {t("aiModal.doneBtn")}
          </Button>
        </div>
      </div>
    </div>
  );
}
