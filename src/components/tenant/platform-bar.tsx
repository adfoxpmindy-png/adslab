"use client";

import { useEffect, useState } from "react";
import { Link, useRouter, usePathname } from "@/i18n/routing";
import { Check, ChevronDown, Layers, Zap } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Account = { id: string; name: string };

/**
 * Sticky bar sitting under the main Topbar. Two controls:
 *   1. Platform switcher: Meta (active) / Google (soon) / TikTok (soon)
 *   2. Account picker: which ad accounts the user wants to scope to
 *
 * The selection is persisted server-side per-user-per-tenant via
 * /api/account-preference. On first interaction, the picker writes the
 * selection back; until then it shows "all" and behaves identically to
 * how the app worked before this Phase.
 *
 * The picker exposes its current selection to the rest of the app via
 * a window-level CustomEvent + localStorage cache. Pages that need to
 * react to a change just listen for `adslab:accounts-changed`.
 */
export function PlatformBar({
  tenantSlug,
  accounts,
  totalAccounts,
  tenantScopeApplied,
}: {
  tenantSlug: string;
  /** Accounts within tenant scope (the universe the picker operates in). */
  accounts: Account[];
  /** Total active accounts (before tenant scope) — for "X in scope of Y" display. */
  totalAccounts: number;
  /** True when tenant scope is set (non-null accountIds). */
  tenantScopeApplied: boolean;
}) {
  return (
    <div className="flex h-11 items-center gap-2 border-b border-border bg-muted/30 px-4 lg:px-6">
      <PlatformSwitcher tenantSlug={tenantSlug} />
      <div className="mx-1 h-5 w-px bg-border" />
      <AccountPicker
        tenantSlug={tenantSlug}
        accounts={accounts}
        totalAccounts={totalAccounts}
        tenantScopeApplied={tenantScopeApplied}
      />
    </div>
  );
}

// ============================================================
// PlatformSwitcher
// ============================================================

function PlatformSwitcher({ tenantSlug }: { tenantSlug: string }) {
  const pathname = usePathname();
  // We detect current platform by URL prefix:
  //   /t/<slug>/g/...  → google
  //   /t/<slug>/tt/... → tiktok
  //   anything else    → meta
  const platform: "meta" | "google" | "tiktok" = pathname.startsWith(
    `/t/${tenantSlug}/g`,
  )
    ? "google"
    : pathname.startsWith(`/t/${tenantSlug}/tt`)
      ? "tiktok"
      : "meta";

  const items: { id: typeof platform; label: string; href: string; soon: boolean }[] = [
    { id: "meta", label: "Meta", href: `/t/${tenantSlug}/dashboard`, soon: false },
    { id: "google", label: "Google", href: `/t/${tenantSlug}/g`, soon: true },
    { id: "tiktok", label: "TikTok", href: `/t/${tenantSlug}/tt`, soon: true },
  ];

  return (
    <div className="flex items-center gap-0.5">
      {items.map((it) => {
        const active = platform === it.id;
        return (
          <Link
            key={it.id}
            href={it.href}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background hover:text-foreground",
            )}
          >
            <PlatformIcon id={it.id} />
            {it.label}
            {it.soon && (
              <span className="ml-1 rounded bg-amber-100 px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                Soon
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

function PlatformIcon({ id }: { id: "meta" | "google" | "tiktok" }) {
  if (id === "meta") return <MetaIcon />;
  if (id === "google") return <GoogleIcon />;
  return <TiktokIcon />;
}

function MetaIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden="true">
      <path d="M12.001 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89H7.898V12h2.54V9.797c0-2.506 1.493-3.891 3.776-3.891 1.094 0 2.238.195 2.238.195v2.46H15.19c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33V21.88C18.343 21.128 22 16.991 22 12c0-5.523-4.477-10-9.999-10z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function TiktokIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.55a8.16 8.16 0 0 0 4.77 1.52V6.69h-1.84z" />
    </svg>
  );
}

// ============================================================
// AccountPicker
// ============================================================

const ACCOUNTS_CHANGED_EVENT = "adslab:accounts-changed";

function AccountPicker({
  tenantSlug,
  accounts,
  totalAccounts,
  tenantScopeApplied,
}: {
  tenantSlug: string;
  accounts: Account[];
  totalAccounts: number;
  tenantScopeApplied: boolean;
}) {
  const t = useTranslations("platformBar");
  // `null`     = follow tenant default (no personal override)
  // `string[]` = explicit personal narrowing within tenant scope
  const [selectedIds, setSelectedIds] = useState<string[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();

  // Load preference on mount
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/account-preference?tenantSlug=${tenantSlug}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setSelectedIds(d.selectedAccountIds ?? null);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  function persist(ids: string[] | null) {
    setSelectedIds(ids);
    fetch(`/api/account-preference?tenantSlug=${tenantSlug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).catch(() => {});
    // Notify listeners + refresh server components
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(ACCOUNTS_CHANGED_EVENT, { detail: { ids } }));
    }
    router.refresh();
  }

  function toggle(id: string) {
    const current = selectedIds ?? accounts.map((a) => a.id);
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    // Treat "all in scope selected" as null (= follow tenant default)
    if (next.length === accounts.length) {
      persist(null);
    } else {
      persist(next);
    }
  }

  function selectAll() {
    persist(null);
  }

  function selectNone() {
    // "Clear" semantics: reset to tenant default (null), not an explicit
    // empty list. An empty user override would create "0 effective
    // accounts" which is almost never what users actually want.
    persist(null);
  }

  const effectiveIds = selectedIds ?? accounts.map((a) => a.id);
  const isFollowingTenant = selectedIds === null;
  const filtered = accounts.filter((a) =>
    a.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  // Label shows the EFFECTIVE count (what the user actually sees data for).
  // When tenant scope is active and user is following it, surface that.
  let label: string;
  if (!loaded) {
    label = t("loading");
  } else if (isFollowingTenant) {
    // Following tenant default → show "X in scope" if scope is set,
    // otherwise "all Y"
    label = tenantScopeApplied
      ? t("accountsLabelScope", { count: accounts.length, total: totalAccounts })
      : t("accountsLabelAll", { count: accounts.length });
  } else {
    label = t("accountsLabelPartial", { count: effectiveIds.length, total: accounts.length });
  }

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        className="h-8 gap-1.5"
      >
        <Layers className="size-3.5" />
        <span className="hidden sm:inline">{label}</span>
        <span className="sm:hidden">
          {isFollowingTenant
            ? tenantScopeApplied
              ? `${accounts.length}/${totalAccounts}`
              : t("accountsLabelShort")
            : `${effectiveIds.length}/${accounts.length}`}
        </span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </Button>

      {open && (
        <>
          {/* Click-away */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full z-50 mt-1 w-80 rounded-md border border-border bg-popover p-2 shadow-lg">
            <div className="mb-2 flex items-center gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-sm"
              />
            </div>
            <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <button
                onClick={selectAll}
                className="font-medium hover:text-foreground"
              >
                {t("selectAll")}
              </button>
              <button
                onClick={selectNone}
                className="font-medium hover:text-foreground"
              >
                {t("clearAll")}
              </button>
            </div>
            <ul className="max-h-72 overflow-auto">
              {filtered.length === 0 ? (
                <li className="px-2 py-3 text-center text-xs text-muted-foreground">
                  {t("notFound")}
                </li>
              ) : (
                filtered.map((a) => {
                  const checked = effectiveIds.includes(a.id);
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => toggle(a.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                          checked && "text-foreground",
                        )}
                      >
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
                        <span className="flex-1 truncate" title={a.name}>
                          {a.name}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

void Zap; // keep import for future "AI suggest accounts" CTA
