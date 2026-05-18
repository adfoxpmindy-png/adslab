"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

type EventLog = {
  id: string;
  ruleId: string | null;
  firedAt: string;
  eventName: string;
  payload: Record<string, unknown>;
  dedupKey: string;
  capiStatus: "pending" | "success" | "failed" | "skipped";
  capiResponse: Record<string, unknown> | null;
  browserContext: Record<string, unknown> | null;
};

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  failed: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  skipped: "bg-muted text-muted-foreground",
};

export function EventLogClient({ tenantSlug }: { tenantSlug: string }) {
  const t = useTranslations("pages.events.log");
  const locale = useLocale();
  const [logs, setLogs] = useState<EventLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [eventFilter, setEventFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<EventLog | null>(null);

  async function load() {
    setRefreshing(true);
    try {
      const params = new URLSearchParams({ tenantSlug });
      if (eventFilter) params.set("eventName", eventFilter);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/event-logs?${params.toString()}`);
      const data = await res.json();
      setLogs(data.logs ?? []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() runs async fetch then setState; intentional reload on filter changes
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantSlug, eventFilter, statusFilter]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, tenantSlug, eventFilter, statusFilter]);

  const uniqueEvents = Array.from(new Set(logs.map((l) => l.eventName))).sort();

  return (
    <div className="space-y-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-4 py-2">
        <select
          value={eventFilter}
          onChange={(e) => setEventFilter(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="">{t("allEvents")}</option>
          {uniqueEvents.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="">{t("allStatuses")}</option>
          <option value="success">success</option>
          <option value="pending">pending</option>
          <option value="failed">failed</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Auto-refresh (5s)
        </label>
        <Button
          size="sm"
          variant="outline"
          onClick={load}
          disabled={refreshing}
          className="ml-auto gap-1.5"
        >
          {refreshing ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{t("loading")}</span>
        </div>
      ) : logs.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {logs.map((l) => (
            <li
              key={l.id}
              onClick={() => setSelected(l)}
              className="flex flex-wrap items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/30"
            >
              <span
                className={cn(
                  "rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                  STATUS_TONE[l.capiStatus] ?? "",
                )}
              >
                {l.capiStatus}
              </span>
              <span className="text-sm font-medium">{l.eventName}</span>
              <span className="text-[11px] text-muted-foreground">
                {formatDateTime(l.firedAt, locale)}
              </span>
              <span className="ml-auto truncate text-[11px] text-muted-foreground">
                {((l.browserContext?.sourceUrl as string) ?? "").slice(0, 60)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <EventDetailDrawer log={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function EventDetailDrawer({
  log,
  onClose,
}: {
  log: EventLog;
  onClose: () => void;
}) {
  const locale = useLocale();
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end bg-black/40"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-xl space-y-3 overflow-auto border-l border-border bg-background p-5 shadow-lg"
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold">{log.eventName}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatDateTime(log.firedAt, locale)} ·{" "}
              <span className="font-medium">{log.capiStatus}</span>
            </p>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <Section title="Dedup key">
          <code className="text-[11px]">{log.dedupKey}</code>
        </Section>

        <Section title="Custom params">
          <pre className="overflow-auto rounded-md border border-border bg-muted/30 p-2 text-[11px]">
            {JSON.stringify(log.payload, null, 2)}
          </pre>
        </Section>

        <Section title="Browser context">
          <pre className="overflow-auto rounded-md border border-border bg-muted/30 p-2 text-[11px]">
            {JSON.stringify(log.browserContext, null, 2)}
          </pre>
        </Section>

        {log.capiResponse && (
          <Section title="CAPI response">
            <pre className="overflow-auto rounded-md border border-border bg-muted/30 p-2 text-[11px]">
              {JSON.stringify(log.capiResponse, null, 2)}
            </pre>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}
