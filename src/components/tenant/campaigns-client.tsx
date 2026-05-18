"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { CalendarClock, Copy, DollarSign, Pause, Play, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { formatDateTime, formatNumber } from "@/lib/i18n/format";
import type { Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

type Campaign = {
  id: string;
  metaCampaignId: string;
  name: string;
  metaObjective: string | null;
  effectiveStatus: string;
  configuredStatus: string | null;
  /** Budget in minor units (฿1 = 100). null = ABO (managed at ad-set level). */
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  /** ISO datetime string or null. */
  endTime: string | null;
  account: { id: string; name: string; business: string | null };
};

type Props = {
  tenantSlug: string;
  canEdit: boolean;
  campaigns: Campaign[];
  highlightId?: string;
};

// Meta status families. We collapse them into 3 buckets for filter UX.
const STATUS_BUCKET: Record<string, "ACTIVE" | "PAUSED" | "OTHER"> = {
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  CAMPAIGN_PAUSED: "PAUSED",
  ADSET_PAUSED: "PAUSED",
  DELETED: "OTHER",
  ARCHIVED: "OTHER",
};

const STATUS_DOT: Record<string, string> = {
  ACTIVE: "bg-emerald-500",
  PAUSED: "bg-amber-500",
  CAMPAIGN_PAUSED: "bg-amber-500",
  ADSET_PAUSED: "bg-amber-500",
  DELETED: "bg-zinc-400",
  ARCHIVED: "bg-zinc-400",
};

type ModalState =
  | { kind: "budget"; campaign: Campaign }
  | { kind: "endDate"; campaign: Campaign }
  | { kind: "duplicate"; campaign: Campaign }
  | null;

export function CampaignsClient({ tenantSlug, canEdit, campaigns, highlightId }: Props) {
  const t = useTranslations("pages.campaignsV1");
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [query, setQuery] = useState("");
  // When the page is loaded with ?highlight=<id> (e.g. just-created
  // campaign), filter the list to that campaign's name so the user
  // sees it immediately among hundreds.
  const highlightedCampaign = useMemo(
    () => (highlightId ? campaigns.find((c) => c.id === highlightId) : null),
    [campaigns, highlightId],
  );
  const [accountFilter, setAccountFilter] = useState(
    highlightedCampaign?.account.id ?? "ALL",
  );
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "PAUSED" | "OTHER">("ALL");

  // Auto-scroll to highlighted row + flash effect
  useEffect(() => {
    if (!highlightId) return;
    const id = setTimeout(() => {
      const el = document.getElementById(`campaign-row-${highlightId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
    return () => clearTimeout(id);
  }, [highlightId]);
  // Track which campaign is mid-action so the row can show a spinner
  // and we can deny double-clicks without disabling the whole table.
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalState>(null);

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
      if (statusFilter !== "ALL") {
        const bucket = STATUS_BUCKET[c.effectiveStatus] ?? "OTHER";
        if (bucket !== statusFilter) return false;
      }
      return true;
    });
  }, [campaigns, query, accountFilter, statusFilter]);

  const grouped = useMemo(() => {
    const byAccount = new Map<string, { name: string; rows: Campaign[] }>();
    for (const c of filtered) {
      if (!byAccount.has(c.account.id)) {
        byAccount.set(c.account.id, { name: c.account.name, rows: [] });
      }
      byAccount.get(c.account.id)!.rows.push(c);
    }
    return Array.from(byAccount.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered]);

  const stats = useMemo(() => {
    let active = 0;
    let paused = 0;
    let other = 0;
    for (const c of campaigns) {
      const bucket = STATUS_BUCKET[c.effectiveStatus] ?? "OTHER";
      if (bucket === "ACTIVE") active++;
      else if (bucket === "PAUSED") paused++;
      else other++;
    }
    return { total: campaigns.length, active, paused, other };
  }, [campaigns]);

  async function performAction(campaign: Campaign, action: "PAUSE" | "RESUME") {
    if (busy.has(campaign.id)) return;
    const verb = action === "PAUSE" ? t("action.verbPause") : t("action.verbResume");
    if (!confirm(t("action.confirm", { verb, name: campaign.name }))) return;
    await postAction(
      campaign,
      { action },
      t("action.pendingPrefix", { verb }),
      t("action.successPrefix", { verb }),
    );
  }

  async function duplicateCampaign(
    campaign: Campaign,
    overrides: {
      newName?: string;
      dailyBudget?: number;
      lifetimeBudget?: number;
      dailyBudgetMultiplier?: number;
      lifetimeBudgetMultiplier?: number;
      initialStatus: "PAUSED" | "ACTIVE";
    },
  ) {
    if (busy.has(campaign.id)) return;
    setBusy((prev) => new Set(prev).add(campaign.id));
    const toastId = toast.loading(t("action.duplicating"));
    try {
      const res = await fetch(`/api/meta/campaigns/duplicate?tenantSlug=${tenantSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceCampaignId: campaign.id, ...overrides }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : t("action.duplicateFail"));
      }
      toast.success(t("action.duplicated", { name: data.name }), { id: toastId, duration: 3000 });
      setModal(null);
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("action.duplicateFail"), {
        id: toastId,
        duration: 5000,
      });
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(campaign.id);
        return next;
      });
    }
  }

  async function postAction(
    campaign: Campaign,
    body: Record<string, unknown>,
    pendingMsg: string,
    successMsg: string,
  ) {
    if (busy.has(campaign.id)) return;
    setBusy((prev) => new Set(prev).add(campaign.id));
    const toastId = toast.loading(pendingMsg);
    try {
      const res = await fetch(`/api/meta/campaign-actions?tenantSlug=${tenantSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: campaign.id, ...body }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : t("action.genericFail"));
      }
      toast.success(successMsg, { id: toastId, duration: 2500 });
      setModal(null);
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("action.genericFail"), {
        id: toastId,
        duration: 5000,
      });
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(campaign.id);
        return next;
      });
    }
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-border/60 bg-card/40 px-4 py-3 text-sm">
        <span>
          <span className="text-muted-foreground">{t("stats.totalLabel")}</span>{" "}
          <span className="font-semibold tabular-nums">{stats.total}</span>
        </span>
        <span className="text-emerald-700 dark:text-emerald-300">
          <span className="text-muted-foreground">{t("stats.activeLabel")}</span>{" "}
          <span className="font-semibold tabular-nums">{stats.active}</span>
        </span>
        <span className="text-amber-700 dark:text-amber-300">
          <span className="text-muted-foreground">{t("stats.pausedLabel")}</span>{" "}
          <span className="font-semibold tabular-nums">{stats.paused}</span>
        </span>
        {stats.other > 0 && (
          <span className="text-muted-foreground">
            {t("stats.otherLabel")} <span className="font-semibold tabular-nums">{stats.other}</span>
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card/40 px-3 py-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("filters.searchPlaceholder")}
            className="pl-8"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="ALL">{t("filters.allStatuses")}</option>
          <option value="ACTIVE">Active</option>
          <option value="PAUSED">Paused</option>
          <option value="OTHER">{t("filters.statusOther")}</option>
        </select>
        <select
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="ALL">{t("filters.allAccounts")}</option>
          {accountOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-muted-foreground">
          {t("filters.showing", { filtered: filtered.length, total: campaigns.length })}
        </span>
      </div>

      {/* List */}
      {grouped.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 border-dashed py-12 text-center">
          <p className="text-sm font-medium">{t("list.empty")}</p>
        </Card>
      ) : (
        <Card className="p-0">
          <div className="divide-y divide-border">
            {grouped.map((acc) => (
              <div key={acc.id}>
                <div className="bg-muted/20 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {acc.name}
                  <span className="ml-2 font-normal normal-case text-muted-foreground/70">
                    {t("list.accountCampaignsCount", { count: acc.rows.length })}
                  </span>
                </div>
                {acc.rows.map((c) => (
                  <CampaignRow
                    key={c.id}
                    campaign={c}
                    busy={busy.has(c.id)}
                    canEdit={canEdit}
                    highlighted={c.id === highlightId}
                    onPause={() => performAction(c, "PAUSE")}
                    onResume={() => performAction(c, "RESUME")}
                    onEditBudget={() => setModal({ kind: "budget", campaign: c })}
                    onEditEndDate={() => setModal({ kind: "endDate", campaign: c })}
                    onDuplicate={() => setModal({ kind: "duplicate", campaign: c })}
                  />
                ))}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Modals */}
      {modal?.kind === "budget" && (
        <BudgetModal
          campaign={modal.campaign}
          busy={busy.has(modal.campaign.id)}
          onClose={() => setModal(null)}
          onSave={(dailyBudget, lifetimeBudget) => {
            const body: Record<string, unknown> = { action: "SET_BUDGET" };
            if (dailyBudget !== undefined) body.dailyBudget = dailyBudget;
            if (lifetimeBudget !== undefined) body.lifetimeBudget = lifetimeBudget;
            postAction(modal.campaign, body, t("action.savingBudget"), t("action.saved"));
          }}
        />
      )}
      {modal?.kind === "endDate" && (
        <EndDateModal
          campaign={modal.campaign}
          busy={busy.has(modal.campaign.id)}
          onClose={() => setModal(null)}
          onSave={(endTime) => {
            postAction(
              modal.campaign,
              { action: "SET_END_DATE", endTime: endTime.toISOString() },
              t("action.savingEndDate"),
              t("action.saved"),
            );
          }}
        />
      )}
      {modal?.kind === "duplicate" && (
        <DuplicateModal
          campaign={modal.campaign}
          busy={busy.has(modal.campaign.id)}
          onClose={() => setModal(null)}
          onSave={(overrides) => duplicateCampaign(modal.campaign, overrides)}
        />
      )}
    </div>
  );
}

// ----- Helpers --------------------------------------------------------------

function isCbo(c: Campaign): boolean {
  return c.dailyBudget !== null || c.lifetimeBudget !== null;
}

function formatBudgetThb(minor: number | null, locale: Locale | string): string {
  if (minor === null) return "—";
  return `฿${formatNumber(minor / 100, locale)}`;
}

// ----- Row --------------------------------------------------------------

function CampaignRow({
  campaign,
  busy,
  canEdit,
  highlighted,
  onPause,
  onResume,
  onEditBudget,
  onEditEndDate,
  onDuplicate,
}: {
  campaign: Campaign;
  busy: boolean;
  canEdit: boolean;
  highlighted?: boolean;
  onPause: () => void;
  onResume: () => void;
  onEditBudget: () => void;
  onEditEndDate: () => void;
  onDuplicate: () => void;
}) {
  const t = useTranslations("pages.campaignsV1");
  const locale = useLocale();
  const dot = STATUS_DOT[campaign.effectiveStatus] ?? "bg-zinc-400";
  const isActive = STATUS_BUCKET[campaign.effectiveStatus] === "ACTIVE";
  const isPaused = STATUS_BUCKET[campaign.effectiveStatus] === "PAUSED";
  const cbo = isCbo(campaign);
  const budgetLabel = campaign.dailyBudget
    ? `${formatBudgetThb(campaign.dailyBudget, locale)}/day`
    : campaign.lifetimeBudget
      ? `${formatBudgetThb(campaign.lifetimeBudget, locale)}/lifetime`
      : t("row.adsetBudget");

  return (
    <div
      id={`campaign-row-${campaign.id}`}
      className={cn(
        "flex flex-wrap items-center gap-3 px-4 py-2.5 transition-colors",
        highlighted && "bg-primary/10 ring-2 ring-primary/40",
      )}
    >
      {highlighted && (
        <span className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase text-primary-foreground">
          {t("row.justCreated")}
        </span>
      )}
      <div className="flex flex-1 items-center gap-2 min-w-0">
        <span className={cn("size-2 shrink-0 rounded-full", dot)} aria-hidden />
        <span className="truncate text-sm font-medium" title={campaign.name}>
          {campaign.name}
        </span>
      </div>

      <span className="hidden md:inline text-[11px] text-muted-foreground tabular-nums">
        {budgetLabel}
      </span>

      <span className="hidden sm:inline rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {campaign.effectiveStatus}
      </span>

      {canEdit && (
        <div className="flex items-center gap-1">
          {isActive && (
            <Button size="sm" variant="outline" disabled={busy} onClick={onPause} className="gap-1.5" title={t("row.pauseTooltip")}>
              <Pause className="size-3" />
            </Button>
          )}
          {isPaused && (
            <Button size="sm" disabled={busy} onClick={onResume} className="gap-1.5" title={t("row.resumeTooltip")}>
              <Play className="size-3" />
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !cbo}
            onClick={onEditBudget}
            className="gap-1.5"
            title={cbo ? t("row.budgetTooltipEditable") : t("row.budgetTooltipDisabled")}
          >
            <DollarSign className="size-3" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={onEditEndDate}
            className="gap-1.5"
            title={t("row.endDateTooltip")}
          >
            <CalendarClock className="size-3" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={onDuplicate}
            className="gap-1.5"
            title={t("row.duplicateTooltip")}
          >
            <Copy className="size-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ----- Modals --------------------------------------------------------------

function BudgetModal({
  campaign,
  busy,
  onClose,
  onSave,
}: {
  campaign: Campaign;
  busy: boolean;
  onClose: () => void;
  onSave: (dailyBudget: number | undefined, lifetimeBudget: number | undefined) => void;
}) {
  const t = useTranslations("pages.campaignsV1");
  const locale = useLocale();
  const isDailyMode = campaign.dailyBudget !== null;
  const currentMinor = isDailyMode ? campaign.dailyBudget : campaign.lifetimeBudget;
  const currentThb = currentMinor !== null ? currentMinor / 100 : 0;
  const [thb, setThb] = useState<string>(String(currentThb));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(thb);
    if (!Number.isFinite(n) || n < 20) {
      toast.error(t("budgetModal.errors.tooLow"));
      return;
    }
    if (n > 1_000_000) {
      toast.error(t("budgetModal.errors.tooHigh"));
      return;
    }
    if (isDailyMode) onSave(n, undefined);
    else onSave(undefined, n);
  }

  return (
    <ModalShell title={t("budgetModal.title")} onClose={onClose} subtitle={campaign.name}>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted-foreground">
            {isDailyMode ? t("budgetModal.dailyLabel") : t("budgetModal.lifetimeLabel")}
          </label>
          <p className="text-[11px] text-muted-foreground">
            {t("budgetModal.current", { thb: formatNumber(currentThb, locale) })}
          </p>
          <Input
            type="number"
            step="any"
            min="20"
            value={thb}
            onChange={(e) => setThb(e.target.value)}
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            {t("budgetModal.cancel")}
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {t("budgetModal.save")}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

function EndDateModal({
  campaign,
  busy,
  onClose,
  onSave,
}: {
  campaign: Campaign;
  busy: boolean;
  onClose: () => void;
  onSave: (endTime: Date) => void;
}) {
  const t = useTranslations("pages.campaignsV1");
  const locale = useLocale();
  // For datetime-local input we need YYYY-MM-DDTHH:mm (no seconds, no Z).
  // Default to existing end_time or +7 days from now.
  const [dt, setDt] = useState(() => {
    const defaultDate = campaign.endTime
      ? new Date(campaign.endTime)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return toDatetimeLocalValue(defaultDate);
  });

  function quickSet(deltaMs: number) {
    setDt(toDatetimeLocalValue(new Date(Date.now() + deltaMs)));
  }
  function endNow() {
    setDt(toDatetimeLocalValue(new Date()));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const d = new Date(dt);
    if (Number.isNaN(d.getTime())) {
      toast.error(t("endDateModal.errors.invalid"));
      return;
    }
    if (d.getTime() < Date.now() - 60_000) {
      toast.error(t("endDateModal.errors.past"));
      return;
    }
    onSave(d);
  }

  return (
    <ModalShell title={t("endDateModal.title")} onClose={onClose} subtitle={campaign.name}>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted-foreground">
            {t("endDateModal.label")}
          </label>
          <p className="text-[11px] text-muted-foreground">
            {t("endDateModal.currentLabel")}{" "}
            {campaign.endTime
              ? formatDateTime(campaign.endTime, locale)
              : t("endDateModal.notSet")}
          </p>
          <DatePicker
            value={dt}
            onChange={(next) => setDt(next)}
            showTime
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="xs" variant="outline" onClick={endNow}>
            {t("endDateModal.endNow")}
          </Button>
          <Button type="button" size="xs" variant="outline" onClick={() => quickSet(7 * 86_400_000)}>
            {t("endDateModal.add7Days")}
          </Button>
          <Button type="button" size="xs" variant="outline" onClick={() => quickSet(30 * 86_400_000)}>
            {t("endDateModal.add30Days")}
          </Button>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            {t("endDateModal.cancel")}
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {t("endDateModal.save")}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

function toDatetimeLocalValue(d: Date): string {
  // Format YYYY-MM-DDTHH:mm in LOCAL time for the input element.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ----- Duplicate Modal --------------------------------------------------------

type DuplicateOverrides = {
  newName?: string;
  dailyBudget?: number;
  lifetimeBudget?: number;
  dailyBudgetMultiplier?: number;
  lifetimeBudgetMultiplier?: number;
  initialStatus: "PAUSED" | "ACTIVE";
};

const BUDGET_MULTIPLIER_PRESETS = [
  { label: "×0.5", value: 0.5 },
  { label: "×1", value: 1 },
  { label: "×1.5", value: 1.5 },
  { label: "×2", value: 2 },
];

function DuplicateModal({
  campaign,
  busy,
  onClose,
  onSave,
}: {
  campaign: Campaign;
  busy: boolean;
  onClose: () => void;
  onSave: (overrides: DuplicateOverrides) => void;
}) {
  const t = useTranslations("pages.campaignsV1");
  const locale = useLocale();
  const cbo = isCbo(campaign);
  const isDailyMode = campaign.dailyBudget !== null;
  const currentBudgetMinor = isDailyMode ? campaign.dailyBudget : campaign.lifetimeBudget;
  const currentBudgetThb = currentBudgetMinor !== null ? currentBudgetMinor / 100 : 0;

  const [name, setName] = useState(`${campaign.name} - Copy`);
  const [budgetMode, setBudgetMode] = useState<"same" | "multiplier" | "absolute">("same");
  const [multiplier, setMultiplier] = useState<number>(1);
  const [absoluteThb, setAbsoluteThb] = useState<string>(String(currentBudgetThb));
  const [initialStatus, setInitialStatus] = useState<"PAUSED" | "ACTIVE">("PAUSED");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error(t("duplicateModal.errors.name"));
      return;
    }
    const overrides: DuplicateOverrides = {
      newName: name.trim(),
      initialStatus,
    };
    if (cbo && budgetMode !== "same") {
      if (budgetMode === "multiplier") {
        if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 10) {
          toast.error(t("duplicateModal.errors.multiplier"));
          return;
        }
        if (isDailyMode) overrides.dailyBudgetMultiplier = multiplier;
        else overrides.lifetimeBudgetMultiplier = multiplier;
      } else {
        const n = Number(absoluteThb);
        if (!Number.isFinite(n) || n < 20) {
          toast.error(t("duplicateModal.errors.budgetTooLow"));
          return;
        }
        if (n > 1_000_000) {
          toast.error(t("duplicateModal.errors.budgetTooHigh"));
          return;
        }
        if (isDailyMode) overrides.dailyBudget = n;
        else overrides.lifetimeBudget = n;
      }
    }
    onSave(overrides);
  }

  const budgetLabel = isDailyMode
    ? t("duplicateModal.budgetLabelDaily", { thb: formatNumber(currentBudgetThb, locale) })
    : t("duplicateModal.budgetLabelLifetime", { thb: formatNumber(currentBudgetThb, locale) });

  return (
    <ModalShell title={t("duplicateModal.title")} onClose={onClose} subtitle={campaign.name}>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted-foreground">
            {t("duplicateModal.newNameLabel")}
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={200}
          />
        </div>

        {cbo && (
          <div className="space-y-2">
            <label className="block text-xs font-medium text-muted-foreground">
              {budgetLabel}
            </label>
            <div className="flex flex-wrap gap-2">
              <RadioPill
                checked={budgetMode === "same"}
                onClick={() => setBudgetMode("same")}
                label={t("duplicateModal.modes.same")}
              />
              <RadioPill
                checked={budgetMode === "multiplier"}
                onClick={() => setBudgetMode("multiplier")}
                label={t("duplicateModal.modes.multiplier")}
              />
              <RadioPill
                checked={budgetMode === "absolute"}
                onClick={() => setBudgetMode("absolute")}
                label={t("duplicateModal.modes.absolute")}
              />
            </div>
            {budgetMode === "multiplier" && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1">
                  {BUDGET_MULTIPLIER_PRESETS.map((p) => (
                    <Button
                      type="button"
                      key={p.value}
                      size="xs"
                      variant={multiplier === p.value ? "default" : "outline"}
                      onClick={() => setMultiplier(p.value)}
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>
                <Input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="10"
                  value={multiplier}
                  onChange={(e) => setMultiplier(Number(e.target.value))}
                />
                <p className="text-[11px] text-muted-foreground">
                  {t("duplicateModal.multiplierResult", { thb: (currentBudgetThb * multiplier).toLocaleString("th-TH", { maximumFractionDigits: 0 }) })}
                </p>
              </div>
            )}
            {budgetMode === "absolute" && (
              <Input
                type="number"
                step="any"
                min="20"
                value={absoluteThb}
                onChange={(e) => setAbsoluteThb(e.target.value)}
              />
            )}
          </div>
        )}
        {!cbo && (
          <p className="text-xs text-muted-foreground">
            {t("duplicateModal.adsetBudgetNote")}
          </p>
        )}

        <div className="space-y-2">
          <label className="block text-xs font-medium text-muted-foreground">
            {t("duplicateModal.initialStatusLabel")}
          </label>
          <div className="flex gap-2">
            <RadioPill
              checked={initialStatus === "PAUSED"}
              onClick={() => setInitialStatus("PAUSED")}
              label={t("duplicateModal.statusPaused")}
            />
            <RadioPill
              checked={initialStatus === "ACTIVE"}
              onClick={() => setInitialStatus("ACTIVE")}
              label={t("duplicateModal.statusActive")}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            {t("duplicateModal.cancel")}
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {t("duplicateModal.duplicateBtn")}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

function RadioPill({
  checked,
  onClick,
  label,
}: {
  checked: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs transition-colors",
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-lg border border-border bg-background p-5 shadow-lg"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">{title}</h3>
            {subtitle && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground" title={subtitle}>
                {subtitle}
              </p>
            )}
          </div>
          <Button type="button" size="icon-sm" variant="ghost" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
