"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Filter, Pencil, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { objectiveLabelTh } from "@/lib/goals/meta-objective-map";
import { formatKpi } from "@/lib/goals/evaluator";

type GoalKpi =
  | "ROAS"
  | "CPM"
  | "CTR"
  | "CPC"
  | "CPL"
  | "CPA"
  | "REACH"
  | "FREQUENCY"
  | "CONVERSIONS"
  | "ENGAGEMENT_RATE";

type EvaluationStatus = "on-track" | "off-track" | "no-data";

type CampaignEvaluation = {
  kpi: GoalKpi;
  target: number;
  actual: number;
  status: EvaluationStatus;
  customTarget: boolean;
};

type GoalObjective =
  | "AWARENESS"
  | "ENGAGEMENT"
  | "TRAFFIC"
  | "LEADS"
  | "SALES"
  | "APP_PROMOTION"
  | "STORE_VISITS";

type GoalSource = "USER_MANUAL" | "AUTO_NAME" | "AUTO_META" | "TENANT_DEFAULT";

type Campaign = {
  id: string;
  metaCampaignId: string;
  name: string;
  metaObjective: string | null;
  effectiveStatus: string;
  account: { id: string; name: string; business: string | null };
  goal: {
    resolved: boolean;
    objective: GoalObjective | null;
    source: GoalSource | null;
    primaryKpi: GoalKpi | null;
    primaryTarget: number | null;
  };
  evaluation: CampaignEvaluation | null;
};

type Props = {
  tenantSlug: string;
  campaigns: Campaign[];
  canEdit: boolean;
};

const OBJECTIVES: GoalObjective[] = [
  "AWARENESS",
  "ENGAGEMENT",
  "TRAFFIC",
  "LEADS",
  "SALES",
  "APP_PROMOTION",
  "STORE_VISITS",
];

// Source badge styling: confidence ordered green→yellow→gray→red.
const SOURCE_STYLE: Record<GoalSource | "UNRESOLVED", { label: string; tone: string }> = {
  USER_MANUAL: {
    label: "ตั้งเอง",
    tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  AUTO_NAME: {
    label: "จากชื่อ",
    tone: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  },
  AUTO_META: {
    label: "จาก Meta",
    tone: "bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
  },
  TENANT_DEFAULT: {
    label: "ค่า default",
    tone: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  },
  UNRESOLVED: {
    label: "ยังไม่ตั้ง",
    tone: "bg-destructive/10 text-destructive",
  },
};

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-emerald-500",
  PAUSED: "bg-amber-500",
  CAMPAIGN_PAUSED: "bg-amber-500",
  DELETED: "bg-zinc-400",
  ARCHIVED: "bg-zinc-400",
};

export function GoalsClient({ tenantSlug, campaigns, canEdit }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Filters
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"ALL" | GoalSource | "UNRESOLVED">("ALL");
  const [accountFilter, setAccountFilter] = useState<string>("ALL");

  // Selection (Set of campaign internal ids)
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Bulk apply panel state
  const [bulkObjective, setBulkObjective] = useState<GoalObjective>("SALES");

  // Target-edit modal state — campaign id or null
  const [editingTarget, setEditingTarget] = useState<Campaign | null>(null);

  const accountOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of campaigns) seen.set(c.account.id, c.account.name);
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [campaigns]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return campaigns.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q) && !c.account.name.toLowerCase().includes(q)) {
        return false;
      }
      if (accountFilter !== "ALL" && c.account.id !== accountFilter) return false;
      if (sourceFilter !== "ALL") {
        if (sourceFilter === "UNRESOLVED") {
          if (c.goal.resolved) return false;
        } else if (c.goal.source !== sourceFilter) {
          return false;
        }
      }
      return true;
    });
  }, [campaigns, query, sourceFilter, accountFilter]);

  // Group by account for display
  const grouped = useMemo(() => {
    const byAccount = new Map<string, { name: string; rows: Campaign[] }>();
    for (const c of filtered) {
      const key = c.account.id;
      if (!byAccount.has(key)) byAccount.set(key, { name: c.account.name, rows: [] });
      byAccount.get(key)!.rows.push(c);
    }
    return Array.from(byAccount.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered]);

  // Stats for the header
  const stats = useMemo(() => {
    const by = new Map<string, number>();
    let unresolved = 0;
    for (const c of campaigns) {
      if (!c.goal.resolved || !c.goal.objective) {
        unresolved++;
        continue;
      }
      by.set(c.goal.objective, (by.get(c.goal.objective) ?? 0) + 1);
    }
    return { by, unresolved, total: campaigns.length };
  }, [campaigns]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const visibleIds = filtered.map((c) => c.id);
      const allSelected = visibleIds.every((id) => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        for (const id of visibleIds) next.delete(id);
        return next;
      }
      const next = new Set(prev);
      for (const id of visibleIds) next.add(id);
      return next;
    });
  }

  async function applyBulk() {
    if (selected.size === 0) {
      toast.error("ยังไม่ได้เลือก campaign");
      return;
    }
    const toastId = toast.loading(`กำลังตั้ง goal ให้ ${selected.size} campaigns...`);
    try {
      const res = await fetch(`/api/goals?tenantSlug=${tenantSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignIds: Array.from(selected),
          objective: bulkObjective,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "บันทึกไม่สำเร็จ");
      toast.success(`✓ บันทึก ${data.updated} campaigns`, { id: toastId });
      setSelected(new Set());
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", { id: toastId });
    }
  }

  async function setOne(campaignId: string, objective: GoalObjective) {
    const toastId = toast.loading("กำลังบันทึก...");
    try {
      const res = await fetch(`/api/goals?tenantSlug=${tenantSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, objective }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "บันทึกไม่สำเร็จ");
      toast.success("✓ บันทึกแล้ว", { id: toastId });
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", { id: toastId });
    }
  }

  async function saveTarget(campaign: Campaign, primaryKpi: GoalKpi | null, primaryTarget: number | null) {
    if (!campaign.goal.objective) return;
    const toastId = toast.loading("กำลังบันทึก target...");
    try {
      const res = await fetch(`/api/goals?tenantSlug=${tenantSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaign.id,
          objective: campaign.goal.objective,
          primaryKpi,
          primaryTarget,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "บันทึกไม่สำเร็จ");
      toast.success("✓ บันทึก target แล้ว", { id: toastId });
      setEditingTarget(null);
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", { id: toastId });
    }
  }

  async function clearOverride(campaignId: string) {
    const toastId = toast.loading("กำลังลบ override...");
    try {
      const res = await fetch(
        `/api/goals?tenantSlug=${tenantSlug}&campaignId=${encodeURIComponent(campaignId)}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "ลบไม่สำเร็จ");
      toast.success("✓ กลับไปใช้ค่า auto", { id: toastId });
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ลบไม่สำเร็จ", { id: toastId });
    }
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <Card className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">รวม:</span>{" "}
            <span className="font-semibold tabular-nums">{stats.total}</span> campaigns
          </div>
          {Array.from(stats.by.entries()).map(([obj, count]) => (
            <div key={obj}>
              <span className="text-muted-foreground">{objectiveLabelTh(obj as GoalObjective)}:</span>{" "}
              <span className="font-semibold tabular-nums">{count}</span>
            </div>
          ))}
          {stats.unresolved > 0 && (
            <div className="text-destructive">
              <span>ยังไม่ตั้ง:</span>{" "}
              <span className="font-semibold tabular-nums">{stats.unresolved}</span>
            </div>
          )}
        </div>
      </Card>

      {/* Filter + bulk bar */}
      <Card className="space-y-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหา campaign หรือ ad account..."
              className="pl-8"
            />
          </div>

          <FilterSelect
            value={sourceFilter}
            onChange={(v) => setSourceFilter(v as typeof sourceFilter)}
            options={[
              { value: "ALL", label: "ทุก source" },
              { value: "USER_MANUAL", label: "ตั้งเอง" },
              { value: "AUTO_META", label: "จาก Meta" },
              { value: "AUTO_NAME", label: "จากชื่อ" },
              { value: "TENANT_DEFAULT", label: "ค่า default" },
              { value: "UNRESOLVED", label: "ยังไม่ตั้ง" },
            ]}
          />

          <FilterSelect
            value={accountFilter}
            onChange={setAccountFilter}
            options={[
              { value: "ALL", label: "ทุก account" },
              ...accountOptions.map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
        </div>

        {canEdit && selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
            <span className="text-sm font-medium">
              เลือก {selected.size} campaigns —
            </span>
            <span className="text-sm text-muted-foreground">ตั้ง objective:</span>
            <select
              value={bulkObjective}
              onChange={(e) => setBulkObjective(e.target.value as GoalObjective)}
              className="h-7 rounded-md border border-border bg-background px-2 text-sm"
            >
              {OBJECTIVES.map((o) => (
                <option key={o} value={o}>
                  {objectiveLabelTh(o)}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={applyBulk} disabled={pending}>
              <Check className="size-3.5" />
              บันทึกทั้งหมด
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              <X className="size-3.5" />
              ล้าง
            </Button>
          </div>
        )}
      </Card>

      {/* Target-edit modal */}
      {editingTarget && (
        <TargetModal
          campaign={editingTarget}
          onClose={() => setEditingTarget(null)}
          onSave={(kpi, target) => saveTarget(editingTarget, kpi, target)}
        />
      )}

      {/* Campaign list grouped by account */}
      {grouped.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 border-dashed py-12 text-center">
          <p className="text-sm font-medium">ไม่พบ campaign ที่ตรงกับเงื่อนไข</p>
          <p className="text-xs text-muted-foreground">
            ลองล้าง filter หรือลองค้นหาคำอื่น
          </p>
        </Card>
      ) : (
        <Card className="p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs text-muted-foreground">
            <button
              className="hover:text-foreground"
              onClick={toggleAllVisible}
              disabled={!canEdit}
            >
              <Filter className="mr-1 inline size-3" />
              เลือก/ยกเลิกทั้งหมดในมุมมองนี้ ({filtered.length})
            </button>
            <span>{filtered.length} / {campaigns.length} campaigns</span>
          </div>
          <div className="divide-y divide-border">
            {grouped.map((acc) => (
              <div key={acc.id}>
                <div className="bg-muted/20 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {acc.name}
                  <span className="ml-2 font-normal normal-case text-muted-foreground/70">
                    · {acc.rows.length} campaigns
                  </span>
                </div>
                {acc.rows.map((c) => (
                  <Row
                    key={c.id}
                    campaign={c}
                    selected={selected.has(c.id)}
                    onToggle={() => toggleOne(c.id)}
                    onSetObjective={(o) => setOne(c.id, o)}
                    onClear={() => clearOverride(c.id)}
                    onEditTarget={() => setEditingTarget(c)}
                    canEdit={canEdit}
                  />
                ))}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ---- subcomponents ----------------------------------------------------------

// Per-objective hint about which KPI is the natural fit — shown in the modal.
const OBJECTIVE_KPI_HINT: Record<GoalObjective, GoalKpi> = {
  AWARENESS: "CPM",
  ENGAGEMENT: "CTR",
  TRAFFIC: "CPC",
  LEADS: "CPL",
  SALES: "ROAS",
  APP_PROMOTION: "CPA",
  STORE_VISITS: "CPM",
};

const KPI_OPTIONS: GoalKpi[] = ["ROAS", "CPM", "CTR", "CPC", "CPL", "CPA"];

function TargetModal({
  campaign,
  onClose,
  onSave,
}: {
  campaign: Campaign;
  onClose: () => void;
  onSave: (kpi: GoalKpi | null, target: number | null) => void;
}) {
  const defaultKpi = campaign.goal.primaryKpi ?? (campaign.goal.objective ? OBJECTIVE_KPI_HINT[campaign.goal.objective] : "ROAS");
  const [kpi, setKpi] = useState<GoalKpi>(defaultKpi);
  const [target, setTarget] = useState<string>(
    campaign.goal.primaryTarget !== null && campaign.goal.primaryTarget !== undefined
      ? String(campaign.goal.primaryTarget)
      : "",
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(target);
    if (target.trim() === "") {
      onSave(null, null); // clear
      return;
    }
    if (!Number.isFinite(n) || n < 0) {
      toast.error("กรอกตัวเลขให้ถูกต้อง");
      return;
    }
    onSave(kpi, n);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-md space-y-4 rounded-lg border border-border bg-background p-5 shadow-lg"
      >
        <div>
          <h3 className="text-sm font-semibold">ตั้ง target สำหรับ campaign นี้</h3>
          <p className="mt-1 truncate text-xs text-muted-foreground" title={campaign.name}>
            {campaign.name}
          </p>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-muted-foreground">
            Primary KPI
          </label>
          <select
            value={kpi}
            onChange={(e) => setKpi(e.target.value as GoalKpi)}
            className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
          >
            {KPI_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-muted-foreground">
            Target value (เว้นว่าง = ใช้ default)
          </label>
          <Input
            type="number"
            step="any"
            min="0"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="เช่น 2.5 สำหรับ ROAS, 50 สำหรับ CPM"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="submit" size="sm">
            บันทึก
          </Button>
        </div>
      </form>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-md border border-border bg-background px-2 text-sm"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Row({
  campaign,
  selected,
  onToggle,
  onSetObjective,
  onClear,
  onEditTarget,
  canEdit,
}: {
  campaign: Campaign;
  selected: boolean;
  onToggle: () => void;
  onSetObjective: (o: GoalObjective) => void;
  onClear: () => void;
  onEditTarget: () => void;
  canEdit: boolean;
}) {
  const statusDot = STATUS_STYLE[campaign.effectiveStatus] ?? "bg-zinc-400";
  const sourceKey = !campaign.goal.resolved
    ? "UNRESOLVED"
    : (campaign.goal.source as GoalSource);
  const sourceStyle = SOURCE_STYLE[sourceKey];
  const isManual = campaign.goal.source === "USER_MANUAL";
  const evalBadge = campaign.evaluation;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 px-4 py-2.5 transition-colors",
        selected && "bg-primary/5",
      )}
    >
      {canEdit && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="size-4 cursor-pointer"
          aria-label={`เลือก ${campaign.name}`}
        />
      )}

      <div className="flex flex-1 items-center gap-2 min-w-0">
        <span className={cn("size-2 shrink-0 rounded-full", statusDot)} aria-hidden />
        <span className="truncate text-sm font-medium">{campaign.name}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {campaign.goal.objective && (
          <span className="rounded-md bg-muted px-2 py-0.5 font-medium">
            {objectiveLabelTh(campaign.goal.objective)}
          </span>
        )}
        <span className={cn("rounded-md px-2 py-0.5 font-medium", sourceStyle.tone)}>
          {sourceStyle.label}
        </span>
        {evalBadge && evalBadge.status !== "no-data" && (
          <span
            className={cn(
              "rounded-md px-2 py-0.5 font-medium tabular-nums",
              evalBadge.status === "on-track"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
            )}
            title={`เป้า ${formatKpi(evalBadge.kpi, evalBadge.target)}${evalBadge.customTarget ? " (custom)" : ""}`}
          >
            {evalBadge.kpi} {formatKpi(evalBadge.kpi, evalBadge.actual)}
          </span>
        )}
      </div>

      {canEdit && (
        <div className="flex items-center gap-1">
          <select
            value={campaign.goal.objective ?? ""}
            onChange={(e) => {
              const v = e.target.value as GoalObjective | "";
              if (v) onSetObjective(v);
            }}
            className="h-7 max-w-[180px] rounded-md border border-border bg-background px-2 text-xs"
          >
            <option value="" disabled>
              ตั้ง objective...
            </option>
            {OBJECTIVES.map((o) => (
              <option key={o} value={o}>
                {objectiveLabelTh(o)}
              </option>
            ))}
          </select>
          <Button
            size="xs"
            variant="ghost"
            onClick={onEditTarget}
            title="ตั้ง target"
            disabled={!campaign.goal.objective}
          >
            <Pencil className="size-3" />
          </Button>
          {isManual && (
            <Button size="xs" variant="ghost" onClick={onClear} title="ล้าง override">
              <X className="size-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
