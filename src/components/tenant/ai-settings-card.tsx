"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Bot,
  FileText,
  Globe,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Document = {
  id: string;
  title: string;
  sourceType: "text" | "pdf" | "url";
  status: "processing" | "ready" | "failed";
  chunkCount: number;
  errorMessage: string | null;
  createdAt: string;
};

type Persona = {
  role: string;
  customInstructions: string;
  ragEnabled: boolean;
};

/**
 * Top-level Settings → AI tab. Two cards stacked:
 *   1. Persona — role + custom instructions
 *   2. Knowledge — upload PDFs / paste text / add URLs; list + delete
 *
 * Owner-only edits.
 */
export function AISettings({
  tenantSlug,
  canEdit,
}: {
  tenantSlug: string;
  canEdit: boolean;
}) {
  return (
    <div className="space-y-6">
      <PersonaCard tenantSlug={tenantSlug} canEdit={canEdit} />
      <KnowledgeCard tenantSlug={tenantSlug} canEdit={canEdit} />
    </div>
  );
}

// ---- Persona card ------------------------------------------------

function PersonaCard({
  tenantSlug,
  canEdit,
}: {
  tenantSlug: string;
  canEdit: boolean;
}) {
  const t = useTranslations("settings.ai.persona");
  const [persona, setPersona] = useState<Persona | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch(`/api/ai/persona?tenantSlug=${tenantSlug}`)
      .then((r) => r.json())
      .then((d) => setPersona(d.persona))
      .catch(() => setPersona(null))
      .finally(() => setLoading(false));
  }, [tenantSlug]);

  async function save() {
    if (!persona) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/ai/persona?tenantSlug=${tenantSlug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(persona),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      toast.success(t("savedToast"), { duration: 2000 });
      setDirty(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof Persona>(key: K, value: Persona[K]) {
    if (!persona) return;
    setPersona({ ...persona, [key]: value });
    setDirty(true);
  }

  return (
    <section className="space-y-3">
      <header className="flex items-start gap-3">
        <div className="flex size-9 items-center justify-center rounded-md bg-primary/10">
          <Bot className="size-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{t("heading")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
      </header>

      <Card className="space-y-4 p-5">
        {loading || !persona ? (
          <div className="flex items-center justify-center gap-2 py-4">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{t("loading")}</span>
          </div>
        ) : (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("roleLabel")}
              </label>
              <Input
                value={persona.role}
                onChange={(e) => update("role", e.target.value)}
                disabled={!canEdit}
                placeholder={t("rolePlaceholder")}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("customLabel")}
              </label>
              <textarea
                value={persona.customInstructions}
                onChange={(e) => update("customInstructions", e.target.value.slice(0, 4000))}
                disabled={!canEdit}
                rows={5}
                className="w-full rounded-md border border-border bg-background p-2 text-sm"
                placeholder={t("customPlaceholder")}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t("customNote")}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="rag-enabled"
                checked={persona.ragEnabled}
                onChange={(e) => update("ragEnabled", e.target.checked)}
                disabled={!canEdit}
              />
              <label htmlFor="rag-enabled" className="text-sm">
                {t("ragLabel")}
              </label>
            </div>

            {canEdit && (
              <div className="flex justify-end">
                <Button size="sm" onClick={save} disabled={!dirty || saving}>
                  {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                  {t("saveBtn")}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </section>
  );
}

// ---- Knowledge card ----------------------------------------------

function KnowledgeCard({
  tenantSlug,
  canEdit,
}: {
  tenantSlug: string;
  canEdit: boolean;
}) {
  const t = useTranslations("settings.ai.knowledge");
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [uploadOpen, setUploadOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-then-setState pattern, guarded with cancelled flag
    setLoading(true);
    fetch(`/api/ai/knowledge-documents?tenantSlug=${tenantSlug}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setDocs(d.documents ?? []);
      })
      .catch(() => {
        if (!cancelled) setDocs([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, refreshKey]);

  async function deleteDoc(id: string) {
    if (!confirm(t("confirmDelete"))) return;
    try {
      const res = await fetch(
        `/api/ai/knowledge-documents/${id}?tenantSlug=${tenantSlug}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      toast.success(t("deletedToast"), { duration: 1500 });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <section className="space-y-3">
      <header className="flex items-start gap-3">
        <div className="flex size-9 items-center justify-center rounded-md bg-violet-500/10">
          <Sparkles className="size-5 text-violet-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold tracking-tight">{t("heading")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => setUploadOpen(true)} className="gap-1.5">
            <Upload className="size-3.5" />
            {t("addBtn")}
          </Button>
        )}
      </header>

      <Card className="p-0">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{t("loading")}</span>
          </div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <FileText className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">{t("empty.title")}</p>
            <p className="max-w-md text-xs text-muted-foreground">
              {t("empty.subtitle")}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                {d.sourceType === "pdf" ? (
                  <FileText className="size-4 shrink-0 text-rose-600" />
                ) : d.sourceType === "url" ? (
                  <Globe className="size-4 shrink-0 text-blue-600" />
                ) : (
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium" title={d.title}>
                    {d.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {d.sourceType.toUpperCase()} · {d.chunkCount} chunks · {d.status}
                    {d.errorMessage && ` — ${d.errorMessage}`}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[10px] font-medium uppercase",
                    d.status === "ready"
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : d.status === "failed"
                        ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                        : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
                  )}
                >
                  {d.status}
                </span>
                {canEdit && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => deleteDoc(d.id)}
                    className="text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {uploadOpen && (
        <UploadModal
          tenantSlug={tenantSlug}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {
            setUploadOpen(false);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </section>
  );
}

function UploadModal({
  tenantSlug,
  onClose,
  onUploaded,
}: {
  tenantSlug: string;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const t = useTranslations("settings.ai.upload");
  const [mode, setMode] = useState<"text" | "pdf" | "url">("text");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    const toastId = toast.loading(t("processing"));
    try {
      let res: Response;
      if (mode === "pdf") {
        if (!file) {
          toast.error(t("errors.selectPdf"), { id: toastId });
          setSubmitting(false);
          return;
        }
        const form = new FormData();
        form.append("file", file);
        if (title) form.append("title", title);
        res = await fetch(`/api/ai/knowledge-documents?tenantSlug=${tenantSlug}`, {
          method: "POST",
          body: form,
        });
      } else if (mode === "url") {
        if (!url.trim()) {
          toast.error(t("errors.enterUrl"), { id: toastId });
          setSubmitting(false);
          return;
        }
        res = await fetch(`/api/ai/knowledge-documents?tenantSlug=${tenantSlug}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceType: "url",
            title: title.trim() || undefined,
            url: url.trim(),
          }),
        });
      } else {
        if (!title.trim() || !text.trim()) {
          toast.error(t("errors.titleAndText"), { id: toastId });
          setSubmitting(false);
          return;
        }
        res = await fetch(`/api/ai/knowledge-documents?tenantSlug=${tenantSlug}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceType: "text", title: title.trim(), text }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      toast.success(t("successAdded", { title: data.document.title, chunks: data.document.chunkCount }), {
        id: toastId,
        duration: 3000,
      });
      onUploaded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed", {
        id: toastId,
        duration: 5000,
      });
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
            <h3 className="text-base font-semibold">{t("title")}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex gap-1 rounded-md border border-border bg-muted/30 p-1">
          {(["text", "pdf", "url"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "flex-1 rounded-md px-2 py-1 text-xs font-medium",
                mode === m
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`modes.${m}`)}
            </button>
          ))}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            {t("titleLabel")} {mode === "pdf" && t("titleLabelPdfHint")}
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("titlePlaceholder")}
          />
        </div>

        {mode === "text" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("text.label")}
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              className="w-full rounded-md border border-border bg-background p-2 text-sm"
              placeholder={t("text.placeholder")}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t("text.summary", { chars: text.length.toLocaleString(), chunks: Math.ceil(text.length / 1000) })}
            </p>
          </div>
        )}

        {mode === "pdf" && (
          <div>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed border-border p-6 hover:bg-muted/20">
              {file ? (
                <>
                  <FileText className="size-6 text-rose-600" />
                  <span className="text-sm font-medium">{file.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {t("pdf.changeHint", { size: (file.size / 1024).toFixed(1) })}
                  </span>
                </>
              ) : (
                <>
                  <Upload className="size-5 text-muted-foreground" />
                  <span className="text-sm">{t("pdf.choose")}</span>
                </>
              )}
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setFile(f);
                }}
              />
            </label>
          </div>
        )}

        {mode === "url" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("url.label")}
            </label>
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://blog.example.com/ad-strategy-2026"
            />
          </div>
        )}

        <div className="flex justify-between gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            {t("cancel")}
          </Button>
          <Button size="sm" onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            {t("submit")}
          </Button>
        </div>
      </div>
    </div>
  );
}
