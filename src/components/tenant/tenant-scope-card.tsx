"use client";

import { useMemo, useState } from "react";
import { useRouter } from "@/i18n/routing";
import { Check, ChevronDown, Loader2, Save, Target, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Account = { id: string; name: string; business: string | null };
type Campaign = {
  id: string; // metaCampaignId
  name: string;
  accountId: string;
  status: string;
};

type CampaignNamePattern = {
  pattern: string;
  kind: "contains" | "starts_with" | "regex";
  caseInsensitive?: boolean;
};
type Scope = {
  accountIds: string[] | null;
  campaignIds: string[] | null;
  campaignNamePatterns: CampaignNamePattern[];
};

export function TenantScopeCard({
  tenantSlug,
  canEdit,
  accounts,
  campaigns,
  initialScope,
}: {
  tenantSlug: string;
  canEdit: boolean;
  accounts: Account[];
  campaigns: Campaign[];
  initialScope: Scope;
}) {
  const t = useTranslations("settings.tenantScope");
  const router = useRouter();
  const [scope, setScope] = useState<Scope>(initialScope);
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);

  const allAccountIds = useMemo(() => accounts.map((a) => a.id), [accounts]);
  const effectiveAccountIds =
    scope.accountIds === null ? allAccountIds : scope.accountIds;
  const accountIdSet = useMemo(
    () => new Set(effectiveAccountIds),
    [effectiveAccountIds],
  );

  // Campaign list is naturally filtered to selected accounts
  const visibleCampaigns = useMemo(
    () => campaigns.filter((c) => accountIdSet.has(c.accountId)),
    [campaigns, accountIdSet],
  );
  const allVisibleCampaignIds = useMemo(
    () => visibleCampaigns.map((c) => c.id),
    [visibleCampaigns],
  );

  function setAccounts(next: string[] | null) {
    setScope((s) => ({ ...s, accountIds: next }));
    setDirty(true);
  }

  function toggleAccount(id: string) {
    const current = scope.accountIds ?? allAccountIds;
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    setAccounts(next.length === allAccountIds.length ? null : next);
  }

  function setCampaigns(next: string[] | null) {
    setScope((s) => ({ ...s, campaignIds: next }));
    setDirty(true);
  }

  function toggleCampaign(id: string) {
    const current = scope.campaignIds ?? allVisibleCampaignIds;
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    setCampaigns(next.length === allVisibleCampaignIds.length ? null : next);
  }

  async function save() {
    setSubmitting(true);
    const toastId = toast.loading(t("saving"));
    try {
      // Filter campaignIds to those within selected accounts so stale ones
      // get dropped on save (avoids confusing "X campaigns no longer in scope")
      const filteredCampaignIds =
        scope.campaignIds === null
          ? null
          : scope.campaignIds.filter((id) =>
              visibleCampaigns.some((c) => c.id === id),
            );

      const res = await fetch(`/api/tenant-scope?tenantSlug=${tenantSlug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountIds: scope.accountIds,
          campaignIds: filteredCampaignIds,
          campaignNamePatterns: scope.campaignNamePatterns,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("saveFailedDefault"));
      toast.success(t("savedToast"), { id: toastId, duration: 2500 });
      setDirty(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveFailed"), {
        id: toastId,
        duration: 5000,
      });
    } finally {
      setSubmitting(false);
    }
  }

  const totalAccounts = accounts.length;
  const totalCampaigns = visibleCampaigns.length;
  const accountSummary =
    scope.accountIds === null
      ? t("summaryAllAccounts", { total: totalAccounts })
      : t("summaryAccountsCount", {
          count: scope.accountIds.length,
          total: totalAccounts,
        });
  const campaignSummary =
    scope.campaignIds === null
      ? t("summaryAllCampaigns")
      : t("summaryCampaignsCount", {
          count: scope.campaignIds.length,
          total: totalCampaigns,
        });
  const summary = `${accountSummary} · ${campaignSummary}`;

  return (
    <section className="space-y-3">
      <header className="flex items-start gap-3">
        <div className="flex size-9 items-center justify-center rounded-md bg-violet-500/10">
          <Target className="size-5 text-violet-600" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">Tenant Scope</h2>
            <span className="rounded-md bg-violet-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
              Default
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
      </header>

      <Card className="space-y-4 p-5">
        <div className="rounded-md border border-violet-200 bg-violet-50/60 p-3 text-xs text-violet-900 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-200">
          <p className="font-medium">{t("currentLabel", { summary })}</p>
        </div>

        <AccountSection
          accounts={accounts}
          selectedIds={effectiveAccountIds}
          isAll={scope.accountIds === null}
          canEdit={canEdit}
          onToggle={toggleAccount}
          onSelectAll={() => setAccounts(null)}
          onSelectNone={() => setAccounts([])}
        />

        <NamePatternSection
          patterns={scope.campaignNamePatterns}
          allCampaigns={visibleCampaigns}
          canEdit={canEdit}
          onChange={(next) => {
            setScope((s) => ({ ...s, campaignNamePatterns: next }));
            setDirty(true);
          }}
        />

        <CampaignSection
          campaigns={visibleCampaigns}
          selectedIds={scope.campaignIds ?? allVisibleCampaignIds}
          isAll={scope.campaignIds === null}
          canEdit={canEdit}
          onToggle={toggleCampaign}
          onSelectAll={() => setCampaigns(null)}
          onSelectNone={() => setCampaigns([])}
        />

        {canEdit && (
          <div className="flex items-center justify-end gap-2">
            {dirty && (
              <span className="text-[11px] text-muted-foreground">
                {t("unsavedChanges")}
              </span>
            )}
            <Button
              size="sm"
              onClick={save}
              disabled={!dirty || submitting}
              className="gap-1.5"
            >
              {submitting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              {t("saveBtn")}
            </Button>
          </div>
        )}

        {!canEdit && (
          <p className="text-[11px] text-muted-foreground">
            {t("ownerOnly")}
          </p>
        )}
      </Card>
    </section>
  );
}

// ---- AccountSection ----------------------------------------------

function AccountSection({
  accounts,
  selectedIds,
  isAll,
  canEdit,
  onToggle,
  onSelectAll,
  onSelectNone,
}: {
  accounts: Account[];
  selectedIds: string[];
  isAll: boolean;
  canEdit: boolean;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
}) {
  const t = useTranslations("settings.tenantScope.accountSection");
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState("");

  const filtered = accounts.filter((a) =>
    a.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const idSet = new Set(selectedIds);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between"
      >
        <span className="text-sm font-medium">
          Ad Accounts{" "}
          <span className="text-muted-foreground">
            (
            {isAll
              ? t("countAll", { total: accounts.length })
              : t("countSome", { count: selectedIds.length, total: accounts.length })}
            )
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <div className="flex gap-2">
            <Input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              disabled={!canEdit}
              className="flex-1"
            />
            {canEdit && (
              <>
                <Button variant="ghost" size="sm" onClick={onSelectAll}>
                  {t("selectAll")}
                </Button>
                <Button variant="ghost" size="sm" onClick={onSelectNone}>
                  {t("clear")}
                </Button>
              </>
            )}
          </div>
          <ul className="max-h-60 space-y-0.5 overflow-auto rounded-md border border-border bg-background p-1">
            {filtered.map((a) => {
              const checked = idSet.has(a.id);
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => onToggle(a.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                      canEdit && "hover:bg-muted",
                      !canEdit && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <Checkbox checked={checked} />
                    <span className="flex-1 truncate" title={a.name}>
                      {a.name}
                    </span>
                    {a.business && (
                      <span className="text-[10px] text-muted-foreground">
                        {a.business}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---- CampaignSection ---------------------------------------------

function CampaignSection({
  campaigns,
  selectedIds,
  isAll,
  canEdit,
  onToggle,
  onSelectAll,
  onSelectNone,
}: {
  campaigns: Campaign[];
  selectedIds: string[];
  isAll: boolean;
  canEdit: boolean;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
}) {
  const t = useTranslations("settings.tenantScope.campaignSection");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = campaigns.filter((c) =>
    c.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const idSet = new Set(selectedIds);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between"
      >
        <span className="text-sm font-medium">
          Campaigns (optional sub-scope){" "}
          <span className="text-muted-foreground">
            (
            {isAll
              ? t("countAll", { total: campaigns.length })
              : t("countSome", { count: selectedIds.length, total: campaigns.length })}
            )
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <div className="flex gap-2">
            <Input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              disabled={!canEdit}
              className="flex-1"
            />
            {canEdit && (
              <>
                <Button variant="ghost" size="sm" onClick={onSelectAll}>
                  {t("selectAll")}
                </Button>
                <Button variant="ghost" size="sm" onClick={onSelectNone}>
                  {t("clear")}
                </Button>
              </>
            )}
          </div>
          {campaigns.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
              {t("emptyNote")}
            </p>
          ) : (
            <ul className="max-h-60 space-y-0.5 overflow-auto rounded-md border border-border bg-background p-1">
              {filtered.map((c) => {
                const checked = idSet.has(c.id);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => onToggle(c.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                        canEdit && "hover:bg-muted",
                        !canEdit && "cursor-not-allowed opacity-60",
                      )}
                    >
                      <Checkbox checked={checked} />
                      <span className="flex-1 truncate" title={c.name}>
                        {c.name}
                      </span>
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase",
                          c.status === "ACTIVE"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {c.status}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <div
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded border",
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background",
      )}
    >
      {checked && <Check className="size-3" strokeWidth={3} />}
    </div>
  );
}

// ---- NamePatternSection -------------------------------------------
//
// Lets the user define name-based auto-include rules so future
// campaigns matching the pattern roll into scope without re-saving.

function NamePatternSection({
  patterns,
  allCampaigns,
  canEdit,
  onChange,
}: {
  patterns: CampaignNamePattern[];
  allCampaigns: Campaign[];
  canEdit: boolean;
  onChange: (next: CampaignNamePattern[]) => void;
}) {
  const t = useTranslations("settings.tenantScope.patternSection");
  const [open, setOpen] = useState(patterns.length > 0);
  const [draftPattern, setDraftPattern] = useState("");
  const [draftKind, setDraftKind] = useState<CampaignNamePattern["kind"]>("contains");

  function add() {
    if (!draftPattern.trim()) return;
    onChange([
      ...patterns,
      {
        pattern: draftPattern.trim(),
        kind: draftKind,
        caseInsensitive: true,
      },
    ]);
    setDraftPattern("");
  }

  function remove(idx: number) {
    onChange(patterns.filter((_, i) => i !== idx));
  }

  // Live preview — count current campaigns that match
  function matches(p: CampaignNamePattern, name: string): boolean {
    const haystack = p.caseInsensitive === false ? name : name.toLowerCase();
    const needle = p.caseInsensitive === false ? p.pattern : p.pattern.toLowerCase();
    if (p.kind === "contains") return haystack.includes(needle);
    if (p.kind === "starts_with") return haystack.startsWith(needle);
    if (p.kind === "regex") {
      try {
        return new RegExp(p.pattern, p.caseInsensitive === false ? "" : "i").test(name);
      } catch {
        return false;
      }
    }
    return false;
  }
  const matched = allCampaigns.filter((c) =>
    patterns.some((p) => matches(p, c.name)),
  );

  const previewNames = matched.slice(0, 5).map((c) => c.name).join(", ");
  const previewExtra = matched.length > 5 ? t("previewExtra", { extra: matched.length - 5 }) : "";

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between"
      >
        <span className="text-sm font-medium">
          Auto-include by name pattern{" "}
          <span className="text-muted-foreground">
            (
            {patterns.length === 0
              ? t("summaryEmpty")
              : t("summaryActive", { count: patterns.length, matched: matched.length })}
            )
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            {t("explainerBefore")}
            <strong>{t("explainerHighlight")}</strong>
            {t("explainerAfter")}
          </p>

          {patterns.length > 0 && (
            <ul className="space-y-1">
              {patterns.map((p, idx) => (
                <li
                  key={idx}
                  className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                >
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase">
                    {p.kind === "starts_with"
                      ? "starts with"
                      : p.kind === "regex"
                        ? "regex"
                        : "contains"}
                  </span>
                  <code className="flex-1 truncate text-xs">{p.pattern}</code>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => remove(idx)}
                      className="text-muted-foreground hover:text-destructive"
                      title={t("delete")}
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canEdit && (
            <div className="flex gap-2">
              <select
                value={draftKind}
                onChange={(e) =>
                  setDraftKind(e.target.value as CampaignNamePattern["kind"])
                }
                className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="contains">contains</option>
                <option value="starts_with">starts with</option>
                <option value="regex">regex</option>
              </select>
              <Input
                value={draftPattern}
                onChange={(e) => setDraftPattern(e.target.value)}
                placeholder={t("patternPlaceholder")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add();
                  }
                }}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={add}
                disabled={!draftPattern.trim()}
              >
                {t("addBtn")}
              </Button>
            </div>
          )}

          {matched.length > 0 && (
            <div className="flex items-start gap-1.5 rounded-md border border-emerald-200 bg-emerald-50/60 p-2 text-[11px] text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
              <Check className="mt-0.5 size-3 shrink-0" />
              <span>
                {t("previewLine", { matched: matched.length, names: previewNames })}
                {previewExtra}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
