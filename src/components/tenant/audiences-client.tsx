"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Check,
  Code,
  Copy,
  ExternalLink,
  Filter,
  Globe,
  Hash,
  Layers,
  Loader2,
  MousePointer,
  Plus,
  Power,
  Search,
  Target,
  Timer,
  Trash2,
  Upload,
  Users,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Account = { id: string; name: string; business: string | null; businessId: string | null };
type Audience = {
  id: string;
  name: string;
  subtype: string;
  approximateCount: number | null;
  description: string | null;
  accountId: string;
  accountName: string;
};

type Props = {
  tenantSlug: string;
  canEdit: boolean;
  accounts: Account[];
  audiences: Audience[];
};

// Subtype display + icon mapping. We collapse Meta's many subtypes into
// 3 user-facing buckets that match the modal's choices.
const SUBTYPE_STYLE: Record<
  string,
  { label: string; tone: string; icon: React.ComponentType<{ className?: string }> }
> = {
  CUSTOM: {
    label: "Customer list",
    tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    icon: Users,
  },
  WEBSITE: {
    label: "Pixel (website)",
    tone: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
    icon: Globe,
  },
  LOOKALIKE: {
    label: "Lookalike",
    tone: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
    icon: Layers,
  },
  ENGAGEMENT: {
    label: "Engagement",
    tone: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    icon: Hash,
  },
  APP: {
    label: "App activity",
    tone: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
    icon: Hash,
  },
};

function formatCount(n: number | null): string {
  if (n === null) return "—";
  if (n < 1000) return `<1K`;
  if (n < 1_000_000) return `${Math.round(n / 100) / 10}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

type Tab = "audiences" | "pixels" | "conversions" | "events";

export function AudiencesClient({ tenantSlug, canEdit, accounts, audiences }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>("audiences");
  const [query, setQuery] = useState("");
  const [accountFilter, setAccountFilter] = useState("ALL");
  const [subtypeFilter, setSubtypeFilter] = useState("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return audiences.filter((a) => {
      if (q && !a.name.toLowerCase().includes(q)) return false;
      if (accountFilter !== "ALL" && a.accountId !== accountFilter) return false;
      if (subtypeFilter !== "ALL" && a.subtype !== subtypeFilter) return false;
      return true;
    });
  }, [audiences, query, accountFilter, subtypeFilter]);

  const stats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of audiences) {
      counts.set(a.subtype, (counts.get(a.subtype) ?? 0) + 1);
    }
    return { total: audiences.length, counts };
  }, [audiences]);

  async function deleteAudience(a: Audience) {
    if (!confirm(`ลบ audience "${a.name}"? (ทำใน Meta จริง — ยกเลิกไม่ได้)`)) return;
    setBusy((prev) => new Set(prev).add(a.id));
    const toastId = toast.loading("กำลังลบ...");
    try {
      const res = await fetch(
        `/api/meta/audiences/${a.id}?tenantSlug=${tenantSlug}&metaAccountId=${a.accountId}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "ลบไม่สำเร็จ");
      }
      toast.success("✓ ลบแล้ว", { id: toastId, duration: 2500 });
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ลบไม่สำเร็จ", {
        id: toastId,
        duration: 5000,
      });
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(a.id);
        return next;
      });
    }
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        <TabButton active={tab === "audiences"} onClick={() => setTab("audiences")}>
          <Users className="size-3.5" />
          Audiences
          <span className="ml-1 rounded bg-muted px-1.5 text-[10px] tabular-nums">
            {audiences.length}
          </span>
        </TabButton>
        <TabButton active={tab === "pixels"} onClick={() => setTab("pixels")}>
          <Zap className="size-3.5" />
          Pixels
        </TabButton>
        <TabButton active={tab === "conversions"} onClick={() => setTab("conversions")}>
          <Target className="size-3.5" />
          Custom Conversions
        </TabButton>
        <TabButton active={tab === "events"} onClick={() => setTab("events")}>
          <Activity className="size-3.5" />
          Events (SDK)
          <span className="ml-1 rounded bg-emerald-100 px-1.5 text-[9px] font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            NEW
          </span>
        </TabButton>
      </div>

      {tab === "pixels" ? (
        <PixelsTab tenantSlug={tenantSlug} canEdit={canEdit} accounts={accounts} />
      ) : tab === "conversions" ? (
        <ConversionsTab tenantSlug={tenantSlug} canEdit={canEdit} accounts={accounts} />
      ) : tab === "events" ? (
        <EventsTab tenantSlug={tenantSlug} canEdit={canEdit} accounts={accounts} />
      ) : (
        <AudiencesTab
          canEdit={canEdit}
          accounts={accounts}
          audiences={audiences}
          filtered={filtered}
          stats={stats}
          query={query}
          setQuery={setQuery}
          subtypeFilter={subtypeFilter}
          setSubtypeFilter={setSubtypeFilter}
          accountFilter={accountFilter}
          setAccountFilter={setAccountFilter}
          busy={busy}
          deleteAudience={deleteAudience}
          onCreate={() => setCreateOpen(true)}
        />
      )}

      {/* Create modal */}
      {createOpen && (
        <CreateAudienceModal
          tenantSlug={tenantSlug}
          accounts={accounts}
          audiences={audiences}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            startTransition(() => router.refresh());
          }}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function AudiencesTab({
  canEdit,
  accounts,
  audiences,
  filtered,
  stats,
  query,
  setQuery,
  subtypeFilter,
  setSubtypeFilter,
  accountFilter,
  setAccountFilter,
  busy,
  deleteAudience,
  onCreate,
}: {
  canEdit: boolean;
  accounts: Account[];
  audiences: Audience[];
  filtered: Audience[];
  stats: { total: number; counts: Map<string, number> };
  query: string;
  setQuery: (s: string) => void;
  subtypeFilter: string;
  setSubtypeFilter: (s: string) => void;
  accountFilter: string;
  setAccountFilter: (s: string) => void;
  busy: Set<string>;
  deleteAudience: (a: Audience) => void;
  onCreate: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Stats + create button */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-3">
        <span className="text-sm">
          <span className="text-muted-foreground">รวม:</span>{" "}
          <span className="font-semibold tabular-nums">{stats.total}</span> audiences
        </span>
        {Array.from(stats.counts.entries()).map(([subtype, count]) => {
          const style = SUBTYPE_STYLE[subtype] ?? { label: subtype, tone: "", icon: Hash };
          return (
            <span key={subtype} className="text-xs text-muted-foreground">
              {style.label}: <span className="font-semibold tabular-nums">{count}</span>
            </span>
          );
        })}
        {canEdit && (
          <Button size="sm" onClick={onCreate} className="ml-auto gap-1.5">
            <Plus className="size-3.5" />
            สร้าง Audience
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card/40 px-3 py-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อ audience..."
            className="pl-8"
          />
        </div>
        <select
          value={subtypeFilter}
          onChange={(e) => setSubtypeFilter(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="ALL">ทุก type</option>
          <option value="CUSTOM">Customer list</option>
          <option value="WEBSITE">Pixel</option>
          <option value="LOOKALIKE">Lookalike</option>
          <option value="ENGAGEMENT">Engagement</option>
          <option value="APP">App</option>
        </select>
        <select
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="ALL">ทุก account</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          แสดง {filtered.length} / {audiences.length}
        </span>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 border-dashed py-12 text-center">
          <Users className="size-6 text-muted-foreground" />
          {audiences.length === 0 ? (
            <>
              <p className="text-sm font-medium">ยังไม่มี audience</p>
              <p className="max-w-md text-xs text-muted-foreground">
                สร้าง audience จาก customer list (อีเมล/เบอร์โทร), Lookalike,
                หรือ Pixel — ใช้ใน Campaign Builder ได้ทันที
              </p>
              {canEdit && (
                <Button size="sm" onClick={onCreate} className="gap-1.5">
                  <Plus className="size-3.5" />
                  สร้าง Audience ตัวแรก
                </Button>
              )}
            </>
          ) : (
            <p className="text-sm">ไม่พบ audience ที่ตรงเงื่อนไข</p>
          )}
        </Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {filtered.map((a) => {
              const style = SUBTYPE_STYLE[a.subtype] ?? {
                label: a.subtype,
                tone: "bg-muted text-muted-foreground",
                icon: Hash,
              };
              const Icon = style.icon;
              return (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-2.5"
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium" title={a.name}>
                      {a.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {a.accountName}
                      {a.description && ` · ${a.description.slice(0, 60)}`}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                      style.tone,
                    )}
                  >
                    {style.label}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    ~{formatCount(a.approximateCount)}
                  </span>
                  {canEdit && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={busy.has(a.id)}
                      onClick={() => deleteAudience(a)}
                      title="ลบ audience"
                      className="text-destructive"
                    >
                      {busy.has(a.id) ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ====== Pixels tab =================================================

type Pixel = {
  id: string;
  name: string;
  code: string | null;
  isUnavailable: boolean;
  lastFiredTime: string | null;
  creationTime: string | null;
  ownerBusiness: { id: string; name: string } | null;
  ownerAdAccount: { id: string; name: string } | null;
};

type PixelWithAccount = Pixel & { accountId: string; accountName: string };

// Deduped Pixel: collected once with all ad accounts it's attached to.
type GroupedPixel = Pixel & {
  /** Ad accounts in our tenant that this Pixel is currently shared with. */
  linkedAccounts: { id: string; name: string }[];
};

function PixelsTab({
  tenantSlug,
  canEdit,
  accounts,
}: {
  tenantSlug: string;
  canEdit: boolean;
  accounts: Account[];
}) {
  const [rawPixels, setRawPixels] = useState<PixelWithAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [codeFor, setCodeFor] = useState<PixelWithAccount | null>(null);
  const [shareFor, setShareFor] = useState<GroupedPixel | null>(null);
  const [bmFilter, setBmFilter] = useState("ALL");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all(
      accounts.map(async (acc) => {
        try {
          const res = await fetch(
            `/api/meta/pixels?tenantSlug=${tenantSlug}&metaAccountId=${acc.id}`,
          );
          const data = await res.json();
          const items: Pixel[] = data.pixels ?? [];
          return items.map((p) => ({
            ...p,
            accountId: acc.id,
            accountName: acc.name,
          }));
        } catch {
          return [];
        }
      }),
    )
      .then((arr) => {
        if (cancelled) return;
        setRawPixels(arr.flat());
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setRawPixels([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, accounts, refreshKey]);

  // Group raw pixels by Pixel ID so each Pixel shows once with all its
  // shared ad accounts. The raw list comes from fanning out a Pixel-by-
  // ad-account fetch — a shared Pixel will appear N times (once per
  // attached account), so dedup is essential.
  const grouped = useMemo<GroupedPixel[]>(() => {
    const byId = new Map<string, GroupedPixel>();
    for (const p of rawPixels) {
      const existing = byId.get(p.id);
      const accEntry = { id: p.accountId, name: p.accountName };
      if (existing) {
        if (!existing.linkedAccounts.some((a) => a.id === accEntry.id)) {
          existing.linkedAccounts.push(accEntry);
        }
      } else {
        byId.set(p.id, {
          id: p.id,
          name: p.name,
          code: p.code,
          isUnavailable: p.isUnavailable,
          lastFiredTime: p.lastFiredTime,
          creationTime: p.creationTime,
          ownerBusiness: p.ownerBusiness,
          ownerAdAccount: p.ownerAdAccount,
          linkedAccounts: [accEntry],
        });
      }
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [rawPixels]);

  // BM list with Pixel counts (for the limit hint + filter dropdown).
  const bmGroups = useMemo(() => {
    const m = new Map<string, { id: string; name: string; count: number }>();
    for (const p of grouped) {
      const key = p.ownerBusiness?.id ?? "__none__";
      const name = p.ownerBusiness?.name ?? "(ไม่มี BM)";
      const existing = m.get(key);
      if (existing) existing.count++;
      else m.set(key, { id: key, name, count: 1 });
    }
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [grouped]);

  const filtered = grouped.filter(
    (p) => bmFilter === "ALL" || (p.ownerBusiness?.id ?? "__none__") === bmFilter,
  );

  // For "Copy code" / "Share" modals we still need accountId — use the
  // first linked account (any of them works for the Meta endpoints).
  function asWithAccount(p: GroupedPixel): PixelWithAccount {
    const first = p.linkedAccounts[0] ?? { id: "", name: "" };
    return { ...p, accountId: first.id, accountName: first.name };
  }

  return (
    <div className="space-y-4">
      {/* Educational banner — explains BM Pixel cap + share workflow */}
      <Card className="space-y-1 border-blue-200 bg-blue-50/60 p-3 text-xs text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
        <p className="font-medium">💡 ทำไม Pixel สร้างได้แค่ไม่กี่ตัว?</p>
        <ul className="ml-4 list-disc space-y-0.5 text-[11px] leading-relaxed">
          <li>
            Meta limit <strong>5 Pixels ต่อ Business Manager</strong> (ถ้า BM ไม่ verify) —
            ถ้า verify BM แล้วจะได้สูงสุด 100 Pixels
          </li>
          <li>
            แต่ <strong>1 Pixel ใช้กับหลาย ad accounts ได้</strong> ใน BM เดียวกัน — กดปุ่ม
            &ldquo;Share&rdquo; เพื่อขยาย Pixel ไปยัง ad accounts อื่น
          </li>
          <li>Pixel แต่ละตัว = 1 เว็บไซต์ / 1 ลูกค้า ไม่ใช่ 1 ad account</li>
        </ul>
      </Card>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-3">
        <span className="text-sm">
          <span className="text-muted-foreground">Pixels ทั้งหมด:</span>{" "}
          <span className="font-semibold tabular-nums">{grouped.length}</span>
        </span>
        {bmGroups.map((bm) => (
          <span key={bm.id} className="text-[11px] text-muted-foreground">
            {bm.name}:{" "}
            <span className="font-semibold tabular-nums text-foreground">{bm.count}/5</span>
          </span>
        ))}
        <select
          value={bmFilter}
          onChange={(e) => setBmFilter(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="ALL">ทุก Business</option>
          {bmGroups.map((bm) => (
            <option key={bm.id} value={bm.id}>
              {bm.name} ({bm.count})
            </option>
          ))}
        </select>
        {canEdit && (
          <Button size="sm" onClick={() => setCreateOpen(true)} className="ml-auto gap-1.5">
            <Plus className="size-3.5" />
            สร้าง Pixel
          </Button>
        )}
      </div>

      {loading ? (
        <Card className="flex items-center justify-center gap-2 border-dashed py-12">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">กำลังโหลด Pixels...</span>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 border-dashed py-12 text-center">
          <Zap className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">ยังไม่มี Pixel</p>
          <p className="max-w-md text-xs text-muted-foreground">
            สร้าง Pixel เพื่อติด tracking code บนเว็บไซต์ — แล้วจึงสร้าง Website Custom Audience
            จากคนที่เข้าเว็บได้
          </p>
          {canEdit && (
            <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
              <Plus className="size-3.5" />
              สร้าง Pixel ตัวแรก
            </Button>
          )}
        </Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {filtered.map((p) => {
              const bmUrl = p.ownerBusiness
                ? `https://business.facebook.com/events_manager2/list/pixel?business_id=${p.ownerBusiness.id}`
                : `https://business.facebook.com/events_manager2/list/pixel`;
              return (
                <li key={p.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <Zap
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      p.isUnavailable ? "text-muted-foreground" : "text-emerald-600",
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium" title={p.name}>
                      {p.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      ID {p.id}
                      {p.ownerBusiness && ` · BM: ${p.ownerBusiness.name}`}
                      {p.lastFiredTime && ` · ยิงล่าสุด ${formatRelativeTime(p.lastFiredTime)}`}
                    </p>
                    <p className="mt-1 text-[11px]">
                      <span className="text-muted-foreground">
                        ใช้กับ {p.linkedAccounts.length} ad account
                        {p.linkedAccounts.length > 1 ? "s" : ""}:
                      </span>{" "}
                      <span className="text-foreground">
                        {p.linkedAccounts.slice(0, 3).map((a) => a.name).join(", ")}
                        {p.linkedAccounts.length > 3 &&
                          ` +${p.linkedAccounts.length - 3} อื่นๆ`}
                      </span>
                    </p>
                  </div>
                  {p.isUnavailable && (
                    <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                      unavailable
                    </span>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={bmUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      title="เปิดใน Events Manager (Facebook)"
                    >
                      <ExternalLink className="size-3.5" />
                      Events Manager
                    </a>
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShareFor(p)}
                        className="gap-1.5"
                        title="ใช้ Pixel นี้กับ ad account อื่นใน BM เดียวกัน"
                      >
                        <Plus className="size-3.5" />
                        Share
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCodeFor(asWithAccount(p))}
                      className="gap-1.5"
                    >
                      <Copy className="size-3.5" />
                      Copy code
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {createOpen && (
        <CreatePixelModal
          tenantSlug={tenantSlug}
          accounts={accounts}
          onClose={() => setCreateOpen(false)}
          onCreated={(pixel) => {
            setCreateOpen(false);
            setRefreshKey((k) => k + 1);
            setCodeFor(pixel);
          }}
        />
      )}

      {codeFor && <PixelCodeModal pixel={codeFor} onClose={() => setCodeFor(null)} />}

      {shareFor && (
        <SharePixelModal
          tenantSlug={tenantSlug}
          accounts={accounts}
          pixel={shareFor}
          onClose={() => setShareFor(null)}
          onShared={() => {
            setShareFor(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

function SharePixelModal({
  tenantSlug,
  accounts,
  pixel,
  onClose,
  onShared,
}: {
  tenantSlug: string;
  accounts: Account[];
  pixel: GroupedPixel;
  onClose: () => void;
  onShared: () => void;
}) {
  // Only ad accounts in the SAME BM as the Pixel can receive it. Filter
  // out accounts already linked + ones from a different BM.
  const linkedIds = new Set(pixel.linkedAccounts.map((a) => a.id));
  const ownerBusinessId = pixel.ownerBusiness?.id ?? null;
  const candidates = accounts.filter(
    (a) =>
      !linkedIds.has(a.id) &&
      ownerBusinessId !== null &&
      a.businessId === ownerBusinessId,
  );

  const [targetAdAccountId, setTargetAdAccountId] = useState(candidates[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!targetAdAccountId) return toast.error("เลือก ad account");
    setSubmitting(true);
    const toastId = toast.loading("กำลัง share Pixel...");
    try {
      const res = await fetch(
        `/api/meta/pixels/${pixel.id}/share?tenantSlug=${tenantSlug}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetAdAccountId }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Share ไม่สำเร็จ");
      }
      toast.success(`✓ Share Pixel ไป "${data.sharedTo.name}"`, {
        id: toastId,
        duration: 3000,
      });
      onShared();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Share ไม่สำเร็จ", {
        id: toastId,
        duration: 6000,
      });
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
        className="w-full max-w-md space-y-4 rounded-lg border border-border bg-background p-5 shadow-lg"
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold">Share Pixel</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              ขยาย <span className="font-medium text-foreground">{pixel.name}</span>{" "}
              ไปยัง ad account อื่นใน BM เดียวกัน
              {pixel.ownerBusiness && (
                <>
                  {" "}
                  (<span className="text-foreground">{pixel.ownerBusiness.name}</span>)
                </>
              )}
            </p>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        {!ownerBusinessId ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
            Pixel นี้ไม่ได้อยู่ใน Business Manager — share ไม่ได้
          </div>
        ) : candidates.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            ไม่มี ad account อื่นใน BM นี้ที่ยังไม่ได้รับ Pixel แล้ว — Pixel นี้ใช้กับทุก
            ad account ใน BM แล้วครับ
          </div>
        ) : (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Target Ad Account
              </label>
              <select
                value={targetAdAccountId}
                onChange={(e) => setTargetAdAccountId(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                {candidates.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                แสดงเฉพาะ ad accounts ที่อยู่ใน BM เดียวกัน — Meta ไม่อนุญาตให้ share ข้าม BM
              </p>
            </div>

            <div className="flex justify-between gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
                ยกเลิก
              </Button>
              <Button size="sm" onClick={submit} disabled={submitting || !targetAdAccountId}>
                {submitting ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
                Share Pixel
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const diffMs = Date.now() - then;
  const min = Math.floor(diffMs / 60_000);
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ชม. ที่แล้ว`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days} วันที่แล้ว`;
  const months = Math.floor(days / 30);
  return `${months} เดือนที่แล้ว`;
}

function CreatePixelModal({
  tenantSlug,
  accounts,
  onClose,
  onCreated,
}: {
  tenantSlug: string;
  accounts: Account[];
  onClose: () => void;
  onCreated: (pixel: PixelWithAccount) => void;
}) {
  const [metaAccountId, setMetaAccountId] = useState(accounts[0]?.id ?? "");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedAccount = accounts.find((a) => a.id === metaAccountId);

  async function submit() {
    if (!name.trim()) return toast.error("ตั้งชื่อ Pixel");
    setSubmitting(true);
    const toastId = toast.loading("กำลังสร้าง Pixel...");
    try {
      const res = await fetch(`/api/meta/pixels?tenantSlug=${tenantSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metaAccountId, name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "สร้างไม่สำเร็จ");
      }
      toast.success(`✓ สร้าง Pixel "${data.pixel.name}"`, { id: toastId, duration: 3000 });
      onCreated({
        id: data.pixel.id,
        name: data.pixel.name,
        code: data.pixel.code,
        isUnavailable: false,
        lastFiredTime: null,
        creationTime: new Date().toISOString(),
        ownerBusiness: data.pixel.ownerBusiness ?? null,
        ownerAdAccount: data.pixel.ownerAdAccount ?? null,
        accountId: metaAccountId,
        accountName: selectedAccount?.name ?? metaAccountId,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "สร้างไม่สำเร็จ", {
        id: toastId,
        duration: 7000,
      });
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
        className="w-full max-w-md space-y-4 rounded-lg border border-border bg-background p-5 shadow-lg"
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold">สร้าง Pixel ใหม่</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Pixel ใช้ติด tracking code บนเว็บไซต์
            </p>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Ad Account
          </label>
          <select
            value={metaAccountId}
            onChange={(e) => setMetaAccountId(e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          {selectedAccount?.business && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Pixel จะถูกฝากไว้ใน Business Manager:{" "}
              <span className="font-medium text-foreground">{selectedAccount.business}</span>{" "}
              — ดูใน Events Manager หลังจากสร้าง
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            ชื่อ Pixel
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น Main Website Pixel"
          />
        </div>

        <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-[11px] text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
          ⚠ Meta จำกัด <strong>1 Pixel ต่อ ad account</strong> — ถ้า account นี้มี Pixel
          อยู่แล้ว ระบบจะแจ้งเตือนแทนการสร้างซ้ำ
        </div>

        <div className="flex justify-between gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            ยกเลิก
          </Button>
          <Button size="sm" onClick={submit} disabled={submitting || !name.trim()}>
            {submitting ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
            สร้าง Pixel
          </Button>
        </div>
      </div>
    </div>
  );
}

function PixelCodeModal({
  pixel,
  onClose,
}: {
  pixel: PixelWithAccount;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!pixel.code) return;
    try {
      await navigator.clipboard.writeText(pixel.code);
      setCopied(true);
      toast.success("คัดลอกแล้ว", { duration: 2000 });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("คัดลอกไม่สำเร็จ");
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
            <h3 className="text-base font-semibold">Install Code — {pixel.name}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              วาง code นี้ใน &lt;head&gt; ของทุกหน้าในเว็บไซต์ (Pixel ID {pixel.id})
            </p>
            {pixel.ownerBusiness && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                ฝากไว้ใน BM:{" "}
                <span className="font-medium text-foreground">{pixel.ownerBusiness.name}</span>
                {" — "}
                <a
                  href={`https://business.facebook.com/events_manager2/list/pixel?business_id=${pixel.ownerBusiness.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  เปิด Events Manager <ExternalLink className="size-3" />
                </a>
              </p>
            )}
          </div>
          <Button size="icon-sm" variant="ghost" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        {pixel.code ? (
          <>
            <pre className="max-h-[50vh] overflow-auto rounded-md border border-border bg-muted/30 p-3 text-[11px] leading-relaxed">
              {pixel.code}
            </pre>
            <div className="flex justify-end gap-2">
              <Button size="sm" onClick={copy} className="gap-1.5">
                {copied ? (
                  <>
                    <Check className="size-3.5" /> คัดลอกแล้ว
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" /> Copy code
                  </>
                )}
              </Button>
            </div>
          </>
        ) : (
          <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            ยังไม่มี install code — ลอง refresh
          </p>
        )}
      </div>
    </div>
  );
}

// ====== Create Audience Modal ======================================

type CreateStep =
  | { kind: "pick" }
  | { kind: "customer-list" }
  | { kind: "lookalike" }
  | { kind: "website" };

function CreateAudienceModal({
  tenantSlug,
  accounts,
  audiences,
  onClose,
  onCreated,
}: {
  tenantSlug: string;
  accounts: Account[];
  audiences: Audience[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState<CreateStep>({ kind: "pick" });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl space-y-4 rounded-lg border border-border bg-background p-5 shadow-lg"
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold">สร้าง Audience ใหม่</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              เลือกแหล่งข้อมูลที่จะใช้สร้าง audience
            </p>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        {step.kind === "pick" && (
          <div className="space-y-2">
            <TypeOption
              icon={Users}
              title="Customer list"
              desc="อัพโหลดอีเมล/เบอร์โทรลูกค้าเดิม → retarget"
              available
              onClick={() => setStep({ kind: "customer-list" })}
            />
            <TypeOption
              icon={Globe}
              title="Website visitors (Pixel)"
              desc="คนเข้าเว็บไซต์ จับโดย Pixel — retarget visitors"
              available
              onClick={() => setStep({ kind: "website" })}
            />
            <TypeOption
              icon={Layers}
              title="Lookalike"
              desc="คนคล้ายกับ audience ที่มีอยู่ — expand prospecting"
              available
              onClick={() => setStep({ kind: "lookalike" })}
            />
          </div>
        )}

        {step.kind === "customer-list" && (
          <CustomerListForm
            tenantSlug={tenantSlug}
            accounts={accounts}
            onBack={() => setStep({ kind: "pick" })}
            onCreated={onCreated}
          />
        )}

        {step.kind === "lookalike" && (
          <LookalikeForm
            tenantSlug={tenantSlug}
            accounts={accounts}
            audiences={audiences}
            onBack={() => setStep({ kind: "pick" })}
            onCreated={onCreated}
          />
        )}

        {step.kind === "website" && (
          <WebsiteForm
            tenantSlug={tenantSlug}
            accounts={accounts}
            onBack={() => setStep({ kind: "pick" })}
            onCreated={onCreated}
          />
        )}
      </div>
    </div>
  );
}

function TypeOption({
  icon: Icon,
  title,
  desc,
  available,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  available?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors",
        available
          ? "border-primary/30 hover:bg-primary/5"
          : "border-border bg-muted/20 opacity-70",
      )}
    >
      <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">
          {title}
          {!available && (
            <span className="ml-2 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] uppercase text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              soon
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </button>
  );
}

// ====== Customer list form (CSV → hash → upload) ====================

async function sha256(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}

function normalizePhone(s: string): string | null {
  // Strip non-digits and "+". Add Thai country code if missing.
  const digits = s.replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return digits;
  // Thai phone: starts with 0 → replace with +66
  if (digits.startsWith("0") && digits.length === 10) {
    return `+66${digits.slice(1)}`;
  }
  // Already in +66 / 66 form
  if (digits.startsWith("66") && digits.length === 11) {
    return `+${digits}`;
  }
  return null;
}

const MIN_ROWS = 100;

function CustomerListForm({
  tenantSlug,
  accounts,
  onBack,
  onCreated,
}: {
  tenantSlug: string;
  accounts: Account[];
  onBack: () => void;
  onCreated: () => void;
}) {
  const [metaAccountId, setMetaAccountId] = useState(accounts[0]?.id ?? "");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [phones, setPhones] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleFile(file: File) {
    setParsing(true);
    try {
      const text = await file.text();
      // Simple CSV parser — split by newline, then by comma. Handles
      // bare email-per-line files too.
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const collectedEmails: string[] = [];
      const collectedPhones: string[] = [];
      for (const line of lines) {
        // Try each cell — could be email or phone in any column
        const cells = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
        for (const cell of cells) {
          if (!cell) continue;
          if (cell.includes("@")) {
            collectedEmails.push(normalizeEmail(cell));
          } else if (/\d/.test(cell)) {
            const norm = normalizePhone(cell);
            if (norm) collectedPhones.push(norm);
          }
        }
      }
      // Dedupe
      setEmails(Array.from(new Set(collectedEmails)));
      setPhones(Array.from(new Set(collectedPhones)));
    } catch (err) {
      toast.error("Parse CSV ไม่สำเร็จ: " + (err as Error).message);
    } finally {
      setParsing(false);
    }
  }

  const totalRows = emails.length + phones.length;

  async function submit() {
    if (!name.trim()) return toast.error("ตั้งชื่อ audience");
    if (totalRows < MIN_ROWS) {
      return toast.error(`ต้องมีอย่างน้อย ${MIN_ROWS} แถว (Meta minimum) — ตอนนี้มี ${totalRows}`);
    }

    setSubmitting(true);
    const toastId = toast.loading(
      `กำลัง hash ${totalRows.toLocaleString()} แถว...`,
    );
    try {
      const hashedEmails = await Promise.all(emails.map(sha256));
      const hashedPhones = await Promise.all(phones.map(sha256));

      toast.loading("กำลังสร้าง audience + อัพโหลด...", { id: toastId });
      const res = await fetch(
        `/api/meta/audiences/customer-list?tenantSlug=${tenantSlug}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            metaAccountId,
            name: name.trim(),
            description: description.trim() || undefined,
            hashedEmails,
            hashedPhones,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "สร้างไม่สำเร็จ");
      }
      toast.success(
        `✓ สร้าง "${data.audience.name}" สำเร็จ — ${data.usersUploaded?.toLocaleString() ?? "?"} แถว`,
        { id: toastId, duration: 4000 },
      );
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "สร้างไม่สำเร็จ", {
        id: toastId,
        duration: 6000,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Ad Account
        </label>
        <select
          value={metaAccountId}
          onChange={(e) => setMetaAccountId(e.target.value)}
          className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          ชื่อ Audience
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="เช่น Customers Q1 2026"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          คำอธิบาย (optional)
        </label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="เช่น Email list จาก Shopify, ครั้งล่าสุด 1 เม.ย. 2026"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          อัพโหลด CSV (อีเมล / เบอร์โทร)
        </label>
        <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-md border-2 border-dashed border-border p-4 hover:bg-muted/20">
          {parsing ? (
            <>
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">กำลังอ่านไฟล์...</span>
            </>
          ) : totalRows > 0 ? (
            <>
              <span className="text-sm font-medium">
                ✓ พบ {emails.length.toLocaleString()} email + {phones.length.toLocaleString()} เบอร์โทร
              </span>
              <span className="text-[11px] text-muted-foreground">
                กดเพื่อเปลี่ยนไฟล์
              </span>
            </>
          ) : (
            <>
              <Upload className="size-5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                เลือก CSV / TXT — column ไหนก็ได้ (email หรือ phone)
              </span>
            </>
          )}
          <input
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </label>
        {totalRows > 0 && totalRows < MIN_ROWS && (
          <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-300">
            ⚠ Meta ต้องการอย่างน้อย {MIN_ROWS} แถว — ตอนนี้มี {totalRows}
          </p>
        )}
        {totalRows >= MIN_ROWS && (
          <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-300">
            ✓ พร้อมส่ง — PII จะถูก hash ด้วย SHA-256 ในเบราว์เซอร์ (server ไม่เห็น raw data)
          </p>
        )}
      </div>

      <div className="flex justify-between gap-2 pt-2">
        <Button variant="ghost" size="sm" onClick={onBack} disabled={submitting}>
          ← กลับ
        </Button>
        <Button size="sm" onClick={submit} disabled={submitting || totalRows < MIN_ROWS}>
          {submitting ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
          สร้าง Audience
        </Button>
      </div>
    </div>
  );
}

// ====== Lookalike form ============================================

const LOOKALIKE_RATIOS = [
  { label: "1%", value: 0.01, hint: "ใกล้เคียงที่สุด (~แคบ)" },
  { label: "3%", value: 0.03, hint: "ใกล้เคียง" },
  { label: "5%", value: 0.05, hint: "ผสมๆ" },
  { label: "10%", value: 0.1, hint: "กว้างที่สุด" },
];

function LookalikeForm({
  tenantSlug,
  accounts,
  audiences,
  onBack,
  onCreated,
}: {
  tenantSlug: string;
  accounts: Account[];
  audiences: Audience[];
  onBack: () => void;
  onCreated: () => void;
}) {
  const [metaAccountId, setMetaAccountId] = useState(accounts[0]?.id ?? "");
  const [name, setName] = useState("");
  const [sourceAudienceId, setSourceAudienceId] = useState("");
  const [country, setCountry] = useState("TH");
  const [ratio, setRatio] = useState(0.01);
  const [submitting, setSubmitting] = useState(false);

  // Lookalike-eligible sources: same account + NOT already a Lookalike
  // (Meta rejects lookalike-from-lookalike) + has size > 100.
  const sources = audiences.filter(
    (a) =>
      a.accountId === metaAccountId &&
      a.subtype !== "LOOKALIKE" &&
      (a.approximateCount ?? 0) >= 100,
  );

  async function submit() {
    if (!name.trim()) return toast.error("ตั้งชื่อ Lookalike");
    if (!sourceAudienceId) return toast.error("เลือก source audience");

    setSubmitting(true);
    const toastId = toast.loading("กำลังสร้าง Lookalike...");
    try {
      const res = await fetch(
        `/api/meta/audiences/lookalike?tenantSlug=${tenantSlug}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            metaAccountId,
            name: name.trim(),
            sourceAudienceId,
            country: country.toUpperCase(),
            ratio,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "สร้างไม่สำเร็จ");
      }
      toast.success(`✓ สร้าง Lookalike "${data.audience.name}" สำเร็จ — Meta คำนวณภายใน ~6 ชม.`, {
        id: toastId,
        duration: 6000,
      });
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "สร้างไม่สำเร็จ", {
        id: toastId,
        duration: 5000,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Ad Account
        </label>
        <select
          value={metaAccountId}
          onChange={(e) => {
            setMetaAccountId(e.target.value);
            setSourceAudienceId("");
          }}
          className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Source Audience (audience ต้นแบบ)
        </label>
        {sources.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            ไม่มี source audience ที่ใช้ได้ใน account นี้ — ต้องมี Custom/Website audience
            ขนาด ≥ 100 ก่อน
          </p>
        ) : (
          <select
            value={sourceAudienceId}
            onChange={(e) => setSourceAudienceId(e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">-- เลือก source --</option>
            {sources.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} (~{formatCount(a.approximateCount)})
              </option>
            ))}
          </select>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          ชื่อ Lookalike
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="เช่น Lookalike Customers TH 1%"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            ประเทศ (ISO code)
          </label>
          <Input
            value={country}
            onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))}
            placeholder="TH"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Similarity
          </label>
          <select
            value={ratio}
            onChange={(e) => setRatio(Number(e.target.value))}
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
          >
            {LOOKALIKE_RATIOS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label} — {r.hint}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Lookalike จะใช้เวลา ~6 ชม. ในการประมวลผล — ขนาดจะเริ่มที่ 0 แล้วเพิ่มขึ้น
      </p>

      <div className="flex justify-between gap-2 pt-2">
        <Button variant="ghost" size="sm" onClick={onBack} disabled={submitting}>
          ← กลับ
        </Button>
        <Button size="sm" onClick={submit} disabled={submitting || !sourceAudienceId}>
          {submitting ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
          สร้าง Lookalike
        </Button>
      </div>
    </div>
  );
}

// ====== Website (Pixel) form ======================================

type PixelOption = { id: string; name: string };

function WebsiteForm({
  tenantSlug,
  accounts,
  onBack,
  onCreated,
}: {
  tenantSlug: string;
  accounts: Account[];
  onBack: () => void;
  onCreated: () => void;
}) {
  const [metaAccountId, setMetaAccountId] = useState(accounts[0]?.id ?? "");
  const [name, setName] = useState("");
  const [pixels, setPixels] = useState<PixelOption[]>([]);
  const [loadingPixels, setLoadingPixels] = useState(false);
  const [pixelId, setPixelId] = useState("");
  const [retentionDays, setRetentionDays] = useState(30);
  const [ruleKind, setRuleKind] = useState<"all-visitors" | "url-contains" | "event">("all-visitors");
  const [ruleValue, setRuleValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Load pixels when account changes
  useEffect(() => {
    if (!metaAccountId) return;
    let cancelled = false;
    setLoadingPixels(true);
    setPixelId("");
    fetch(`/api/meta/pixels?tenantSlug=${tenantSlug}&metaAccountId=${metaAccountId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setPixels(d.pixels ?? []);
      })
      .catch(() => {
        if (!cancelled) setPixels([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingPixels(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, metaAccountId]);

  async function submit() {
    if (!name.trim()) return toast.error("ตั้งชื่อ audience");
    if (!pixelId) return toast.error("เลือก Pixel");
    if (ruleKind !== "all-visitors" && !ruleValue.trim()) {
      return toast.error("กรอกค่าเงื่อนไข");
    }

    setSubmitting(true);
    const toastId = toast.loading("กำลังสร้าง audience...");
    try {
      const rule =
        ruleKind === "all-visitors"
          ? { kind: "all-visitors" as const }
          : ruleKind === "url-contains"
            ? { kind: "url-contains" as const, value: ruleValue.trim() }
            : { kind: "event" as const, eventName: ruleValue.trim() };

      const res = await fetch(`/api/meta/audiences/website?tenantSlug=${tenantSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metaAccountId,
          name: name.trim(),
          pixelId,
          retentionDays,
          rule,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "สร้างไม่สำเร็จ");
      }
      toast.success(`✓ สร้าง "${data.audience.name}"`, { id: toastId, duration: 3000 });
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "สร้างไม่สำเร็จ", {
        id: toastId,
        duration: 5000,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Ad Account</label>
        <select
          value={metaAccountId}
          onChange={(e) => setMetaAccountId(e.target.value)}
          className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Pixel {loadingPixels && "(loading...)"}
        </label>
        {pixels.length === 0 && !loadingPixels ? (
          <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            ไม่มี Pixel ใน account นี้ — สร้าง Pixel ก่อน (Tab &ldquo;Pixels&rdquo;)
          </p>
        ) : (
          <select
            value={pixelId}
            onChange={(e) => setPixelId(e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">-- เลือก Pixel --</option>
            {pixels.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          ชื่อ Audience
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="เช่น Website visitors 30d"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          เงื่อนไข
        </label>
        <select
          value={ruleKind}
          onChange={(e) => setRuleKind(e.target.value as typeof ruleKind)}
          className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="all-visitors">ทุกคนที่เข้าเว็บ</option>
          <option value="url-contains">URL ที่มีคำว่า...</option>
          <option value="event">Pixel event = ...</option>
        </select>
        {ruleKind === "url-contains" && (
          <Input
            value={ruleValue}
            onChange={(e) => setRuleValue(e.target.value)}
            placeholder="เช่น /product หรือ /thank-you"
            className="mt-1"
          />
        )}
        {ruleKind === "event" && (
          <Input
            value={ruleValue}
            onChange={(e) => setRuleValue(e.target.value)}
            placeholder="เช่น Purchase, AddToCart, Lead"
            className="mt-1"
          />
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          เก็บข้อมูล (วัน)
        </label>
        <select
          value={retentionDays}
          onChange={(e) => setRetentionDays(Number(e.target.value))}
          className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
        >
          {[7, 14, 30, 60, 90, 180].map((d) => (
            <option key={d} value={d}>
              {d} วัน
            </option>
          ))}
        </select>
      </div>

      <div className="flex justify-between gap-2 pt-2">
        <Button variant="ghost" size="sm" onClick={onBack} disabled={submitting}>
          ← กลับ
        </Button>
        <Button size="sm" onClick={submit} disabled={submitting || !pixelId}>
          {submitting ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
          สร้าง Audience
        </Button>
      </div>
    </div>
  );
}

// ====== Custom Conversions tab =====================================
//
// Custom Conversions sit on top of a Pixel: define a URL rule (e.g.
// "URL contains /thank-you") and Meta maps matched PageViews to a
// standard event category (PURCHASE / LEAD / ...). Lets users track
// conversions without writing event code on the website.

type ConversionEventType =
  | "PURCHASE" | "ADD_TO_CART" | "INITIATE_CHECKOUT" | "LEAD"
  | "COMPLETE_REGISTRATION" | "ADD_PAYMENT_INFO" | "VIEW_CONTENT"
  | "SEARCH" | "SUBSCRIBE" | "CONTACT" | "ADD_TO_WISHLIST"
  | "FIND_LOCATION" | "DONATE" | "SCHEDULE" | "START_TRIAL"
  | "SUBMIT_APPLICATION" | "CUSTOMIZE_PRODUCT" | "OTHER";

const CONVERSION_EVENT_TYPES: { value: ConversionEventType; label: string }[] = [
  { value: "PURCHASE", label: "Purchase — ซื้อสำเร็จ" },
  { value: "ADD_TO_CART", label: "Add to Cart — ใส่ตะกร้า" },
  { value: "INITIATE_CHECKOUT", label: "Initiate Checkout — เริ่ม checkout" },
  { value: "LEAD", label: "Lead — กรอกฟอร์ม" },
  { value: "COMPLETE_REGISTRATION", label: "Complete Registration — สมัครสมาชิก" },
  { value: "ADD_PAYMENT_INFO", label: "Add Payment Info — กรอกข้อมูลจ่าย" },
  { value: "VIEW_CONTENT", label: "View Content — ดูสินค้า" },
  { value: "SEARCH", label: "Search — ค้นหา" },
  { value: "SUBSCRIBE", label: "Subscribe — สมัครรับข้อมูล" },
  { value: "CONTACT", label: "Contact — ติดต่อ" },
  { value: "ADD_TO_WISHLIST", label: "Add to Wishlist" },
  { value: "FIND_LOCATION", label: "Find Location" },
  { value: "DONATE", label: "Donate" },
  { value: "SCHEDULE", label: "Schedule" },
  { value: "START_TRIAL", label: "Start Trial" },
  { value: "SUBMIT_APPLICATION", label: "Submit Application" },
  { value: "CUSTOMIZE_PRODUCT", label: "Customize Product" },
  { value: "OTHER", label: "Other — กำหนดเอง" },
];

type CustomConversion = {
  id: string;
  name: string;
  description: string | null;
  pixelId: string | null;
  pixelName: string | null;
  customEventType: string | null;
  rule: string | null;
  defaultConversionValue: number | null;
  creationTime: string | null;
};

type ConversionWithAccount = CustomConversion & {
  accountId: string;
  accountName: string;
};

function ConversionsTab({
  tenantSlug,
  canEdit,
  accounts,
}: {
  tenantSlug: string;
  canEdit: boolean;
  accounts: Account[];
}) {
  const [conversions, setConversions] = useState<ConversionWithAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [accountFilter, setAccountFilter] = useState("ALL");
  const [busy, setBusy] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all(
      accounts.map(async (acc) => {
        try {
          const res = await fetch(
            `/api/meta/custom-conversions?tenantSlug=${tenantSlug}&metaAccountId=${acc.id}`,
          );
          const data = await res.json();
          const items: CustomConversion[] = data.conversions ?? [];
          return items.map((c) => ({
            ...c,
            accountId: acc.id,
            accountName: acc.name,
          }));
        } catch {
          return [];
        }
      }),
    )
      .then((arr) => {
        if (cancelled) return;
        setConversions(arr.flat());
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setConversions([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, accounts, refreshKey]);

  const filtered = conversions.filter(
    (c) => accountFilter === "ALL" || c.accountId === accountFilter,
  );

  async function deleteConversion(c: ConversionWithAccount) {
    if (!confirm(`ลบ Custom Conversion "${c.name}"? (ทำใน Meta จริง — ยกเลิกไม่ได้)`)) {
      return;
    }
    setBusy((prev) => new Set(prev).add(c.id));
    const toastId = toast.loading("กำลังลบ...");
    try {
      const res = await fetch(
        `/api/meta/custom-conversions/${c.id}?tenantSlug=${tenantSlug}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "ลบไม่สำเร็จ");
      }
      toast.success("✓ ลบแล้ว", { id: toastId, duration: 2500 });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ลบไม่สำเร็จ", {
        id: toastId,
        duration: 5000,
      });
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(c.id);
        return next;
      });
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-1 border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
        <p className="font-medium">✨ Custom Conversion คืออะไร?</p>
        <ul className="ml-4 list-disc space-y-0.5 text-[11px] leading-relaxed">
          <li>
            กำหนด URL pattern → conversion event โดยไม่ต้องเขียน code event บนเว็บ
          </li>
          <li>
            เช่น &ldquo;URL ที่มีคำว่า <code>/thank-you</code>&rdquo; = Purchase event
            (Meta จะนับให้อัตโนมัติ)
          </li>
          <li>เหมาะกับเว็บที่ติด Pixel basic แล้ว แต่ไม่มี dev มา map events</li>
        </ul>
      </Card>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-3">
        <span className="text-sm">
          <span className="text-muted-foreground">รวม:</span>{" "}
          <span className="font-semibold tabular-nums">{conversions.length}</span> custom
          conversions
        </span>
        <select
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="ALL">ทุก account</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        {canEdit && (
          <Button size="sm" onClick={() => setCreateOpen(true)} className="ml-auto gap-1.5">
            <Plus className="size-3.5" />
            สร้าง Custom Conversion
          </Button>
        )}
      </div>

      {loading ? (
        <Card className="flex items-center justify-center gap-2 border-dashed py-12">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">กำลังโหลด...</span>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 border-dashed py-12 text-center">
          <Target className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">ยังไม่มี Custom Conversion</p>
          <p className="max-w-md text-xs text-muted-foreground">
            สร้าง Custom Conversion เพื่อ map URL → conversion event โดยไม่ต้องเขียน
            event code บนเว็บ
          </p>
          {canEdit && (
            <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
              <Plus className="size-3.5" />
              สร้าง Custom Conversion ตัวแรก
            </Button>
          )}
        </Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {filtered.map((c) => (
              <li key={c.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                <Target className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium" title={c.name}>
                    {c.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {c.accountName}
                    {c.pixelName && ` · Pixel: ${c.pixelName}`}
                    {c.customEventType && ` · Category: ${c.customEventType}`}
                  </p>
                  {c.rule && (
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">
                      Rule: <code className="text-foreground">{formatRule(c.rule)}</code>
                    </p>
                  )}
                </div>
                {canEdit && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={busy.has(c.id)}
                    onClick={() => deleteConversion(c)}
                    title="ลบ Custom Conversion"
                    className="text-destructive"
                  >
                    {busy.has(c.id) ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {createOpen && (
        <CreateConversionModal
          tenantSlug={tenantSlug}
          accounts={accounts}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

// Meta's rule format is verbose JSON. Show a human-readable summary.
function formatRule(rule: string): string {
  try {
    const parsed = JSON.parse(rule) as Record<string, unknown>;
    const url = parsed.url as Array<Record<string, string>> | undefined;
    if (Array.isArray(url) && url[0]) {
      const op = Object.keys(url[0])[0];
      const val = url[0][op];
      const opLabel =
        op === "i_contains" ? "URL contains"
          : op === "eq" ? "URL equals"
            : op === "i_not_contains" ? "URL not contains"
              : op;
      return `${opLabel} "${val}"`;
    }
    return rule.slice(0, 80);
  } catch {
    return rule.slice(0, 80);
  }
}

function CreateConversionModal({
  tenantSlug,
  accounts,
  onClose,
  onCreated,
}: {
  tenantSlug: string;
  accounts: Account[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [metaAccountId, setMetaAccountId] = useState(accounts[0]?.id ?? "");
  const [name, setName] = useState("");
  const [pixels, setPixels] = useState<{ id: string; name: string }[]>([]);
  const [pixelId, setPixelId] = useState("");
  const [loadingPixels, setLoadingPixels] = useState(false);
  const [customEventType, setCustomEventType] = useState<ConversionEventType>("PURCHASE");
  const [ruleKind, setRuleKind] = useState<"url-contains" | "url-equals" | "url-not-contains">(
    "url-contains",
  );
  const [ruleValue, setRuleValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!metaAccountId) return;
    let cancelled = false;
    setLoadingPixels(true);
    setPixelId("");
    fetch(`/api/meta/pixels?tenantSlug=${tenantSlug}&metaAccountId=${metaAccountId}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const list = d.pixels ?? [];
        setPixels(list);
        if (list.length === 1) setPixelId(list[0].id);
      })
      .catch(() => {
        if (!cancelled) setPixels([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingPixels(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, metaAccountId]);

  async function submit() {
    if (!name.trim()) return toast.error("ตั้งชื่อ");
    if (!pixelId) return toast.error("เลือก Pixel");
    if (!ruleValue.trim()) return toast.error("กรอก URL pattern");

    setSubmitting(true);
    const toastId = toast.loading("กำลังสร้าง Custom Conversion...");
    try {
      const res = await fetch(`/api/meta/custom-conversions?tenantSlug=${tenantSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metaAccountId,
          pixelId,
          name: name.trim(),
          customEventType,
          ruleKind,
          ruleValue: ruleValue.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "สร้างไม่สำเร็จ");
      }
      toast.success(`✓ สร้าง "${data.conversion.name}" สำเร็จ`, {
        id: toastId,
        duration: 3000,
      });
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "สร้างไม่สำเร็จ", {
        id: toastId,
        duration: 6000,
      });
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
            <h3 className="text-base font-semibold">สร้าง Custom Conversion</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              map URL pattern → conversion event โดยไม่ต้องเขียน code event บนเว็บ
            </p>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Ad Account
          </label>
          <select
            value={metaAccountId}
            onChange={(e) => setMetaAccountId(e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Pixel {loadingPixels && "(loading...)"}
          </label>
          {pixels.length === 0 && !loadingPixels ? (
            <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
              ไม่มี Pixel ใน account นี้ — สร้าง Pixel ก่อน (tab &ldquo;Pixels&rdquo;)
            </p>
          ) : (
            <select
              value={pixelId}
              onChange={(e) => setPixelId(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="">-- เลือก Pixel --</option>
              {pixels.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            ชื่อ Conversion
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น Order Complete, Lead Form Submit"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            กฎ URL
          </label>
          <div className="grid grid-cols-3 gap-2">
            <select
              value={ruleKind}
              onChange={(e) => setRuleKind(e.target.value as typeof ruleKind)}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="url-contains">URL contains</option>
              <option value="url-equals">URL equals</option>
              <option value="url-not-contains">URL NOT contains</option>
            </select>
            <Input
              value={ruleValue}
              onChange={(e) => setRuleValue(e.target.value)}
              placeholder="เช่น /thank-you หรือ /checkout/complete"
              className="col-span-2"
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Meta จะ match กับ URL ของ PageView ที่ Pixel นี้ยิงในเว็บ
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Category (สำหรับ Meta optimization)
          </label>
          <select
            value={customEventType}
            onChange={(e) => setCustomEventType(e.target.value as ConversionEventType)}
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
          >
            {CONVERSION_EVENT_TYPES.map((ev) => (
              <option key={ev.value} value={ev.value}>
                {ev.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            ใช้บอก Meta ว่า conversion นี้คล้าย event มาตรฐานตัวไหน — มีผลกับ optimization
          </p>
        </div>

        <div className="flex justify-between gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            ยกเลิก
          </Button>
          <Button
            size="sm"
            onClick={submit}
            disabled={submitting || !pixelId || !name.trim() || !ruleValue.trim()}
          >
            {submitting ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
            สร้าง
          </Button>
        </div>
      </div>
    </div>
  );
}

// ====== Events tab (SDK) ============================================
//
// Phase 5 — PixelYourSite-style trigger rules. The SDK runs on the
// customer's website, reads its config from our config endpoint, and
// fires Meta Pixel + CAPI events when triggers match.

type TriggerType =
  | "url"
  | "click"
  | "form_submit"
  | "scroll"
  | "time_on_page"
  | "custom_js";

type EventRule = {
  id: string;
  name: string;
  pixelId: string;
  triggerType: TriggerType;
  conditions: Record<string, unknown>;
  eventName: string;
  paramsExtractor: Record<string, unknown> | null;
  enabled: boolean;
  totalFires: number;
  lastFiredAt: string | null;
  createdAt: string;
};

const STANDARD_EVENT_NAMES = [
  "PageView", "ViewContent", "Search", "AddToCart", "AddToWishlist",
  "InitiateCheckout", "AddPaymentInfo", "Purchase", "Lead",
  "CompleteRegistration", "Contact", "Subscribe", "StartTrial",
  "SubmitApplication",
] as const;

const TRIGGER_LABELS: Record<TriggerType, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  url: { label: "URL", icon: Globe },
  click: { label: "Click", icon: MousePointer },
  form_submit: { label: "Form Submit", icon: Check },
  scroll: { label: "Scroll", icon: Activity },
  time_on_page: { label: "Time on Page", icon: Timer },
  custom_js: { label: "Custom JS", icon: Code },
};

function EventsTab({
  tenantSlug,
  canEdit,
  accounts,
}: {
  tenantSlug: string;
  canEdit: boolean;
  accounts: Account[];
}) {
  const [rules, setRules] = useState<EventRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [installFor, setInstallFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  // Load all pixels across accounts to seed the rule modal.
  const [pixelOptions, setPixelOptions] = useState<
    { id: string; name: string; accountId: string; accountName: string }[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(`/api/event-rules?tenantSlug=${tenantSlug}`).then((r) => r.json()),
      Promise.all(
        accounts.map(async (acc) => {
          try {
            const r = await fetch(
              `/api/meta/pixels?tenantSlug=${tenantSlug}&metaAccountId=${acc.id}`,
            );
            const d = await r.json();
            return ((d.pixels ?? []) as { id: string; name: string }[]).map((p) => ({
              ...p,
              accountId: acc.id,
              accountName: acc.name,
            }));
          } catch {
            return [];
          }
        }),
      ),
    ])
      .then(([rulesData, pixelArrays]) => {
        if (cancelled) return;
        setRules(rulesData.rules ?? []);
        // Dedupe pixels by id
        const seen = new Set<string>();
        const list: typeof pixelOptions = [];
        for (const p of pixelArrays.flat()) {
          if (seen.has(p.id)) continue;
          seen.add(p.id);
          list.push(p);
        }
        setPixelOptions(list);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setRules([]);
        setPixelOptions([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, accounts, refreshKey]);

  async function toggleEnabled(rule: EventRule) {
    setBusy((p) => new Set(p).add(rule.id));
    try {
      const res = await fetch(`/api/event-rules/${rule.id}?tenantSlug=${tenantSlug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "อัพเดทไม่สำเร็จ");
      // Visual state changes immediately on the row — toast would be noise.
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "อัพเดทไม่สำเร็จ");
    } finally {
      setBusy((p) => {
        const n = new Set(p);
        n.delete(rule.id);
        return n;
      });
    }
  }

  async function deleteRule(rule: EventRule) {
    if (!confirm(`ลบ rule "${rule.name}"?`)) return;
    setBusy((p) => new Set(p).add(rule.id));
    try {
      const res = await fetch(`/api/event-rules/${rule.id}?tenantSlug=${tenantSlug}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "ลบไม่สำเร็จ");
      toast.success("ลบแล้ว", { duration: 2000 });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    } finally {
      setBusy((p) => {
        const n = new Set(p);
        n.delete(rule.id);
        return n;
      });
    }
  }

  // Group rules by pixel for clarity
  const rulesByPixel = useMemo(() => {
    const m = new Map<string, EventRule[]>();
    for (const r of rules) {
      const list = m.get(r.pixelId) ?? [];
      list.push(r);
      m.set(r.pixelId, list);
    }
    return m;
  }, [rules]);

  return (
    <div className="space-y-4">
      <Card className="space-y-1 border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
        <p className="font-medium">⚡ Events SDK — track event ทันทีโดยไม่ต้องเขียน code</p>
        <ul className="ml-4 list-disc space-y-0.5 text-[11px] leading-relaxed">
          <li>
            ติด <strong>1 script tag</strong> บนเว็บ → SDK ของเรา fire Meta Pixel events ตาม
            rule ที่ตั้งไว้ที่นี่
          </li>
          <li>
            Triggers: URL match, click selector, form submit, scroll %, time on page
          </li>
          <li>
            ส่งทั้ง <strong>browser Pixel + server CAPI</strong> (ปลอด ad blocker / iOS 14)
          </li>
        </ul>
      </Card>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-3">
        <span className="text-sm">
          <span className="text-muted-foreground">Rules ทั้งหมด:</span>{" "}
          <span className="font-semibold tabular-nums">{rules.length}</span>
          <span className="ml-2 text-muted-foreground">
            (เปิดอยู่{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {rules.filter((r) => r.enabled).length}
            </span>
            )
          </span>
        </span>
        <a
          href={`/t/${tenantSlug}/events`}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Activity className="size-3.5" />
          ดู Event Log
        </a>
        {canEdit && pixelOptions.length > 0 && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setInstallFor(pixelOptions[0].id)}
              className="gap-1.5"
            >
              <Code className="size-3.5" />
              SDK Install Code
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
              <Plus className="size-3.5" />
              สร้าง Rule
            </Button>
          </>
        )}
      </div>

      {loading ? (
        <Card className="flex items-center justify-center gap-2 border-dashed py-12">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">กำลังโหลด...</span>
        </Card>
      ) : rules.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 border-dashed py-12 text-center">
          <Activity className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">ยังไม่มี Event Rule</p>
          <p className="max-w-md text-xs text-muted-foreground">
            สร้าง rule เพื่อให้ SDK ของเรา auto-fire Meta Pixel events บนเว็บลูกค้า —
            ไม่ต้องเขียน event code เอง
          </p>
          {canEdit && pixelOptions.length > 0 && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setInstallFor(pixelOptions[0].id)}
                className="gap-1.5"
              >
                <Code className="size-3.5" />
                ติด SDK ก่อน
              </Button>
              <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
                <Plus className="size-3.5" />
                สร้าง Rule ตัวแรก
              </Button>
            </div>
          )}
          {pixelOptions.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              ต้องสร้าง Pixel ก่อนใน tab Pixels
            </p>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {Array.from(rulesByPixel.entries()).map(([pid, ruleList]) => {
            const pixel = pixelOptions.find((p) => p.id === pid);
            return (
              <Card key={pid} className="p-0">
                <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2 text-xs">
                  <Zap className="size-3.5 text-emerald-600" />
                  <span className="font-medium">
                    {pixel ? pixel.name : `Pixel ${pid}`}
                  </span>
                  {pixel && (
                    <span className="text-muted-foreground">· {pixel.accountName}</span>
                  )}
                  <span className="ml-auto text-muted-foreground">
                    {ruleList.length} rule{ruleList.length > 1 ? "s" : ""}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setInstallFor(pid)}
                    className="h-6 gap-1 text-[11px]"
                  >
                    <Code className="size-3" />
                    Install code
                  </Button>
                </div>
                <ul className="divide-y divide-border">
                  {ruleList.map((r) => {
                    const tr = TRIGGER_LABELS[r.triggerType];
                    const TIcon = tr?.icon ?? Activity;
                    return (
                      <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                        <TIcon
                          className={cn(
                            "size-4 shrink-0",
                            r.enabled ? "text-emerald-600" : "text-muted-foreground",
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-medium" title={r.name}>
                            {r.name}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {tr?.label}: {formatRuleCondition(r)} · fires{" "}
                            <span className="font-medium text-foreground">{r.eventName}</span>
                            {r.totalFires > 0 && (
                              <>
                                {" · "}
                                <span className="tabular-nums">{r.totalFires}</span> fires
                              </>
                            )}
                            {r.lastFiredAt && (
                              <> · last {formatRelativeTime(r.lastFiredAt)}</>
                            )}
                          </p>
                        </div>
                        {!r.enabled && (
                          <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            disabled
                          </span>
                        )}
                        {canEdit && (
                          <>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              disabled={busy.has(r.id)}
                              onClick={() => toggleEnabled(r)}
                              title={r.enabled ? "ปิด rule" : "เปิด rule"}
                            >
                              {busy.has(r.id) ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Power
                                  className={cn(
                                    "size-3.5",
                                    r.enabled ? "text-emerald-600" : "text-muted-foreground",
                                  )}
                                />
                              )}
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              disabled={busy.has(r.id)}
                              onClick={() => deleteRule(r)}
                              title="ลบ rule"
                              className="text-destructive"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
      )}

      {createOpen && (
        <CreateEventRuleModal
          tenantSlug={tenantSlug}
          pixelOptions={pixelOptions}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {installFor && (
        <SdkInstallModal
          tenantSlug={tenantSlug}
          pixel={pixelOptions.find((p) => p.id === installFor)}
          onClose={() => setInstallFor(null)}
        />
      )}
    </div>
  );
}

function formatRuleCondition(r: EventRule): string {
  const c = r.conditions as Record<string, unknown>;
  switch (r.triggerType) {
    case "url": {
      const op = String(c.op ?? "contains");
      return `URL ${op} "${String(c.value ?? "")}"`;
    }
    case "click":
      return `selector "${String(c.selector ?? "")}"`;
    case "form_submit":
      return c.selector ? `form "${String(c.selector)}"` : "any form";
    case "scroll":
      return `${c.percent ?? 50}%`;
    case "time_on_page":
      return `${c.seconds ?? 30}s`;
    case "custom_js":
      return `window event "${String(c.eventName ?? "")}"`;
    default:
      return "";
  }
}

function CreateEventRuleModal({
  tenantSlug,
  pixelOptions,
  onClose,
  onCreated,
}: {
  tenantSlug: string;
  pixelOptions: { id: string; name: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [pixelId, setPixelId] = useState(pixelOptions[0]?.id ?? "");
  const [name, setName] = useState("");
  const [eventName, setEventName] = useState<(typeof STANDARD_EVENT_NAMES)[number]>("Purchase");
  const [triggerType, setTriggerType] = useState<TriggerType>("url");
  // Trigger-specific state
  const [urlOp, setUrlOp] = useState<"contains" | "equals" | "not_contains" | "starts_with" | "regex">(
    "contains",
  );
  const [urlValue, setUrlValue] = useState("");
  const [urlFireOnce, setUrlFireOnce] = useState(true);
  const [clickSelector, setClickSelector] = useState("");
  const [formSelector, setFormSelector] = useState("");
  const [scrollPercent, setScrollPercent] = useState(50);
  const [timeSeconds, setTimeSeconds] = useState(30);
  const [customEventName, setCustomEventName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function buildConditions(): Record<string, unknown> | null {
    switch (triggerType) {
      case "url":
        if (!urlValue.trim()) return null;
        return { op: urlOp, value: urlValue.trim(), fireOnce: urlFireOnce };
      case "click":
        if (!clickSelector.trim()) return null;
        return { selector: clickSelector.trim() };
      case "form_submit":
        return { selector: formSelector.trim() || undefined };
      case "scroll":
        return { percent: scrollPercent };
      case "time_on_page":
        return { seconds: timeSeconds };
      case "custom_js":
        if (!customEventName.trim()) return null;
        return { eventName: customEventName.trim() };
    }
  }

  async function submit() {
    if (!name.trim()) return toast.error("ตั้งชื่อ rule");
    if (!pixelId) return toast.error("เลือก Pixel");
    const conditions = buildConditions();
    if (!conditions) return toast.error("กรอกข้อมูล trigger ให้ครบ");

    setSubmitting(true);
    const toastId = toast.loading("กำลังสร้าง rule...");
    try {
      const res = await fetch(`/api/event-rules?tenantSlug=${tenantSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          pixelId,
          eventName,
          triggerType,
          conditions,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "สร้างไม่สำเร็จ");
      }
      toast.success(`✓ สร้าง "${data.rule.name}" สำเร็จ`, { id: toastId, duration: 3000 });
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "สร้างไม่สำเร็จ", {
        id: toastId,
        duration: 6000,
      });
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
            <h3 className="text-base font-semibold">สร้าง Event Rule</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              เมื่อ trigger match → SDK fire Meta Pixel event + ส่ง CAPI
            </p>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Pixel</label>
          <select
            value={pixelId}
            onChange={(e) => setPixelId(e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
          >
            {pixelOptions.length === 0 && <option value="">ไม่มี Pixel</option>}
            {pixelOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            ชื่อ Rule
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น Track Purchase on Thank-You Page"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Event Name (Meta standard)
          </label>
          <select
            value={eventName}
            onChange={(e) => setEventName(e.target.value as typeof eventName)}
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
          >
            {STANDARD_EVENT_NAMES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Trigger
          </label>
          <select
            value={triggerType}
            onChange={(e) => setTriggerType(e.target.value as TriggerType)}
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="url">URL match</option>
            <option value="click">Click on selector</option>
            <option value="form_submit">Form submit</option>
            <option value="scroll">Scroll percentage</option>
            <option value="time_on_page">Time on page</option>
            <option value="custom_js">Custom window event</option>
          </select>
        </div>

        {triggerType === "url" && (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <select
                value={urlOp}
                onChange={(e) => setUrlOp(e.target.value as typeof urlOp)}
                className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="contains">contains</option>
                <option value="equals">equals</option>
                <option value="not_contains">not contains</option>
                <option value="starts_with">starts with</option>
                <option value="regex">regex</option>
              </select>
              <Input
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                placeholder="/thank-you"
                className="col-span-2"
              />
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={urlFireOnce}
                onChange={(e) => setUrlFireOnce(e.target.checked)}
              />
              ยิงครั้งเดียวต่อ session
            </label>
          </div>
        )}

        {triggerType === "click" && (
          <Input
            value={clickSelector}
            onChange={(e) => setClickSelector(e.target.value)}
            placeholder=".add-to-cart-button หรือ #checkout-btn"
          />
        )}

        {triggerType === "form_submit" && (
          <Input
            value={formSelector}
            onChange={(e) => setFormSelector(e.target.value)}
            placeholder='ว่างไว้ = form ใดก็ได้ หรือ "form.lead-form"'
          />
        )}

        {triggerType === "scroll" && (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={100}
              value={scrollPercent}
              onChange={(e) => setScrollPercent(Number(e.target.value))}
              className="w-24"
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        )}

        {triggerType === "time_on_page" && (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              value={timeSeconds}
              onChange={(e) => setTimeSeconds(Number(e.target.value))}
              className="w-24"
            />
            <span className="text-xs text-muted-foreground">วินาที</span>
          </div>
        )}

        {triggerType === "custom_js" && (
          <Input
            value={customEventName}
            onChange={(e) => setCustomEventName(e.target.value)}
            placeholder="ชื่อ window event เช่น myAppPurchase"
          />
        )}

        <div className="flex justify-between gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            ยกเลิก
          </Button>
          <Button size="sm" onClick={submit} disabled={submitting || !pixelId || !name.trim()}>
            {submitting ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
            สร้าง Rule
          </Button>
        </div>
      </div>
    </div>
  );
}

function SdkInstallModal({
  tenantSlug,
  pixel,
  onClose,
}: {
  tenantSlug: string;
  pixel: { id: string; name: string; accountId: string; accountName: string } | undefined;
  onClose: () => void;
}) {
  const [snippet, setSnippet] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!pixel) return;
    setLoading(true);
    fetch(
      `/api/event-sdk/install-code?tenantSlug=${tenantSlug}&metaAccountId=${pixel.accountId}&pixelId=${pixel.id}`,
    )
      .then((r) => r.json())
      .then((d) => setSnippet(d.snippet ?? null))
      .catch(() => setSnippet(null))
      .finally(() => setLoading(false));
  }, [tenantSlug, pixel]);

  async function copy() {
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      toast.success("คัดลอกแล้ว", { duration: 2000 });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("คัดลอกไม่สำเร็จ");
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
            <h3 className="text-base font-semibold">SDK Install Code</h3>
            {pixel && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                สำหรับ Pixel: <span className="font-medium text-foreground">{pixel.name}</span>{" "}
                · วาง snippet นี้ใน &lt;head&gt; ของทุกหน้าในเว็บไซต์
              </p>
            )}
          </div>
          <Button size="icon-sm" variant="ghost" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-[11px] text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
          ⚠ ใช้แทน Meta Pixel basic code เดิม — SDK ของเรา inject Pixel เอง ห้ามติด 2
          ที่ในหน้าเดียวกัน (จะนับ event ซ้ำ)
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : snippet ? (
          <>
            <pre className="max-h-[40vh] overflow-auto rounded-md border border-border bg-muted/30 p-3 text-[11px] leading-relaxed">
              {snippet}
            </pre>
            <div className="flex justify-end gap-2">
              <Button size="sm" onClick={copy} className="gap-1.5">
                {copied ? (
                  <>
                    <Check className="size-3.5" /> คัดลอกแล้ว
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" /> Copy code
                  </>
                )}
              </Button>
            </div>
          </>
        ) : (
          <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            โหลด install code ไม่สำเร็จ — ลอง refresh
          </p>
        )}
      </div>
    </div>
  );
}
