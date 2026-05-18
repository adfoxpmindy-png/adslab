"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Lightbulb, Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Meta Marketing API hard limit for Campaign/AdSet/Ad names is 400 chars.
// Meta UI truncates names in lists/tables around ~40 chars — past that
// the user can't see the rest of the name without hovering. We surface
// both thresholds: a yellow warning past 40, a red counter near 400.
const META_NAME_MAX = 400;
const META_NAME_TRUNCATE_WARN = 40;

type Template = {
  id: string;
  name: string;
  pattern: string;
  description: string | null;
  isDefault: boolean;
};

/**
 * Campaign name input that surfaces tenant naming templates as one-click
 * suggestions. When the user has saved templates in Settings, we show
 * chips like "Sale_0626" they can tap to fill the field. We also try to
 * detect what they're typing and confirm it matches an existing template.
 */
export function SmartNameField({
  tenantSlug,
  value,
  onChange,
  placeholder,
}: {
  tenantSlug: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const tr = useTranslations("common.smartNameField");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/naming-templates?tenantSlug=${tenantSlug}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setTemplates(d.templates ?? []);
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  // Rendered suggestions for default templates (BKK current date)
  const suggestions = useMemo(
    () => templates.filter((t) => t.isDefault).map((t) => ({ template: t, rendered: renderPattern(t.pattern) })),
    [templates],
  );

  // Check if current value matches any template's pattern shape
  const matchedTemplate = useMemo(() => {
    if (!value) return null;
    for (const t of templates) {
      try {
        const re = templateToRegex(t.pattern);
        if (re.test(value)) return t;
      } catch {
        // bad regex — skip
      }
    }
    return null;
  }, [value, templates]);

  const visibleSuggestions = showAllSuggestions ? suggestions : suggestions.slice(0, 3);

  const len = value.length;
  const overTruncate = len > META_NAME_TRUNCATE_WARN;
  const nearLimit = len > META_NAME_MAX - 50;

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, META_NAME_MAX))}
          placeholder={placeholder}
          maxLength={META_NAME_MAX}
          autoFocus
          className="pr-20"
        />
        <span
          className={cn(
            "pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] tabular-nums",
            nearLimit
              ? "text-rose-600 dark:text-rose-400"
              : overTruncate
                ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground",
          )}
        >
          {len}/{META_NAME_MAX}
        </span>
      </div>

      {/* Status line: matched template + length warning */}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        {value && matchedTemplate && (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <Check className="size-3" strokeWidth={3} />
            {tr("matchesTemplate", { name: matchedTemplate.name })}
          </span>
        )}
        {value && !matchedTemplate && templates.length > 0 && (
          <span className="text-muted-foreground">
            {tr("noTemplateMatch")}
          </span>
        )}
        {overTruncate && !nearLimit && (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            <AlertTriangle className="size-3" />
            {tr("truncateWarning", { limit: META_NAME_TRUNCATE_WARN })}
          </span>
        )}
        {nearLimit && (
          <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            <AlertTriangle className="size-3" />
            {tr("nearLimit", { limit: META_NAME_MAX })}
          </span>
        )}
      </div>

      {/* Template suggestion chips */}
      {loaded && suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">
            <Sparkles className="mr-0.5 inline-block size-3" />
            {tr("suggestions")}
          </span>
          {visibleSuggestions.map(({ template, rendered }) => {
            const active = value === rendered;
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => onChange(rendered)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-foreground hover:bg-muted",
                )}
                title={template.description ?? template.name}
              >
                <code className="font-medium">{rendered}</code>
                <span className="text-muted-foreground">({template.name})</span>
              </button>
            );
          })}
          {suggestions.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAllSuggestions((v) => !v)}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              {showAllSuggestions ? (
                <>
                  <X className="mr-0.5 inline-block size-3" />
                  {tr("collapse")}
                </>
              ) : (
                <>{tr("moreOthers", { count: suggestions.length - 3 })}</>
              )}
            </button>
          )}
        </div>
      )}

      {loaded && templates.length === 0 && (
        <p className="flex items-start gap-1 text-[11px] text-muted-foreground">
          <Lightbulb className="mt-0.5 size-3 shrink-0" />
          <span>{tr("noTemplatesHint")}</span>
        </p>
      )}
    </div>
  );
}

// ---- Pattern rendering + regex (mirrors src/lib/naming-template.ts) ----
// Replicated here client-side to avoid a fetch per template.

function renderPattern(pattern: string): string {
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
    .replace(/\{Custom\}/g, "");
}

function templateToRegex(pattern: string): RegExp {
  let rx = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "{") {
      const end = pattern.indexOf("}", i);
      if (end === -1) {
        rx += escapeRegex(pattern.slice(i));
        break;
      }
      const key = pattern.slice(i + 1, end);
      rx += placeholderRegex(key);
      i = end + 1;
    } else {
      rx += escapeRegex(ch);
      i++;
    }
  }
  return new RegExp(`^${rx}$`);
}

function placeholderRegex(key: string): string {
  switch (key) {
    case "MM":
    case "YY":
    case "DD":
      return "\\d{2}";
    case "YYYY":
      return "\\d{4}";
    case "Month":
      return "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";
    case "Custom":
      return ".*";
    default:
      return ".*?";
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
