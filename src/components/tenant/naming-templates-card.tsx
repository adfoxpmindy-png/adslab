"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Sparkles, Trash2, Type, X } from "lucide-react";
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

const PLACEHOLDER_HINTS = [
  { token: "{MM}", desc: "เดือน 2 หลัก" },
  { token: "{YY}", desc: "ปี 2 หลัก" },
  { token: "{YYYY}", desc: "ปี 4 หลัก" },
  { token: "{DD}", desc: "วัน 2 หลัก" },
  { token: "{Month}", desc: "เดือน (Jan/Feb/..)" },
  { token: "{Custom}", desc: "ค่ากำหนดเอง" },
];

/**
 * Renders a preview string for a template pattern by substituting
 * date placeholders with current (Bangkok) date values. Mirrors
 * `src/lib/naming-template.ts#renderTemplate`.
 */
function renderPreview(pattern: string): string {
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
    .replace(/\{Custom\}/g, "<กรอกเอง>");
}

export function NamingTemplatesCard({
  tenantSlug,
  canEdit,
}: {
  tenantSlug: string;
  canEdit: boolean;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
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
    if (!confirm("ลบ template นี้?")) return;
    try {
      const res = await fetch(
        `/api/naming-templates/${id}?tenantSlug=${tenantSlug}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "ลบไม่สำเร็จ");
      toast.success("ลบแล้ว", { duration: 2000 });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
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
            <h2 className="text-xl font-semibold tracking-tight">Naming Standards</h2>
            <span className="rounded-md bg-orange-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-orange-700 dark:bg-orange-950/60 dark:text-orange-300">
              Templates
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            กำหนดมาตรฐานชื่อ Campaign — Campaign Builder จะแนะนำชื่อตาม template
            อัตโนมัติ (เช่น <code>Sale_{`{MM}{YY}`}</code> → Sale_0626)
          </p>
        </div>
      </header>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm">
            <span className="text-muted-foreground">Templates:</span>{" "}
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
                AI วิเคราะห์ชื่อ
              </Button>
              <Button
                size="sm"
                onClick={() => setShowCreate(true)}
                className="gap-1.5"
              >
                <Plus className="size-3.5" />
                เพิ่ม Template
              </Button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">กำลังโหลด...</span>
          </div>
        ) : templates.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            ยังไม่มี template — กดเพิ่ม template หรือใช้ AI วิเคราะห์ชื่อที่มีอยู่
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {templates.map((t) => (
              <li key={t.id} className="flex items-start gap-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{t.name}</span>
                    {t.isDefault && (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium uppercase text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        Suggest
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Pattern: <code className="text-foreground">{t.pattern}</code>
                    {" · "}Preview:{" "}
                    <code className="text-foreground">{renderPreview(t.pattern)}</code>
                  </p>
                  {t.description && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {t.description}
                    </p>
                  )}
                </div>
                {canEdit && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => deleteTemplate(t.id)}
                    className="text-destructive"
                    title="ลบ template"
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
  const [name, setName] = useState("");
  const [pattern, setPattern] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!name.trim() || !pattern.trim()) {
      return toast.error("ชื่อ + pattern ต้องไม่ว่าง");
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
      if (!res.ok) throw new Error(data.error ?? "สร้างไม่สำเร็จ");
      toast.success("✓ เพิ่ม template แล้ว", { duration: 2500 });
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ไม่สำเร็จ");
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
            <h3 className="text-base font-semibold">เพิ่ม Naming Template</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              ใส่ placeholder ตามรายการด้านล่างเพื่อให้ Campaign Builder แทนค่าให้
            </p>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            ชื่อ Template
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น Sale Campaign"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Pattern
          </label>
          <Input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="เช่น Sale_{MM}{YY}"
          />
          {pattern && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Preview ตอนนี้:{" "}
              <code className="font-medium text-foreground">
                {renderPreview(pattern)}
              </code>
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            {PLACEHOLDER_HINTS.map((h) => (
              <button
                key={h.token}
                type="button"
                onClick={() => setPattern((p) => p + h.token)}
                className="rounded-md border border-border bg-muted/30 px-2 py-0.5 text-[11px] hover:bg-muted"
                title={h.desc}
              >
                <code>{h.token}</code>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            คำอธิบาย (optional)
          </label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="เช่น ใช้สำหรับ campaign ลดราคารายเดือน"
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            ยกเลิก
          </Button>
          <Button
            size="sm"
            onClick={submit}
            disabled={submitting || !name.trim() || !pattern.trim()}
          >
            {submitting && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            สร้าง
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
      if (!res.ok) throw new Error(data.error ?? "ไม่สำเร็จ");
      const sugg = data.suggestion as {
        templates?: AiSuggestion[];
        notes?: string;
      };
      setSuggestions(sugg?.templates ?? []);
      setNotes(sugg?.notes ?? null);
      setAnalyzed(data.analyzed ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI วิเคราะห์ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
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
      if (!res.ok) throw new Error(data.error ?? "เพิ่มไม่สำเร็จ");
      toast.success(`✓ เพิ่ม "${s.name}"`, { duration: 2000 });
      // Allow user to accept more without closing — refresh list happens via parent on close
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ไม่สำเร็จ");
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
              AI วิเคราะห์ชื่อ Campaign
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              อ่านชื่อ campaign ที่มีอยู่ → เสนอ template ที่ใช้บ่อย
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
              กำลังให้ AI วิเคราะห์...
            </span>
          </div>
        ) : error ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
            {error}
          </div>
        ) : (
          <>
            <p className="text-[11px] text-muted-foreground">
              วิเคราะห์ {analyzed} campaign names — ได้ {suggestions.length} suggestions
            </p>
            {notes && (
              <p className="rounded-md border border-blue-200 bg-blue-50/60 p-2 text-xs text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
                💡 {notes}
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
                      Pattern: <code className="text-foreground">{s.pattern}</code>
                      {" · "}Preview:{" "}
                      <code className="text-foreground">{renderPreview(s.pattern)}</code>
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
                    + ใช้
                  </Button>
                </li>
              ))}
            </ul>
            {suggestions.length === 0 && (
              <p className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                AI ไม่พบ pattern ที่ชัดเจน — ลองสร้าง template เองได้
              </p>
            )}
          </>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose}>
            ปิด
          </Button>
          <Button size="sm" onClick={onAccepted}>
            เสร็จ
          </Button>
        </div>
      </div>
    </div>
  );
}
