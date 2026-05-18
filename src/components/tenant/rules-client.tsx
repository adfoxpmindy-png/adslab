"use client";

import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  Shield,
  Sparkles,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { BrandButton, SectionHeader } from "@/components/ui-system";
import { formatDate, formatDateTime } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import {
  ACTIONS,
  METRICS,
  MIN_INTERVAL_MINUTES,
  OPS,
  WINDOWS,
  type RuleAction,
  type RuleCondition,
} from "@/lib/rules/types";
import type { PlanKey } from "@/lib/billing/plans";

type RuleSummary = {
  id: string;
  name: string;
  enabled: boolean;
  condition: RuleCondition;
  action: RuleAction;
  targetIds: string[];
  minIntervalMinutes: number;
  lastFiredAt: string | null;
  createdAt: string;
};

type EntityOption = { id: string; name: string };

type Candidate = {
  name: string;
  condition: RuleCondition;
  action: RuleAction;
  rationale: string;
};

type Props = {
  tenantSlug: string;
  canEdit: boolean;
  initialRules: RuleSummary[];
  cap: number;
  planKey: PlanKey | null;
  campaigns: EntityOption[];
  adSets: EntityOption[];
};

const OP_LABELS: Record<(typeof OPS)[number], string> = {
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
};

// Translator type for label-builder helpers. Use the bare `useTranslations`
// return type so any namespaced translator (e.g. `useTranslations("pages.rules")`)
// is assignable — the actual Translator is a callable object with extra
// methods (.rich/.markup/.raw/.has), which a plain function signature can't model.
type TFn = ReturnType<typeof useTranslations>;

function metricLabels(t: TFn): Record<(typeof METRICS)[number], string> {
  return {
    cpv: t("metric.cpv"),
    roas: t("metric.roas"),
    spend: t("metric.spend"),
    frequency: t("metric.frequency"),
    ctr: t("metric.ctr"),
  };
}

function actionLabels(t: TFn): Record<RuleAction, string> {
  return {
    pause_adset: t("action.pauseAdset"),
    pause_campaign: t("action.pauseCampaign"),
    notify_email: t("action.notifyEmail"),
    notify_in_app: t("action.notifyInApp"),
  };
}

function intervalLabels(t: TFn): Record<number, string> {
  return {
    60: t("interval.every1h"),
    360: t("interval.every6h"),
    720: t("interval.every12h"),
    1440: t("interval.every24h"),
  };
}

const EMPTY_CONDITION: RuleCondition = {
  metric: "cpv",
  op: "gt",
  value: 5,
  windowHours: 2,
  scope: "adset",
};

export function RulesClient({
  tenantSlug,
  canEdit,
  initialRules,
  cap,
  planKey,
  campaigns,
  adSets,
}: Props) {
  const tPages = useTranslations("pages.rules");
  const [rules, setRules] = useState(initialRules);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RuleSummary | null>(null);
  const [historyForRuleId, setHistoryForRuleId] = useState<string | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  const activeCount = rules.filter((r) => r.enabled).length;
  const canCreate = canEdit && activeCount < cap;

  if (cap === 0) {
    return <UpsellCard tenantSlug={tenantSlug} planKey={planKey} />;
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader
          title={tPages("header.summary", {
            count: rules.length,
            unit: rules.length === 1 ? tPages("header.unitOne") : tPages("header.unitMany"),
            active: activeCount,
            cap,
          })}
          subtitle={tPages("header.subtitle")}
        />
        <div className="flex gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={() => setSuggestionsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-200"
            >
              <Sparkles className="size-4" />
              {tPages("header.askAi")}
            </button>
          )}
          {canEdit && (
            <BrandButton
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              disabled={!canCreate}
              title={!canCreate ? tPages("header.atCapTooltip") : undefined}
            >
              <Plus className="size-4" />
              {tPages("header.addRule")}
            </BrandButton>
          )}
        </div>
      </div>

      {rules.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
          <Shield className="mx-auto mb-3 size-10 text-muted-foreground" />
          <p className="text-sm font-medium">{tPages("empty.title")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {tPages("empty.description")}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {rules.map((rule) => (
          <RuleRow
            key={rule.id}
            rule={rule}
            canEdit={canEdit}
            tenantSlug={tenantSlug}
            onToggle={(enabled) => updateRule(rule.id, { enabled })}
            onEdit={() => {
              setEditing(rule);
              setFormOpen(true);
            }}
            onDelete={() => deleteRule(rule.id)}
            onHistory={() => setHistoryForRuleId(rule.id)}
          />
        ))}
      </div>

      {formOpen && (
        <RuleFormModal
          tenantSlug={tenantSlug}
          existing={editing}
          campaigns={campaigns}
          adSets={adSets}
          onCancel={() => setFormOpen(false)}
          onSaved={(saved) => {
            setRules((rs) =>
              editing
                ? rs.map((r) => (r.id === saved.id ? saved : r))
                : [saved, ...rs],
            );
            setFormOpen(false);
          }}
        />
      )}

      {historyForRuleId && (
        <RuleHistoryDrawer
          tenantSlug={tenantSlug}
          ruleId={historyForRuleId}
          ruleName={rules.find((r) => r.id === historyForRuleId)?.name ?? ""}
          onClose={() => setHistoryForRuleId(null)}
        />
      )}

      {suggestionsOpen && (
        <SuggestionsModal
          tenantSlug={tenantSlug}
          onClose={() => setSuggestionsOpen(false)}
          onAccept={(saved) => setRules((rs) => [saved, ...rs])}
        />
      )}
    </>
  );

  async function updateRule(id: string, patch: Partial<RuleSummary>) {
    try {
      const res = await fetch(
        `/api/rules/${id}?tenantSlug=${encodeURIComponent(tenantSlug)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`);
      }
      const { rule } = (await res.json()) as { rule: RuleSummary };
      setRules((rs) => rs.map((r) => (r.id === id ? { ...r, ...rule } : r)));
    } catch (e) {
      toast.error(tPages("toast.updateFailed", { message: (e as Error).message }));
    }
  }

  async function deleteRule(id: string) {
    if (!confirm(tPages("toast.confirmDelete"))) return;
    try {
      const res = await fetch(
        `/api/rules/${id}?tenantSlug=${encodeURIComponent(tenantSlug)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRules((rs) => rs.filter((r) => r.id !== id));
      toast.success(tPages("toast.deleteSuccess"));
    } catch (e) {
      toast.error(tPages("toast.deleteFailed", { message: (e as Error).message }));
    }
  }
}

function RuleRow({
  rule,
  canEdit,
  tenantSlug,
  onToggle,
  onEdit,
  onDelete,
  onHistory,
}: {
  rule: RuleSummary;
  canEdit: boolean;
  tenantSlug: string;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onHistory: () => void;
}) {
  const tPages = useTranslations("pages.rules");
  const locale = useLocale();
  const ACTION_LABELS = actionLabels(tPages);
  const INTERVAL_LABELS = intervalLabels(tPages);
  const [testing, setTesting] = useState(false);
  async function handleTest() {
    setTesting(true);
    try {
      const res = await fetch(
        `/api/rules/${rule.id}/run?tenantSlug=${encodeURIComponent(tenantSlug)}`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { stats: { evaluated: number; fired: number } };
      toast.success(
        `Test: evaluated ${body.stats.evaluated} target(s) — ${body.stats.fired} matched`,
      );
    } catch (e) {
      toast.error(tPages("toast.testFailed", { message: (e as Error).message }));
    } finally {
      setTesting(false);
    }
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-card px-4 py-3 transition-colors",
        rule.enabled ? "border-border" : "border-border/60 bg-card/50 opacity-75",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-3 min-w-0">
          <Toggle
            checked={rule.enabled}
            onChange={(v) => onToggle(v)}
            disabled={!canEdit}
          />
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={onEdit}
              disabled={!canEdit}
              className="block w-full truncate text-left text-sm font-medium hover:underline"
              title={rule.name}
            >
              {rule.name}
            </button>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              <span className="font-mono">
                {rule.condition.metric.toUpperCase()} {OP_LABELS[rule.condition.op]}{" "}
                {rule.condition.value}
              </span>{" "}
              {tPages("row.inWindow", {
                hours: rule.condition.windowHours,
                scope: rule.condition.scope,
              })}{" "}
              → {ACTION_LABELS[rule.action]} ·{" "}
              {tPages("row.checkEvery", { interval: INTERVAL_LABELS[rule.minIntervalMinutes] })}
              {rule.lastFiredAt && (
                <>
                  {" · "}
                  {tPages("row.lastFired", {
                    date: formatDate(new Date(rule.lastFiredAt), locale),
                  })}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !canEdit}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-50"
            title={tPages("row.testTooltip")}
          >
            {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
          </button>
          <button
            type="button"
            onClick={onHistory}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
            title={tPages("row.historyTooltip")}
          >
            <Clock className="size-3.5" />
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title={tPages("row.deleteTooltip")}
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RuleFormModal({
  tenantSlug,
  existing,
  campaigns,
  adSets,
  onCancel,
  onSaved,
}: {
  tenantSlug: string;
  existing: RuleSummary | null;
  campaigns: EntityOption[];
  adSets: EntityOption[];
  onCancel: () => void;
  onSaved: (rule: RuleSummary) => void;
}) {
  const tPages = useTranslations("pages.rules");
  const METRIC_LABELS = metricLabels(tPages);
  const ACTION_LABELS = actionLabels(tPages);
  const INTERVAL_LABELS = intervalLabels(tPages);
  const [name, setName] = useState(existing?.name ?? "");
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [cond, setCond] = useState<RuleCondition>(existing?.condition ?? EMPTY_CONDITION);
  const [action, setAction] = useState<RuleAction>(existing?.action ?? "pause_adset");
  const [targetIds, setTargetIds] = useState<string[]>(existing?.targetIds ?? []);
  const [minInterval, setMinInterval] = useState<number>(existing?.minIntervalMinutes ?? 60);
  const [saving, startSaving] = useTransition();

  const targetOptions = cond.scope === "campaign" ? campaigns : adSets;

  function handleSave() {
    if (!name.trim()) {
      toast.error(tPages("toast.needName"));
      return;
    }
    startSaving(async () => {
      try {
        const isEdit = existing !== null;
        const url = isEdit
          ? `/api/rules/${existing.id}?tenantSlug=${encodeURIComponent(tenantSlug)}`
          : `/api/rules?tenantSlug=${encodeURIComponent(tenantSlug)}`;
        const res = await fetch(url, {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            enabled,
            condition: cond,
            action,
            targetIds,
            minIntervalMinutes: minInterval,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`);
        }
        const { rule } = (await res.json()) as { rule: RuleSummary };
        onSaved(rule);
        toast.success(
          isEdit ? tPages("toast.saveSuccessEdited") : tPages("toast.saveSuccessCreated"),
        );
      } catch (e) {
        toast.error(tPages("toast.saveFailed", { message: (e as Error).message }));
      }
    });
  }

  return (
    <ModalShell
      title={existing ? tPages("form.editTitle") : tPages("form.createTitle")}
      onClose={onCancel}
    >
      <div className="space-y-4">
        <Field label={tPages("form.nameLabel")}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={tPages("form.namePlaceholder")}
            maxLength={120}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={tPages("form.scopeLabel")}>
            <select
              value={cond.scope}
              onChange={(e) => setCond({ ...cond, scope: e.target.value as RuleCondition["scope"] })}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="adset">{tPages("form.scopeAdset")}</option>
              <option value="campaign">{tPages("form.scopeCampaign")}</option>
            </select>
          </Field>
          <Field label={tPages("form.metricLabel")}>
            <select
              value={cond.metric}
              onChange={(e) =>
                setCond({ ...cond, metric: e.target.value as RuleCondition["metric"] })
              }
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              {METRICS.map((m) => (
                <option key={m} value={m}>
                  {METRIC_LABELS[m]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label={tPages("form.operatorLabel")}>
            <select
              value={cond.op}
              onChange={(e) => setCond({ ...cond, op: e.target.value as RuleCondition["op"] })}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              {OPS.map((o) => (
                <option key={o} value={o}>
                  {OP_LABELS[o]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={tPages("form.valueLabel")}>
            <Input
              type="number"
              step="any"
              value={cond.value}
              onChange={(e) => setCond({ ...cond, value: Number(e.target.value) })}
            />
          </Field>
          <Field label={tPages("form.windowLabel")}>
            <select
              value={cond.windowHours}
              onChange={(e) =>
                setCond({ ...cond, windowHours: Number(e.target.value) as RuleCondition["windowHours"] })
              }
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              {WINDOWS.map((w) => (
                <option key={w} value={w}>
                  {w}h
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label={tPages("form.actionLabel")}>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as RuleAction)}
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
          >
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {ACTION_LABELS[a]}
              </option>
            ))}
          </select>
        </Field>

        <Field label={tPages("form.intervalLabel")}>
          <select
            value={minInterval}
            onChange={(e) => setMinInterval(Number(e.target.value))}
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
          >
            {MIN_INTERVAL_MINUTES.map((m) => (
              <option key={m} value={m}>
                {INTERVAL_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label={
            cond.scope === "campaign"
              ? tPages("form.targetLabelCampaign")
              : tPages("form.targetLabelAdSet")
          }
        >
          <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-background p-2 text-xs">
            {targetOptions.length === 0 ? (
              <p className="text-muted-foreground">{tPages("form.noTargets")}</p>
            ) : (
              targetOptions.slice(0, 80).map((t) => (
                <label key={t.id} className="flex items-center gap-2 py-1 hover:bg-accent/50">
                  <input
                    type="checkbox"
                    checked={targetIds.includes(t.id)}
                    onChange={(e) =>
                      setTargetIds(
                        e.target.checked
                          ? [...targetIds, t.id]
                          : targetIds.filter((id) => id !== t.id),
                      )
                    }
                  />
                  <span className="truncate">{t.name}</span>
                </label>
              ))
            )}
          </div>
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          {tPages("form.enableNow")}
        </label>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-4 py-2 text-sm hover:bg-accent"
        >
          {tPages("form.cancel")}
        </button>
        <BrandButton onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          {existing ? tPages("form.save") : tPages("form.createBtn")}
        </BrandButton>
      </div>
    </ModalShell>
  );
}

function RuleHistoryDrawer({
  tenantSlug,
  ruleId,
  ruleName,
  onClose,
}: {
  tenantSlug: string;
  ruleId: string;
  ruleName: string;
  onClose: () => void;
}) {
  const tPages = useTranslations("pages.rules");
  const locale = useLocale();
  const [runs, setRuns] = useState<Array<{
    id: string;
    tickAt: string;
    evaluatedMetric: string;
    evaluatedValue: number | null;
    threshold: number;
    matched: boolean;
    status: string;
    actionResult: string | null;
    errorMessage: string | null;
    targetId: string;
  }> | null>(null);

  useEffect(() => {
    fetch(`/api/rules/${ruleId}/runs?tenantSlug=${encodeURIComponent(tenantSlug)}&limit=100`)
      .then((r) => r.json())
      .then((b: { runs: typeof runs }) => setRuns(b.runs ?? []))
      .catch(() => setRuns([]));
  }, [ruleId, tenantSlug]);

  return (
    <ModalShell title={tPages("history.title", { ruleName })} onClose={onClose}>
      {runs === null ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
          {tPages("history.loading")}
        </p>
      ) : runs.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {tPages("history.empty")}
        </p>
      ) : (
        <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
          {runs.map((r) => (
            <div
              key={r.id}
              className={cn(
                "rounded-md border px-3 py-2 text-xs",
                r.matched && r.actionResult === "fired"
                  ? "border-emerald-300 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20"
                  : r.status === "error"
                  ? "border-destructive/30 bg-destructive/5"
                  : r.matched
                  ? "border-amber-300 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/20"
                  : "border-border bg-card/50",
              )}
            >
              <div className="flex justify-between gap-2">
                <span className="font-mono">
                  {r.evaluatedMetric.toUpperCase()}{" "}
                  {r.evaluatedValue !== null ? r.evaluatedValue.toFixed(2) : "—"}{" "}
                  vs {r.threshold}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {formatDateTime(r.tickAt, locale)}
                </span>
              </div>
              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {r.status} {r.actionResult && `· action ${r.actionResult}`} · target {r.targetId}
                {r.errorMessage && <> · {r.errorMessage}</>}
              </div>
            </div>
          ))}
        </div>
      )}
    </ModalShell>
  );
}

function SuggestionsModal({
  tenantSlug,
  onClose,
  onAccept,
}: {
  tenantSlug: string;
  onClose: () => void;
  onAccept: (saved: RuleSummary) => void;
}) {
  const tPages = useTranslations("pages.rules");
  const ACTION_LABELS = actionLabels(tPages);
  const [loading, startLoading] = useTransition();
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);

  function loadSuggestions() {
    startLoading(async () => {
      try {
        const res = await fetch(
          `/api/rules/suggest?tenantSlug=${encodeURIComponent(tenantSlug)}`,
          { method: "POST" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { candidates: Candidate[] };
        setCandidates(body.candidates ?? []);
      } catch (e) {
        toast.error(tPages("suggest.aiError", { message: (e as Error).message }));
      }
    });
  }

  async function accept(c: Candidate) {
    setAccepting(c.name);
    try {
      const res = await fetch(`/api/rules?tenantSlug=${encodeURIComponent(tenantSlug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: c.name,
          condition: c.condition,
          action: c.action,
          targetIds: [],
          enabled: false, // user opts in by toggling
          minIntervalMinutes: 60,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.message ?? b.error ?? `HTTP ${res.status}`);
      }
      const { rule } = (await res.json()) as { rule: RuleSummary };
      onAccept(rule);
      setCandidates((cs) => cs?.filter((x) => x.name !== c.name) ?? null);
      toast.success(tPages("suggest.addSuccess", { name: c.name }));
    } catch (e) {
      toast.error(tPages("suggest.addFailed", { message: (e as Error).message }));
    } finally {
      setAccepting(null);
    }
  }

  return (
    <ModalShell title={tPages("suggest.title")} onClose={onClose}>
      {!candidates && !loading && (
        <div className="py-6 text-center">
          <Sparkles className="mx-auto mb-3 size-10 text-violet-500" />
          <p className="text-sm">
            {tPages("suggest.intro")}
          </p>
          <BrandButton onClick={loadSuggestions} className="mt-4">
            {tPages("suggest.askThree")}
          </BrandButton>
        </div>
      )}
      {loading && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
          {tPages("suggest.thinking")}
        </p>
      )}
      {candidates && candidates.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {tPages("suggest.noCandidates")}
        </p>
      )}
      {candidates && candidates.length > 0 && (
        <div className="space-y-2">
          {candidates.map((c) => (
            <div key={c.name} className="rounded-xl border border-border bg-card p-3">
              <p className="text-sm font-medium">{c.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{c.rationale}</p>
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                {c.condition.metric.toUpperCase()} {OP_LABELS[c.condition.op]}{" "}
                {c.condition.value}{" "}
                {tPages("suggest.inWindow", {
                  hours: c.condition.windowHours,
                  scope: c.condition.scope,
                })}{" "}
                → {ACTION_LABELS[c.action]}
              </p>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => accept(c)}
                  disabled={accepting === c.name}
                  className="inline-flex items-center gap-1.5 rounded-md border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100"
                >
                  {accepting === c.name ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Plus className="size-3" />
                  )}
                  {tPages("suggest.addBtn")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </ModalShell>
  );
}

function UpsellCard({ tenantSlug, planKey }: { tenantSlug: string; planKey: PlanKey | null }) {
  const tPages = useTranslations("pages.rules");
  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-8 text-center dark:border-violet-900 dark:bg-violet-950/20">
      <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-brand-gradient text-white">
        <Shield className="size-6" />
      </div>
      <p className="text-base font-semibold">{tPages("upsell.title")}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {tPages("upsell.currentPlan")}{" "}
        <code>{planKey ?? tPages("upsell.trialOrNone")}</code>
        {tPages("upsell.upgradeNote")}
      </p>
      <a
        href={`/t/${tenantSlug}/settings/billing`}
        className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-brand-gradient px-5 py-2 text-sm font-medium text-white shadow-card hover:opacity-95"
      >
        <Zap className="size-4" />
        {tPages("upsell.upgradeBtn")}
      </a>
    </div>
  );
}

// ---------- UI primitives kept inline for cohesion ----------

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const tPages = useTranslations("pages.rules");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-card p-6 shadow-card-hover"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
            aria-label={tPages("modal.closeAria")}
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-violet-500" : "bg-muted-foreground/30",
        disabled && "opacity-50 cursor-not-allowed",
      )}
      aria-checked={checked}
      role="switch"
    >
      <span
        className={cn(
          "inline-block size-4 transform rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
