"use client";

import { useEffect, useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  Shield,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { BrandButton, SectionHeader } from "@/components/ui-system";
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

const METRIC_LABELS: Record<(typeof METRICS)[number], string> = {
  cpv: "CPV (฿/view)",
  roas: "ROAS",
  spend: "Spend (฿)",
  frequency: "Frequency",
  ctr: "CTR",
};
const OP_LABELS: Record<(typeof OPS)[number], string> = {
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
};
const ACTION_LABELS: Record<RuleAction, string> = {
  pause_adset: "Pause Ad Set",
  pause_campaign: "Pause Campaign",
  notify_email: "ส่ง email แจ้ง OWNER",
  notify_in_app: "ขึ้น notification ในแอพ",
};
const INTERVAL_LABELS: Record<number, string> = {
  60: "ทุก 1 ชม.",
  360: "ทุก 6 ชม.",
  720: "ทุก 12 ชม.",
  1440: "ทุก 24 ชม.",
};

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
          title={`${rules.length} rule${rules.length === 1 ? "" : "s"} · active ${activeCount}/${cap}`}
          subtitle="กดเปิด/ปิดเพื่อ activate · กดชื่อเพื่อแก้ไข · กด ⋯ เพื่อดู history"
        />
        <div className="flex gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={() => setSuggestionsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-200"
            >
              <Sparkles className="size-4" />
              ขอ AI แนะนำ
            </button>
          )}
          {canEdit && (
            <BrandButton
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              disabled={!canCreate}
              title={!canCreate ? "ถึง limit ของ plan แล้ว" : undefined}
            >
              <Plus className="size-4" />
              เพิ่ม rule
            </BrandButton>
          )}
        </div>
      </div>

      {rules.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
          <Shield className="mx-auto mb-3 size-10 text-muted-foreground" />
          <p className="text-sm font-medium">ยังไม่มี rule</p>
          <p className="mt-1 text-xs text-muted-foreground">
            ตั้ง rule เพื่อให้ AdsLab pause adset หรือแจ้งเตือนคุณอัตโนมัติเมื่อ KPI ไม่ดี
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
      toast.error(`อัพเดทไม่สำเร็จ: ${(e as Error).message}`);
    }
  }

  async function deleteRule(id: string) {
    if (!confirm("ลบ rule นี้? RuleRun history จะถูกลบด้วย")) return;
    try {
      const res = await fetch(
        `/api/rules/${id}?tenantSlug=${encodeURIComponent(tenantSlug)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRules((rs) => rs.filter((r) => r.id !== id));
      toast.success("ลบแล้ว");
    } catch (e) {
      toast.error(`ลบไม่สำเร็จ: ${(e as Error).message}`);
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
      toast.error(`Test ล้มเหลว: ${(e as Error).message}`);
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
              ใน {rule.condition.windowHours}h ที่ {rule.condition.scope} → {ACTION_LABELS[rule.action]} ·
              เช็ค {INTERVAL_LABELS[rule.minIntervalMinutes]}
              {rule.lastFiredAt && (
                <>
                  {" · "}
                  ฟายล่าสุด {new Date(rule.lastFiredAt).toLocaleDateString("th-TH")}
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
            title="ทดสอบ rule ตอนนี้"
          >
            {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
          </button>
          <button
            type="button"
            onClick={onHistory}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
            title="ดู history"
          >
            <Clock className="size-3.5" />
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title="ลบ"
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
      toast.error("ใส่ชื่อ rule");
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
        toast.success(isEdit ? "แก้ไขแล้ว" : "สร้างแล้ว");
      } catch (e) {
        toast.error(`บันทึกไม่สำเร็จ: ${(e as Error).message}`);
      }
    });
  }

  return (
    <ModalShell title={existing ? "แก้ไข rule" : "สร้าง rule ใหม่"} onClose={onCancel}>
      <div className="space-y-4">
        <Field label="ชื่อ rule">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น pause adset ถ้า CPV เกิน ฿5 ใน 2 ชม."
            maxLength={120}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Scope">
            <select
              value={cond.scope}
              onChange={(e) => setCond({ ...cond, scope: e.target.value as RuleCondition["scope"] })}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="adset">Ad Set</option>
              <option value="campaign">Campaign</option>
            </select>
          </Field>
          <Field label="Metric">
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
          <Field label="Operator">
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
          <Field label="Value">
            <Input
              type="number"
              step="any"
              value={cond.value}
              onChange={(e) => setCond({ ...cond, value: Number(e.target.value) })}
            />
          </Field>
          <Field label="Window">
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

        <Field label="Action">
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

        <Field label="ความถี่ที่เช็ค (min interval)">
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
          label={`เลือก ${cond.scope === "campaign" ? "campaign" : "ad set"} เฉพาะ (ไม่เลือก = ทั้งหมด)`}
        >
          <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-background p-2 text-xs">
            {targetOptions.length === 0 ? (
              <p className="text-muted-foreground">ไม่มีตัวเลือก</p>
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
          เปิดใช้งานทันที (นับเข้า tier cap)
        </label>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-4 py-2 text-sm hover:bg-accent"
        >
          ยกเลิก
        </button>
        <BrandButton onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          {existing ? "บันทึก" : "สร้าง rule"}
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
    <ModalShell title={`History · ${ruleName}`} onClose={onClose}>
      {runs === null ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
          กำลังโหลด...
        </p>
      ) : runs.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          ยังไม่มี evaluation — เปิด rule แล้วรอ cron tick หรือกด Test
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
                  {new Date(r.tickAt).toLocaleString("th-TH")}
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
        toast.error(`AI ขัดข้อง: ${(e as Error).message}`);
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
      toast.success(`เพิ่มแล้ว: ${c.name} (disabled — เปิดได้ใน list)`);
    } catch (e) {
      toast.error(`เพิ่มไม่สำเร็จ: ${(e as Error).message}`);
    } finally {
      setAccepting(null);
    }
  }

  return (
    <ModalShell title="AI แนะนำ Rule" onClose={onClose}>
      {!candidates && !loading && (
        <div className="py-6 text-center">
          <Sparkles className="mx-auto mb-3 size-10 text-violet-500" />
          <p className="text-sm">
            ให้ AI ดู pattern การ pause ของคุณช่วง 30 วันที่ผ่านมา แล้วแนะนำ rule ที่อาจเข้าจังหวะ
          </p>
          <BrandButton onClick={loadSuggestions} className="mt-4">
            ขอ AI แนะนำ 3 ตัว
          </BrandButton>
        </div>
      )}
      {loading && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
          AI กำลังคิด...
        </p>
      )}
      {candidates && candidates.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          ไม่มี candidate ที่ AI แนะนำ — อาจจะข้อมูลน้อยเกิน เปิด rule เองได้
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
                {c.condition.value} ใน {c.condition.windowHours}h ที่ {c.condition.scope} →{" "}
                {ACTION_LABELS[c.action]}
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
                  เพิ่ม (disabled)
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
  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-8 text-center dark:border-violet-900 dark:bg-violet-950/20">
      <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-brand-gradient text-white">
        <Shield className="size-6" />
      </div>
      <p className="text-base font-semibold">Auto-rules อยู่ใน plan แบบจ่ายเงิน</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Plan ปัจจุบัน: <code>{planKey ?? "ทดลองใช้ / ยังไม่ได้เลือก"}</code> — upgrade
        เพื่อปลด rules
      </p>
      <a
        href={`/t/${tenantSlug}/settings/billing`}
        className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-brand-gradient px-5 py-2 text-sm font-medium text-white shadow-card hover:opacity-95"
      >
        <Zap className="size-4" />
        Upgrade plan
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
            aria-label="ปิด"
          >
            ✕
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
