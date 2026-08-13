"use client";

import { useMemo, useState, useTransition } from "react";
import { Search, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  HookConceptShape,
  HookConceptStatus,
  HookConceptSource,
} from "@/lib/hooks/types";

type Props = {
  tenantSlug: string;
  canEdit: boolean;
  concepts: HookConceptShape[];
  onChanged: (updated: HookConceptShape[]) => void;
};

const STATUSES: HookConceptStatus[] = ["draft", "testing", "winner", "archived"];
const SOURCES: HookConceptSource[] = [
  "generated",
  "iteration",
  "analyzed",
  "manual",
];

export function ConceptBoard({ tenantSlug, canEdit, concepts, onChanged }: Props) {
  const t = useTranslations("pages.hookLab.board");
  const [statusFilter, setStatusFilter] = useState<HookConceptStatus | "all">(
    "all",
  );
  const [sourceFilter, setSourceFilter] = useState<HookConceptSource | "all">(
    "all",
  );
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return concepts.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (sourceFilter !== "all" && c.source !== sourceFilter) return false;
      if (q) {
        const hay = [c.textHookTh, c.textHookEn, c.bodyOutline, c.hypothesis]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [concepts, statusFilter, sourceFilter, query]);

  const updateStatus = async (id: string, status: HookConceptStatus) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/ai/hooks/concepts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantSlug, status }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { concept: HookConceptShape };
      startTransition(() => {
        onChanged(
          concepts.map((c) => (c.id === id ? json.concept : c)),
        );
      });
      toast.success(t("statusChanged"));
    } catch (err) {
      toast.error(
        t("statusChangeFail", {
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setBusyId(null);
    }
  };

  const removeConcept = async (id: string) => {
    if (!window.confirm(t("deleteConfirm"))) return;
    setBusyId(id);
    try {
      const res = await fetch(
        `/api/ai/hooks/concepts/${id}?hard=true`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantSlug }),
        },
      );
      if (!res.ok) throw new Error(String(res.status));
      startTransition(() => {
        onChanged(concepts.filter((c) => c.id !== id));
      });
      toast.success(t("deleted"));
    } catch (err) {
      toast.error(
        t("deleteFail", {
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            {t("heading")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t("subtitle", { total: concepts.length, shown: filtered.length })}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-7"
            placeholder={t("searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <FilterGroup
          label={t("statusLabel")}
          options={[{ value: "all", label: t("statusAll") }].concat(
            STATUSES.map((s) => ({
              value: s,
              label: t(`statusOptions.${s}`),
            })),
          )}
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as HookConceptStatus | "all")}
        />
        <FilterGroup
          label={t("sourceLabel")}
          options={[{ value: "all", label: t("sourceAll") }].concat(
            SOURCES.map((s) => ({
              value: s,
              label: t(`sourceOptions.${s}`),
            })),
          )}
          value={sourceFilter}
          onChange={(v) => setSourceFilter(v as HookConceptSource | "all")}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {concepts.length === 0 ? t("emptyNoConcepts") : t("emptyFiltered")}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-2">{t("colHook")}</th>
                <th className="px-2 py-2">{t("colSource")}</th>
                <th className="px-2 py-2">{t("colStatus")}</th>
                <th className="px-2 py-2">{t("colRisk")}</th>
                <th className="px-2 py-2 text-right">{t("colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="max-w-[320px] px-2 py-2">
                    <p className="truncate font-medium text-foreground">
                      {c.textHookTh ?? c.textHookEn ?? t("colHookEmpty")}
                    </p>
                  </td>
                  <td className="px-2 py-2 text-muted-foreground">
                    {t(`sourceOptions.${c.source}`)}
                  </td>
                  <td className="px-2 py-2">
                    {canEdit ? (
                      <select
                        aria-label={t("statusLabel")}
                        className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px]"
                        value={c.status}
                        disabled={busyId === c.id}
                        onChange={(e) =>
                          updateStatus(
                            c.id,
                            e.target.value as HookConceptStatus,
                          )
                        }
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {t(`statusOptions.${s}`)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-muted-foreground">
                        {t(`statusOptions.${c.status}`)}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-muted-foreground">
                    {c.andromedaRisk ?? "—"}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {canEdit && (
                      <Button
                        size="xs"
                        variant="ghost"
                        className="text-rose-600 hover:bg-rose-500/10 dark:text-rose-300"
                        disabled={busyId === c.id}
                        onClick={() => removeConcept(c.id)}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function FilterGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span>{label}</span>
      <select
        className={cn(
          "rounded-md border border-border bg-background px-1.5 py-0.5 text-xs text-foreground",
        )}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
