"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  Calendar,
  Download,
  Filter,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Loader2,
  Network,
  Plus,
  Search,
  Settings2,
  Stethoscope,
  Table as TableIcon,
} from "lucide-react";

import type {
  AdNode,
  AdSetNode,
  CampaignStructure,
} from "@/lib/meta/campaign-structure";

import { Input } from "@/components/ui/input";
import {
  BrandButton,
  brandButton,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeadCell,
  DataTableHeadRow,
  DataTableRow,
  DataTableShell,
  EmptyState,
  StatusBadge,
} from "@/components/ui-system";
import { SetPageTitle } from "@/components/tenant/topbar-page-title";
import { cn } from "@/lib/utils";

const CampaignsStructureMindmap = dynamic(
  () => import("./campaigns-structure-mindmap").then((m) => m.CampaignsStructureMindmap),
  { ssr: false, loading: () => <MindmapSkeleton /> },
);

// =============================================================================
// Types (merged from page-side campaign records + per-campaign insights)
// =============================================================================

export type CampaignRow = {
  id: string;
  metaCampaignId: string;
  name: string;
  metaObjective: string | null;
  effectiveStatus: string;
  configuredStatus: string | null;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  endTime: string | null;
  account: { id: string; name: string; business: string | null };
  /** Merged from insights — may be all zeros if campaign had no spend in window. */
  metrics: {
    spend: number;
    purchaseValue: number;
    roas: number;
    impressions: number;
    clicks: number;
    ctr: number;
    cpc: number;
    conversions: number;
  };
};

// =============================================================================
// Main client
// =============================================================================

type ViewMode = "table" | "structure";

type Props = {
  tenantSlug: string;
  canEdit: boolean;
  campaigns: CampaignRow[];
};

export function CampaignsV2Client({ tenantSlug, canEdit, campaigns }: Props) {
  const tPages = useTranslations("pages.campaigns");
  const [view, setView] = useState<ViewMode>("table");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "ACTIVE" | "PAUSED" | "OTHER">("all");
  const [objectiveFilter, setObjectiveFilter] = useState<string>("all");

  const objectives = useMemo(() => {
    const set = new Set<string>();
    for (const c of campaigns) if (c.metaObjective) set.add(c.metaObjective);
    return Array.from(set).sort();
  }, [campaigns]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return campaigns.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q) && !c.account.name.toLowerCase().includes(q)) {
        return false;
      }
      if (statusFilter !== "all") {
        const bucket = bucketStatus(c.effectiveStatus);
        if (bucket !== statusFilter) return false;
      }
      if (objectiveFilter !== "all" && c.metaObjective !== objectiveFilter) return false;
      return true;
    });
  }, [campaigns, query, statusFilter, objectiveFilter]);

  return (
    <>
      <SetPageTitle title={tPages("title")} subtitle={tPages("subtitle")} />

      <div className="mx-auto w-full max-w-screen-2xl space-y-5 px-6 py-6">
        {/* Top action row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-xl border border-border bg-card p-1 shadow-card">
            <button
              onClick={() => setView("structure")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                view === "structure"
                  ? "bg-brand-gradient text-white shadow-card"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Network className="size-3.5" />
              โครงสร้าง
            </button>
            <button
              onClick={() => setView("table")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                view === "table"
                  ? "bg-brand-gradient text-white shadow-card"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <TableIcon className="size-3.5" />
              ตาราง
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              <Settings2 className="size-3.5" />
              คอลัมน์
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              <Download className="size-3.5" />
              ส่งออก
            </button>
            {canEdit && (
              <Link href={`/t/${tenantSlug}/campaigns/new`} className={brandButton({ size: "md" })}>
                <Plus className="size-4" />
                สร้างแคมเปญ
              </Link>
            )}
          </div>
        </div>

        {/* Filter row — only shown in table view */}
        {view === "table" && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ค้นหาแคมเปญ, Ad Set, Ads..."
                className="pl-9"
              />
            </div>
            <FilterPill icon={Filter} label="สถานะ" value={statusFilter} onChange={(v) => setStatusFilter(v as typeof statusFilter)} options={[
              { value: "all", label: "ทั้งหมด" },
              { value: "ACTIVE", label: "กำลังใช้งาน" },
              { value: "PAUSED", label: "หยุดชั่วคราว" },
              { value: "OTHER", label: "อื่นๆ" },
            ]} />
            <FilterPill icon={Calendar} label="วัตถุประสงค์" value={objectiveFilter} onChange={setObjectiveFilter} options={[
              { value: "all", label: "ทั้งหมด" },
              ...objectives.map((o) => ({ value: o, label: prettyObjective(o) })),
            ]} />
          </div>
        )}

        {/* View */}
        {view === "table" ? (
          <CampaignsTable
            rows={filtered}
            canEdit={canEdit}
            tenantSlug={tenantSlug}
          />
        ) : (
          <CampaignsStructureMindmap rows={filtered.length ? filtered : campaigns} />
        )}
      </div>
    </>
  );
}

// =============================================================================
// Filter pill
// =============================================================================

function FilterPill({
  icon: Icon,
  label,
  value,
  onChange,
  options,
}: {
  icon: typeof Filter;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs">
      <Icon className="size-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-xs font-medium text-foreground focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// =============================================================================
// Table view
// =============================================================================

type StructureState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; data: CampaignStructure }
  | { status: "error"; error: string };

function CampaignsTable({
  rows,
  canEdit,
  tenantSlug,
}: {
  rows: CampaignRow[];
  canEdit: boolean;
  tenantSlug: string;
}) {
  // Per-campaign: expanded? + lazy-loaded ad set tree
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [structures, setStructures] = useState<Record<string, StructureState>>({});
  // Per-adset: expanded? to reveal nested ads
  const [expandedAdSets, setExpandedAdSets] = useState<Set<string>>(new Set());

  const toggleCampaign = useCallback(
    (row: CampaignRow) => {
      const id = row.metaCampaignId;
      const isOpen = expanded.has(id);
      setExpanded((prev) => {
        const next = new Set(prev);
        if (isOpen) next.delete(id);
        else next.add(id);
        return next;
      });
      // Fetch on first open (or if previous fetch errored — retry).
      if (!isOpen) {
        const current = structures[id];
        if (current?.status === "loaded" || current?.status === "loading") return;
        setStructures((s) => ({ ...s, [id]: { status: "loading" } }));
        const url = `/api/meta/campaigns/${id}/structure?tenantSlug=${encodeURIComponent(tenantSlug)}`;
        fetch(url)
          .then(async (res) => {
            if (!res.ok) {
              const body = (await res.json().catch(() => ({}))) as { error?: string };
              throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            return (await res.json()) as CampaignStructure;
          })
          .then((data) => setStructures((s) => ({ ...s, [id]: { status: "loaded", data } })))
          .catch((err: unknown) =>
            setStructures((s) => ({
              ...s,
              [id]: { status: "error", error: err instanceof Error ? err.message : String(err) },
            })),
          );
      }
    },
    [expanded, structures, tenantSlug],
  );

  const toggleAdSet = useCallback((adSetId: string) => {
    setExpandedAdSets((prev) => {
      const next = new Set(prev);
      if (next.has(adSetId)) next.delete(adSetId);
      else next.add(adSetId);
      return next;
    });
  }, []);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="ไม่พบแคมเปญที่ตรงเงื่อนไข"
        description="ลองล้างฟิลเตอร์หรือสร้างแคมเปญใหม่"
        action={
          canEdit ? (
            <Link href={`/t/${tenantSlug}/campaigns/new`} className={brandButton({ size: "md" })}>
              <Plus className="size-4" />
              สร้างแคมเปญ
            </Link>
          ) : null
        }
      />
    );
  }

  return (
    <DataTableShell>
      <DataTableHead>
        <DataTableHeadRow>
          <DataTableHeadCell className="w-9 pl-3" />
          <DataTableHeadCell>ชื่อ</DataTableHeadCell>
          <DataTableHeadCell>สถานะ</DataTableHeadCell>
          <DataTableHeadCell>วัตถุประสงค์</DataTableHeadCell>
          <DataTableHeadCell className="text-right">งบประมาณ</DataTableHeadCell>
          <DataTableHeadCell className="text-right">ค่าใช้จ่าย</DataTableHeadCell>
          <DataTableHeadCell className="text-right">Impressions</DataTableHeadCell>
          <DataTableHeadCell className="text-right">CTR</DataTableHeadCell>
          <DataTableHeadCell className="text-right">CPC</DataTableHeadCell>
          <DataTableHeadCell className="text-right">ROAS</DataTableHeadCell>
        </DataTableHeadRow>
      </DataTableHead>
      <DataTableBody>
        {rows.map((r) => {
          const isOpen = expanded.has(r.metaCampaignId);
          const state = structures[r.metaCampaignId] ?? { status: "idle" };
          return (
            <CampaignRowGroup
              key={r.id}
              row={r}
              expanded={isOpen}
              state={state}
              onToggleCampaign={() => toggleCampaign(r)}
              expandedAdSets={expandedAdSets}
              onToggleAdSet={toggleAdSet}
              tenantSlug={tenantSlug}
            />
          );
        })}
      </DataTableBody>
    </DataTableShell>
  );
}

function CampaignRowGroup({
  row,
  expanded,
  state,
  onToggleCampaign,
  expandedAdSets,
  onToggleAdSet,
  tenantSlug,
}: {
  row: CampaignRow;
  expanded: boolean;
  state: StructureState;
  onToggleCampaign: () => void;
  expandedAdSets: Set<string>;
  onToggleAdSet: (id: string) => void;
  tenantSlug: string;
}) {
  // Build a focused diagnose prompt for the AI. The system prompt already
  // teaches the 3-lever framework + senior-media-buyer tone, so the AI
  // will ground the answer in real Meta data + Nick's playbook.
  const diagnosePrompt = `Diagnose แคมเปญ "${row.name}" (id: ${row.metaCampaignId}) — ใช้ getCampaignInsights ดึง 7-day metrics, แล้วบอก 3 levers (creative / landing page / offer) ตัวไหนน่าจะคือปัญหา + แนะนำ action ที่ทำได้พรุ่งนี้`;
  return (
    <>
      <DataTableRow expandable expanded={expanded} onToggle={onToggleCampaign}>
        <DataTableCell>
          <div className="flex items-start gap-2">
            <Layers className="mt-0.5 size-4 shrink-0 text-violet-600 dark:text-violet-300" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium" title={row.name}>
                {row.name}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">{row.account.name}</p>
            </div>
            <Link
              href={`/t/${tenantSlug}/ai?q=${encodeURIComponent(diagnosePrompt)}`}
              onClick={(e) => e.stopPropagation()}
              className="ml-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-60 transition-opacity hover:bg-violet-50 hover:text-violet-700 hover:opacity-100 dark:hover:bg-violet-950/40 dark:hover:text-violet-300"
              title="Diagnose แคมเปญนี้ด้วย AI (เปิด AI Chat พร้อมคำถาม)"
            >
              <Stethoscope className="size-3.5" />
            </Link>
          </div>
        </DataTableCell>
        <DataTableCell>
          <CampaignStatusBadge status={row.effectiveStatus} />
        </DataTableCell>
        <DataTableCell>
          <span className="text-xs text-muted-foreground">
            {row.metaObjective ? prettyObjective(row.metaObjective) : "—"}
          </span>
        </DataTableCell>
        <DataTableCell numeric>
          <BudgetCell campaign={row} />
        </DataTableCell>
        <DataTableCell numeric>{formatThb(row.metrics.spend)}</DataTableCell>
        <DataTableCell numeric>{formatNumber(row.metrics.impressions)}</DataTableCell>
        <DataTableCell numeric>{row.metrics.ctr.toFixed(2)}%</DataTableCell>
        <DataTableCell numeric>{formatThb(row.metrics.cpc)}</DataTableCell>
        <DataTableCell numeric>
          <RoasCell value={row.metrics.roas} />
        </DataTableCell>
      </DataTableRow>

      {expanded && state.status === "loading" && <NestedLoadingRow />}
      {expanded && state.status === "error" && (
        <NestedErrorRow message={state.error} onRetry={onToggleCampaign} />
      )}
      {expanded && state.status === "loaded" && state.data.adSets.length === 0 && (
        <NestedEmptyRow message="แคมเปญนี้ยังไม่มี Ad Set" />
      )}
      {expanded &&
        state.status === "loaded" &&
        state.data.adSets.map((adset) => (
          <AdSetRowGroup
            key={adset.id}
            adset={adset}
            expanded={expandedAdSets.has(adset.id)}
            onToggle={() => onToggleAdSet(adset.id)}
          />
        ))}
    </>
  );
}

function AdSetRowGroup({
  adset,
  expanded,
  onToggle,
}: {
  adset: AdSetNode;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <DataTableRow depth={1} expandable expanded={expanded} onToggle={onToggle}>
        <DataTableCell>
          <div className="flex items-start gap-2 pl-4">
            <LayoutGrid className="mt-0.5 size-4 shrink-0 text-indigo-600 dark:text-indigo-300" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium" title={adset.name}>
                {adset.name}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {adset.ads.length} โฆษณา
                {adset.optimizationGoal && ` · ${prettyOptGoal(adset.optimizationGoal)}`}
              </p>
            </div>
          </div>
        </DataTableCell>
        <DataTableCell>
          <CampaignStatusBadge status={adset.effectiveStatus} />
        </DataTableCell>
        <DataTableCell>
          <span className="text-xs text-muted-foreground">Ad Set</span>
        </DataTableCell>
        <DataTableCell numeric>
          <AdSetBudgetCell adset={adset} />
        </DataTableCell>
        <DataTableCell numeric>{formatThb(adset.metrics.spend)}</DataTableCell>
        <DataTableCell numeric>{formatNumber(adset.metrics.impressions)}</DataTableCell>
        <DataTableCell numeric>{adset.metrics.ctr.toFixed(2)}%</DataTableCell>
        <DataTableCell numeric>{formatThb(adset.metrics.cpc)}</DataTableCell>
        <DataTableCell numeric>
          <RoasCell value={adset.metrics.roas} />
        </DataTableCell>
      </DataTableRow>

      {expanded && adset.ads.length === 0 && (
        <NestedEmptyRow depth={2} message="Ad Set นี้ยังไม่มีโฆษณา" />
      )}
      {expanded && adset.ads.map((ad) => <AdRow key={ad.id} ad={ad} />)}
    </>
  );
}

function AdRow({ ad }: { ad: AdNode }) {
  return (
    <DataTableRow depth={2}>
      <td aria-hidden className="w-9 pl-3" />
      <DataTableCell>
        <div className="flex items-start gap-2 pl-8">
          <AdThumbnail ad={ad} />
          <div className="min-w-0">
            <p className="truncate text-sm" title={ad.name}>
              {ad.name}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">Ad ID: {ad.id}</p>
          </div>
        </div>
      </DataTableCell>
      <DataTableCell>
        <CampaignStatusBadge status={ad.effectiveStatus} />
      </DataTableCell>
      <DataTableCell>
        <span className="text-xs text-muted-foreground">Ad</span>
      </DataTableCell>
      <DataTableCell numeric>
        <span className="text-xs text-muted-foreground">—</span>
      </DataTableCell>
      <DataTableCell numeric>{formatThb(ad.metrics.spend)}</DataTableCell>
      <DataTableCell numeric>{formatNumber(ad.metrics.impressions)}</DataTableCell>
      <DataTableCell numeric>{ad.metrics.ctr.toFixed(2)}%</DataTableCell>
      <DataTableCell numeric>{formatThb(ad.metrics.cpc)}</DataTableCell>
      <DataTableCell numeric>
        <RoasCell value={ad.metrics.roas} />
      </DataTableCell>
    </DataTableRow>
  );
}

function AdThumbnail({ ad }: { ad: AdNode }) {
  if (ad.thumbnailUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={ad.thumbnailUrl}
        alt=""
        className="mt-0.5 size-8 shrink-0 rounded-md border border-border object-cover"
      />
    );
  }
  return (
    <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
      <ImageIcon className="size-3.5 text-muted-foreground" />
    </div>
  );
}

function AdSetBudgetCell({ adset }: { adset: AdSetNode }) {
  if (adset.dailyBudget) {
    return (
      <span>
        {formatThb(adset.dailyBudget / 100)}
        <span className="ml-1 text-[10px] text-muted-foreground">/วัน</span>
      </span>
    );
  }
  if (adset.lifetimeBudget) {
    return (
      <span>
        {formatThb(adset.lifetimeBudget / 100)}
        <span className="ml-1 text-[10px] text-muted-foreground">total</span>
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">CBO</span>;
}

function NestedLoadingRow() {
  return (
    <tr className="border-b border-border/40 bg-muted/20">
      <td colSpan={10} className="px-4 py-4">
        <div className="flex items-center gap-2 pl-12 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          กำลังโหลด Ad Sets...
        </div>
      </td>
    </tr>
  );
}

function NestedErrorRow({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <tr className="border-b border-border/40 bg-destructive/5">
      <td colSpan={10} className="px-4 py-3">
        <div className="flex items-center gap-2 pl-12 text-xs text-destructive">
          <AlertCircle className="size-3.5" />
          <span>โหลดไม่สำเร็จ: {message}</span>
          <button
            type="button"
            onClick={onRetry}
            className="ml-2 rounded-md border border-destructive/30 px-2 py-0.5 text-[11px] font-medium hover:bg-destructive/10"
          >
            ลองอีกครั้ง
          </button>
        </div>
      </td>
    </tr>
  );
}

function NestedEmptyRow({ message, depth = 1 }: { message: string; depth?: 1 | 2 }) {
  return (
    <tr className="border-b border-border/40 bg-muted/10">
      <td colSpan={10} className="px-4 py-3">
        <div
          className={cn(
            "text-xs text-muted-foreground",
            depth === 1 ? "pl-12" : "pl-20",
          )}
        >
          {message}
        </div>
      </td>
    </tr>
  );
}

const OPT_GOAL_LABELS: Record<string, string> = {
  OFFSITE_CONVERSIONS: "Conversions",
  LINK_CLICKS: "Clicks",
  LANDING_PAGE_VIEWS: "Landing Page",
  REACH: "Reach",
  IMPRESSIONS: "Impressions",
  LEAD_GENERATION: "Leads",
  POST_ENGAGEMENT: "Engagement",
  VIDEO_VIEWS: "Video Views",
  THRUPLAY: "ThruPlay",
};

function prettyOptGoal(goal: string): string {
  return OPT_GOAL_LABELS[goal] ?? goal;
}

function CampaignStatusBadge({ status }: { status: string }) {
  const bucket = bucketStatus(status);
  if (bucket === "ACTIVE") return <StatusBadge variant="active">กำลังใช้งาน</StatusBadge>;
  if (bucket === "PAUSED") return <StatusBadge variant="paused">หยุดชั่วคราว</StatusBadge>;
  return <StatusBadge variant="closed">ปิดการใช้งาน</StatusBadge>;
}

function RoasCell({ value }: { value: number }) {
  if (value <= 0) return <span className="text-muted-foreground">—</span>;
  const color =
    value >= 3 ? "text-success" : value >= 2 ? "text-warning" : "text-destructive";
  return <span className={cn("font-semibold", color)}>{value.toFixed(2)}x</span>;
}

function BudgetCell({ campaign }: { campaign: CampaignRow }) {
  if (campaign.dailyBudget) {
    return (
      <span>
        {formatThb(campaign.dailyBudget / 100)}
        <span className="ml-1 text-[10px] text-muted-foreground">/วัน</span>
      </span>
    );
  }
  if (campaign.lifetimeBudget) {
    return (
      <span>
        {formatThb(campaign.lifetimeBudget / 100)}
        <span className="ml-1 text-[10px] text-muted-foreground">total</span>
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">ABO</span>;
}

// =============================================================================
// Mindmap skeleton
// =============================================================================

function MindmapSkeleton() {
  return (
    <div className="grid h-[600px] place-items-center rounded-2xl border border-border bg-card shadow-card">
      <div className="text-sm text-muted-foreground">กำลังโหลดมุมมองโครงสร้าง...</div>
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

const STATUS_BUCKETS = {
  ACTIVE: ["ACTIVE"],
  PAUSED: ["PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED"],
};

export function bucketStatus(status: string): "ACTIVE" | "PAUSED" | "OTHER" {
  if (STATUS_BUCKETS.ACTIVE.includes(status)) return "ACTIVE";
  if (STATUS_BUCKETS.PAUSED.includes(status)) return "PAUSED";
  return "OTHER";
}

const OBJECTIVE_LABELS: Record<string, string> = {
  OUTCOME_AWARENESS: "Awareness",
  OUTCOME_TRAFFIC: "Traffic",
  OUTCOME_ENGAGEMENT: "Engagement",
  OUTCOME_LEADS: "Leads",
  OUTCOME_APP_PROMOTION: "App",
  OUTCOME_SALES: "Sales",
  REACH: "Reach",
  CONVERSIONS: "Conversions",
  POST_ENGAGEMENT: "Engagement",
  LINK_CLICKS: "Traffic",
};

export function prettyObjective(obj: string): string {
  return OBJECTIVE_LABELS[obj] ?? obj.replace(/^OUTCOME_/, "");
}

const thbFormatter = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0,
});
const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function formatThb(value: number): string {
  return thbFormatter.format(Math.round(value));
}
function formatNumber(value: number): string {
  return numberFormatter.format(Math.round(value));
}
