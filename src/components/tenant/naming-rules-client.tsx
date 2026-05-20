"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "@/i18n/routing";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { objectiveLabel } from "@/lib/goals/meta-objective-map";

type GoalObjective =
  | "AWARENESS"
  | "ENGAGEMENT"
  | "TRAFFIC"
  | "LEADS"
  | "SALES"
  | "APP_PROMOTION"
  | "STORE_VISITS";

const OBJECTIVES: GoalObjective[] = [
  "AWARENESS",
  "ENGAGEMENT",
  "TRAFFIC",
  "LEADS",
  "SALES",
  "APP_PROMOTION",
  "STORE_VISITS",
];

type Rule = {
  id: string;
  pattern: string;
  isRegex: boolean;
  objective: GoalObjective;
  priority: number;
};

type Props = {
  tenantSlug: string;
  initialRules: Rule[];
  sampleCampaigns: { id: string; name: string }[];
  canEdit: boolean;
};

export function NamingRulesClient({
  tenantSlug,
  initialRules,
  sampleCampaigns,
  canEdit,
}: Props) {
  const t = useTranslations("pages.naming.rules");
  const tObj = useTranslations("pages.goals.objective");
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Draft for a new rule
  const [pattern, setPattern] = useState("");
  const [isRegex, setIsRegex] = useState(false);
  const [objective, setObjective] = useState<GoalObjective>("AWARENESS");
  const [priority, setPriority] = useState(0);
  const [creating, setCreating] = useState(false);

  // Live preview: which sample campaigns match the draft pattern
  const previewMatches = useMemo(() => {
    if (!pattern.trim()) return [];
    if (isRegex) {
      try {
        const re = new RegExp(pattern, "i");
        return sampleCampaigns.filter((c) => re.test(c.name));
      } catch {
        return [];
      }
    }
    const q = pattern.toLowerCase();
    return sampleCampaigns.filter((c) => c.name.toLowerCase().includes(q));
  }, [pattern, isRegex, sampleCampaigns]);

  async function createRule(e: React.FormEvent) {
    e.preventDefault();
    if (!pattern.trim()) {
      toast.error(t("errors.enterPattern"));
      return;
    }
    setCreating(true);
    const toastId = toast.loading(t("toasts.creating"));
    try {
      const res = await fetch(`/api/naming-rules?tenantSlug=${tenantSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern, isRegex, objective, priority }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : t("errors.createFail"));
      }
      toast.success(t("toasts.created"), { id: toastId });
      setPattern("");
      setPriority(0);
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.createFail"), { id: toastId });
    } finally {
      setCreating(false);
    }
  }

  async function deleteRule(id: string) {
    if (!confirm(t("toasts.confirmDelete"))) return;
    const toastId = toast.loading(t("toasts.deleting"));
    try {
      const res = await fetch(`/api/naming-rules?tenantSlug=${tenantSlug}&id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(t("errors.deleteFail"));
      toast.success(t("toasts.deleted"), { id: toastId });
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.deleteFail"), { id: toastId });
    }
  }

  async function adjustPriority(rule: Rule, delta: number) {
    const next = Math.max(0, Math.min(1000, rule.priority + delta));
    if (next === rule.priority) return;
    try {
      const res = await fetch(`/api/naming-rules?tenantSlug=${tenantSlug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id, priority: next }),
      });
      if (!res.ok) throw new Error();
      startTransition(() => router.refresh());
    } catch {
      toast.error(t("errors.priorityFail"));
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Left: existing rules + add-new form spans 2 cols */}
      <div className="space-y-4 lg:col-span-2">
        {canEdit && (
          <Card className="px-4 py-4">
            <h2 className="mb-3 text-sm font-semibold">{t("form.heading")}</h2>
            <form onSubmit={createRule} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    {t("form.patternLabel")}
                  </label>
                  <Input
                    value={pattern}
                    onChange={(e) => setPattern(e.target.value)}
                    placeholder={isRegex ? t("form.patternPlaceholderRegex") : t("form.patternPlaceholderText")}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    {t("form.objectiveLabel")}
                  </label>
                  <select
                    value={objective}
                    onChange={(e) => setObjective(e.target.value as GoalObjective)}
                    className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
                  >
                    {OBJECTIVES.map((o) => (
                      <option key={o} value={o}>
                        {objectiveLabel(o, tObj)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    {t("form.priorityLabel")}
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={1000}
                    value={priority}
                    onChange={(e) => setPriority(Number(e.target.value))}
                    className="w-20"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isRegex}
                    onChange={(e) => setIsRegex(e.target.checked)}
                    className="size-4"
                  />
                  {t("form.useRegex")}
                </label>
                <Button type="submit" disabled={creating} className="gap-2">
                  <Plus className="size-3.5" />
                  {t("form.addBtn")}
                </Button>
              </div>
            </form>
          </Card>
        )}

        <Card className="p-0">
          <div className="border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">
            {t("list.header", { count: initialRules.length })}
          </div>
          {initialRules.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t("list.empty")}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {initialRules.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-2.5"
                >
                  <div className="flex items-center gap-1">
                    <span className="tabular-nums text-xs text-muted-foreground w-8 text-right">
                      {r.priority}
                    </span>
                    {canEdit && (
                      <div className="flex flex-col">
                        <button
                          type="button"
                          onClick={() => adjustPriority(r, 10)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ChevronUp className="size-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => adjustPriority(r, -10)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ChevronDown className="size-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {r.pattern}
                    </code>
                    {r.isRegex && (
                      <span className="ml-2 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] uppercase text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                        regex
                      </span>
                    )}
                  </div>
                  <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {objectiveLabel(r.objective, tObj)}
                  </span>
                  {canEdit && (
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => deleteRule(r.id)}
                      title={t("list.deleteTooltip")}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Right: live preview pane */}
      <Card className="h-fit p-0">
        <div className="border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">
          {t("preview.heading")}
          {pattern && (
            <span className="ml-2 text-foreground">
              {previewMatches.length} / {sampleCampaigns.length}
            </span>
          )}
        </div>
        {!pattern.trim() ? (
          <div className="py-8 px-4 text-center text-xs text-muted-foreground">
            {t("preview.promptToType")}
          </div>
        ) : previewMatches.length === 0 ? (
          <div className="py-8 px-4 text-center text-xs text-muted-foreground">
            {t("preview.noMatch")}
          </div>
        ) : (
          <ul className="max-h-[420px] divide-y divide-border overflow-y-auto">
            {previewMatches.slice(0, 50).map((c) => (
              <li
                key={c.id}
                className={cn("truncate px-4 py-1.5 text-xs", "hover:bg-muted/30")}
                title={c.name}
              >
                {c.name}
              </li>
            ))}
            {previewMatches.length > 50 && (
              <li className="px-4 py-1.5 text-xs italic text-muted-foreground">
                {t("preview.andMore", { n: previewMatches.length - 50 })}
              </li>
            )}
          </ul>
        )}
      </Card>
    </div>
  );
}
