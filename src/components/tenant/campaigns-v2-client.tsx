"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Calendar,
  Download,
  Filter,
  Layers,
  Network,
  Plus,
  Search,
  Settings2,
  Table as TableIcon,
} from "lucide-react";

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
      <SetPageTitle title="แคมเปญ" subtitle="จัดการและวางแผนแคมเปญของคุณ" />

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
          <CampaignsTable rows={filtered} canEdit={canEdit} tenantSlug={tenantSlug} />
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

function CampaignsTable({
  rows,
  canEdit,
  tenantSlug,
}: {
  rows: CampaignRow[];
  canEdit: boolean;
  tenantSlug: string;
}) {
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
        {rows.map((r) => (
          <DataTableRow key={r.id}>
            <DataTableCell>
              <div className="flex items-start gap-2">
                <Layers className="mt-0.5 size-4 shrink-0 text-violet-600 dark:text-violet-300" />
                <div className="min-w-0">
                  <p className="truncate font-medium" title={r.name}>
                    {r.name}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {r.account.name}
                  </p>
                </div>
              </div>
            </DataTableCell>
            <DataTableCell>
              <CampaignStatusBadge status={r.effectiveStatus} />
            </DataTableCell>
            <DataTableCell>
              <span className="text-xs text-muted-foreground">
                {r.metaObjective ? prettyObjective(r.metaObjective) : "—"}
              </span>
            </DataTableCell>
            <DataTableCell numeric>
              <BudgetCell campaign={r} />
            </DataTableCell>
            <DataTableCell numeric>{formatThb(r.metrics.spend)}</DataTableCell>
            <DataTableCell numeric>{formatNumber(r.metrics.impressions)}</DataTableCell>
            <DataTableCell numeric>{r.metrics.ctr.toFixed(2)}%</DataTableCell>
            <DataTableCell numeric>{formatThb(r.metrics.cpc)}</DataTableCell>
            <DataTableCell numeric>
              <RoasCell value={r.metrics.roas} />
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTableShell>
  );
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
