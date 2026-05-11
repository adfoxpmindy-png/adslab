"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KpiBadge } from "@/components/tenant/kpi-badge";
import { cn } from "@/lib/utils";
import type { DashboardPayload, DateRangeKey, ParsedInsight } from "@/lib/meta/insights";

const PRESETS: Array<{ key: DateRangeKey; label: string }> = [
  { key: "today", label: "วันนี้" },
  { key: "yesterday", label: "เมื่อวาน" },
  { key: "last_7d", label: "7 วันล่าสุด" },
  { key: "last_30d", label: "30 วันล่าสุด" },
];

type Props = {
  tenantSlug: string;
  initialRange: DateRangeKey;
  initialPayload: DashboardPayload | null;
  initialFromCache: boolean;
  initialIsStale: boolean;
  canRefresh: boolean; // false for VIEWER role
};

export function DashboardClient({
  tenantSlug,
  initialRange,
  initialPayload,
  initialFromCache,
  initialIsStale,
  canRefresh,
}: Props) {
  const [range, setRange] = useState<DateRangeKey>(initialRange);
  const [payload, setPayload] = useState<DashboardPayload | null>(initialPayload);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);

  // Whenever range changes from initial, fetch fresh.
  useEffect(() => {
    if (range === initialRange && payload?.range === initialRange) return;
    void fetchForRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  async function fetchForRange(r: DateRangeKey) {
    setLoading(true);
    try {
      const res = await fetch(`/api/meta/insights?tenantSlug=${tenantSlug}&range=${encodeURIComponent(r)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Fetch failed");
      setPayload(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    if (!canRefresh) return;
    setRefreshing(true);
    try {
      const res = await fetch(
        `/api/meta/insights/refresh?tenantSlug=${tenantSlug}&range=${encodeURIComponent(range)}`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Refresh failed");
      setPayload(data);
      toast.success("ซิงค์ข้อมูลใหม่เรียบร้อย");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  const fromCache = !loading && (payload === initialPayload ? initialFromCache : false);
  const isStale = !loading && (payload === initialPayload ? initialIsStale : false);

  return (
    <div className="space-y-6">
      <DateRangeBar
        range={range}
        onChange={setRange}
        customOpen={customOpen}
        onToggleCustom={() => setCustomOpen((o) => !o)}
        onApplyCustom={(from, to) => {
          setRange(`custom:${from}..${to}` as DateRangeKey);
          setCustomOpen(false);
        }}
        onRefresh={handleRefresh}
        canRefresh={canRefresh}
        refreshing={refreshing}
        fetchedAt={payload?.fetchedAt ?? null}
        fromCache={fromCache}
        isStale={isStale}
      />

      {loading || !payload ? (
        <KpiSkeleton />
      ) : (
        <>
          <KpiCardsRow summary={payload.summary} />
          <AccountTable accounts={payload.accounts} />
        </>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------

function DateRangeBar({
  range,
  onChange,
  customOpen,
  onToggleCustom,
  onApplyCustom,
  onRefresh,
  canRefresh,
  refreshing,
  fetchedAt,
  fromCache,
  isStale,
}: {
  range: DateRangeKey;
  onChange: (r: DateRangeKey) => void;
  customOpen: boolean;
  onToggleCustom: () => void;
  onApplyCustom: (from: string, to: string) => void;
  onRefresh: () => void;
  canRefresh: boolean;
  refreshing: boolean;
  fetchedAt: string | null;
  fromCache: boolean;
  isStale: boolean;
}) {
  const isCustom = range.startsWith("custom:");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((p) => (
            <Button
              key={p.key}
              variant={range === p.key ? "default" : "outline"}
              size="sm"
              onClick={() => onChange(p.key)}
            >
              {p.label}
            </Button>
          ))}
          <Button variant={isCustom ? "default" : "outline"} size="sm" onClick={onToggleCustom}>
            กำหนดเอง
          </Button>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {fetchedAt && (
            <span>
              ซิงค์ {new Date(fetchedAt).toLocaleString("th-TH")}
              {isStale && <span className="ml-1 text-amber-600 dark:text-amber-400">(stale)</span>}
              {fromCache && !isStale && <span className="ml-1">(cached)</span>}
            </span>
          )}
          {canRefresh && (
            <Button variant="ghost" size="sm" onClick={onRefresh} disabled={refreshing} className="gap-1.5">
              <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
              ซิงค์
            </Button>
          )}
        </div>
      </div>

      {customOpen && <CustomRangePicker range={range} onApply={onApplyCustom} />}
    </div>
  );
}

function CustomRangePicker({
  range,
  onApply,
}: {
  range: DateRangeKey;
  onApply: (from: string, to: string) => void;
}) {
  const initial = useMemo(() => {
    if (range.startsWith("custom:")) {
      const [from, to] = range.slice("custom:".length).split("..");
      return { from, to };
    }
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return { from: weekAgo, to: today };
  }, [range]);

  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);

  return (
    <Card className="flex flex-wrap items-end gap-3 p-4">
      <div className="space-y-1.5">
        <Label htmlFor="from-date">ตั้งแต่</Label>
        <Input
          id="from-date"
          type="date"
          value={from}
          max={to}
          onChange={(e) => setFrom(e.target.value)}
          className="w-44"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="to-date">ถึง</Label>
        <Input
          id="to-date"
          type="date"
          value={to}
          min={from}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setTo(e.target.value)}
          className="w-44"
        />
      </div>
      <Button onClick={() => onApply(from, to)} disabled={!from || !to || from > to}>
        นำมาใช้
      </Button>
    </Card>
  );
}

// -----------------------------------------------------------------------------

function KpiCardsRow({ summary }: { summary: DashboardPayload["summary"] }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <KpiCard label="Total Spend" value={formatThb(summary.spendThb)} />
      <KpiCard label="Impressions" value={formatNumber(summary.impressions)} />
      <KpiCard label="Clicks" value={formatNumber(summary.clicks)} />
      <KpiCard
        label="Conversions"
        value={formatNumber(summary.conversions)}
        sub={summary.roas > 0 ? `ROAS ${summary.roas.toFixed(2)}x` : undefined}
      />
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="flex flex-col gap-2 p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}

function KpiSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="flex flex-col gap-2 p-5">
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            <div className="h-8 w-32 animate-pulse rounded bg-muted" />
            <div className="h-3 w-16 animate-pulse rounded bg-muted" />
          </Card>
        ))}
      </div>
      <Card className="p-0">
        <div className="space-y-2 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-6 w-full animate-pulse rounded bg-muted" />
          ))}
        </div>
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------------

function AccountTable({ accounts }: { accounts: ParsedInsight[] }) {
  const sorted = useMemo(() => [...accounts].sort((a, b) => b.spend - a.spend), [accounts]);

  if (sorted.every((a) => a.spend === 0)) {
    return (
      <Card className="flex flex-col items-center justify-center gap-2 border-dashed py-12 text-center">
        <p className="text-sm font-medium">ยังไม่มี campaign ที่ทำงานในช่วงที่เลือก</p>
        <p className="text-xs text-muted-foreground">
          ลองเลือกช่วงเวลาอื่น หรือไปสร้าง campaign ใน Meta Ads Manager ก่อน
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/30 text-left">
            <tr>
              <Th>Ad Account</Th>
              <Th align="right">Spend</Th>
              <Th align="right">Impressions</Th>
              <Th align="right">CTR</Th>
              <Th align="right">CPM</Th>
              <Th align="right">Conversions</Th>
              <Th align="right">ROAS</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => (
              <Row key={a.accountId} account={a} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Row({ account }: { account: ParsedInsight }) {
  const cpmTone = account.cpm < 50 ? "good" : account.cpm < 100 ? "warn" : "bad";
  const roasTone = account.roas >= 3 ? "good" : account.roas >= 2 ? "warn" : "bad";

  return (
    <tr className="border-b border-border last:border-0">
      <Td>
        <div className="flex flex-col">
          <span className="font-medium">{account.accountName}</span>
          {account.businessName && (
            <span className="text-xs text-muted-foreground">{account.businessName}</span>
          )}
        </div>
      </Td>
      <Td align="right" mono>
        {formatCurrency(account.spend, account.currency)}
      </Td>
      <Td align="right" mono>
        {formatNumber(account.impressions)}
      </Td>
      <Td align="right" mono>
        {account.ctr.toFixed(2)}%
      </Td>
      <Td align="right">
        <span className="inline-flex items-center gap-1.5">
          <span className="font-mono">{account.cpm.toFixed(0)}</span>
          {account.cpm > 0 && <KpiBadge tone={cpmTone}>{cpmTone === "good" ? "ดี" : cpmTone === "warn" ? "เฝ้าระวัง" : "แพง"}</KpiBadge>}
        </span>
      </Td>
      <Td align="right" mono>
        {formatNumber(account.conversions)}
      </Td>
      <Td align="right">
        {account.roas > 0 ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="font-mono">{account.roas.toFixed(2)}x</span>
            <KpiBadge tone={roasTone}>{roasTone === "good" ? "ดี" : roasTone === "warn" ? "เฝ้าระวัง" : "ต่ำ"}</KpiBadge>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </Td>
    </tr>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      className={cn(
        "px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground",
        align === "right" && "text-right",
      )}
    >
      {children}
    </th>
  );
}
function Td({
  children,
  align,
  mono,
}: {
  children: React.ReactNode;
  align?: "right";
  mono?: boolean;
}) {
  return (
    <td
      className={cn("px-4 py-3 align-middle", align === "right" && "text-right", mono && "font-mono")}
    >
      {children}
    </td>
  );
}

// -----------------------------------------------------------------------------
// Formatters
// -----------------------------------------------------------------------------

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
function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("th-TH", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(Math.round(value));
  } catch {
    return `${formatNumber(value)} ${currency}`;
  }
}
