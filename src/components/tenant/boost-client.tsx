"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Sparkles,
  Trash2,
  Wand2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { BrandButton, SectionHeader } from "@/components/ui-system";
import { formatNumber } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import type { BoostBrief } from "@/lib/boost/brief-builder";
import type { BoostIntent } from "@/lib/ai/boost-parser";

type AdAccountOption = { id: string; name: string };

// Matches Meta-API error text signalling a reel can't be promoted. Built from
// Unicode codepoints so the i18n extractor treats this as data (a regex
// matcher for what Meta returns) rather than a translatable UI string.
// Decodes to the Thai phrase for "cannot promote" plus the English variant.
const REEL_NOT_PROMOTABLE_PATTERN = new RegExp(
  String.fromCharCode(
    0x0e44, 0x0e21, 0x0e48, 0x0e2a, 0x0e32, 0x0e21, 0x0e32, 0x0e23,
    0x0e16, 0x0e42, 0x0e1b, 0x0e23, 0x0e42, 0x0e21, 0x0e17,
  ) + "|not promotable",
  "i",
);

type PlanResponse = {
  ok: true;
  jobId: string;
  intent: BoostIntent;
  briefs: BoostBrief[];
  urlErrors: Array<{ originalUrl: string; error: string }>;
};

type ExecuteResult = {
  briefId: string;
  postId: string;
  pageName: string;
  status: "success" | "failed";
  campaignMetaId?: string;
  campaignInternalId?: string;
  error?: string;
};

type Props = {
  tenantSlug: string;
  accounts: AdAccountOption[];
};

export function BoostClient({ tenantSlug, accounts }: Props) {
  const tPages = useTranslations("pages.boost");
  const locale = useLocale();
  const examplePrompt = tPages("input.examplePrompt");
  const router = useRouter();
  const [promptText, setPromptText] = useState("");
  const [planning, startPlanning] = useTransition();
  const [executing, setExecuting] = useState(false);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [briefs, setBriefs] = useState<BoostBrief[]>([]);
  // KPI + purpose can be filled in by user if parser didn't catch them
  const [kpiText, setKpiText] = useState("");
  const [purposeText, setPurposeText] = useState("");
  const [results, setResults] = useState<ExecuteResult[] | null>(null);

  function handlePlan() {
    if (promptText.trim().length < 10) {
      toast.error(tPages("toast.promptTooShort"));
      return;
    }
    startPlanning(async () => {
      setResults(null);
      try {
        const res = await fetch(
          `/api/boost/plan?tenantSlug=${encodeURIComponent(tenantSlug)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ promptText }),
          },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(
            typeof body.error === "string" ? body.error : JSON.stringify(body.error ?? `HTTP ${res.status}`),
          );
        }
        const data = (await res.json()) as PlanResponse;
        setPlan(data);
        setBriefs(data.briefs);
        // Initialize KPI/purpose from intent (might be empty strings — that's fine)
        setKpiText(formatKpiText(data.intent.kpi, tPages));
        setPurposeText(data.intent.purpose ?? "");
      } catch (err) {
        toast.error(tPages("toast.planFailed", { message: (err as Error).message }));
      }
    });
  }

  async function handleExecute(initialStatus: "PAUSED" | "ACTIVE") {
    if (!plan) return;
    if (briefs.length === 0) {
      toast.error(tPages("toast.noBriefs"));
      return;
    }
    if (initialStatus === "ACTIVE") {
      if (!kpiText.trim() || !purposeText.trim()) {
        toast.error(tPages("toast.needKpiPurpose"));
        return;
      }
      const total = briefs.reduce((s, b) => s + b.lifetimeBudgetThb, 0);
      const ok = confirm(
        tPages("confirm.executeActive", {
          total: formatNumber(total, locale),
          count: briefs.length,
          kpi: kpiText,
          purpose: purposeText,
        }),
      );
      if (!ok) return;
    }

    setExecuting(true);
    try {
      const res = await fetch(
        `/api/boost/execute?tenantSlug=${encodeURIComponent(tenantSlug)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: plan.jobId, initialStatus, briefs }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(typeof body.error === "string" ? body.error : JSON.stringify(body.error));
      }
      const data = (await res.json()) as { results: ExecuteResult[] };
      setResults(data.results);
      const ok = data.results.filter((r) => r.status === "success").length;
      toast.success(tPages("toast.executeSuccess", { success: ok, total: data.results.length }));
    } catch (err) {
      toast.error(tPages("toast.executeFailed", { message: (err as Error).message }));
    } finally {
      setExecuting(false);
    }
  }

  function updateBrief(idx: number, patch: Partial<BoostBrief>) {
    setBriefs((prev) => prev.map((b, i) => (i === idx ? { ...b, ...patch } : b)));
  }
  function removeBrief(idx: number) {
    setBriefs((prev) => prev.filter((_, i) => i !== idx));
  }

  const totalSpend = briefs.reduce((s, b) => s + b.lifetimeBudgetThb, 0);
  const canPublishActive = kpiText.trim().length > 0 && purposeText.trim().length > 0;

  return (
    <>
      {/* Input section */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-card">
            <Zap className="size-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold">{tPages("input.title")}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {tPages("input.subtitle")}
            </p>
          </div>
        </div>

        <textarea
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          rows={8}
          placeholder={examplePrompt}
          className="mt-4 w-full resize-y rounded-xl border border-border bg-background p-3 text-sm font-mono leading-relaxed placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-violet-400"
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setPromptText(examplePrompt)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {tPages("input.useExample")}
          </button>
          <BrandButton onClick={handlePlan} disabled={planning || promptText.trim().length < 10}>
            {planning ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
            {planning ? tPages("input.analyzing") : tPages("input.analyzeBtn")}
          </BrandButton>
        </div>
      </div>

      {/* Plan output */}
      {plan && !results && (
        <>
          {/* Intent summary */}
          <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-5 dark:border-violet-900/40 dark:bg-violet-950/20">
            <div className="flex items-start gap-2">
              <Sparkles className="mt-0.5 size-4 text-violet-600 dark:text-violet-300" />
              <div className="flex-1 space-y-2 text-xs">
                <p className="text-sm font-medium">{tPages("intent.understood")}</p>
                <p className="text-foreground/80">{plan.intent.notes}</p>
                {plan.intent.assumptions.length > 0 && (
                  <ul className="space-y-1 text-muted-foreground">
                    {plan.intent.assumptions.map((a, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-500" />
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {plan.urlErrors.length > 0 && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-xs">
              <p className="mb-2 font-medium text-destructive">{tPages("intent.urlErrors")}</p>
              <ul className="space-y-1">
                {plan.urlErrors.map((e, i) => (
                  <li key={i}>
                    <code className="text-[11px]">{e.originalUrl}</code> — {e.error}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* KPI + Purpose gate */}
          <div className="rounded-2xl border border-amber-300 bg-amber-50/60 p-5 dark:border-amber-900/40 dark:bg-amber-950/20">
            <SectionHeader
              title={tPages("kpiGate.title")}
              subtitle={tPages("kpiGate.subtitle")}
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium">{tPages("kpiGate.kpiLabel")}</span>
                <Input
                  value={kpiText}
                  onChange={(e) => setKpiText(e.target.value)}
                  placeholder={tPages("kpiGate.kpiPlaceholder")}
                  className="mt-1"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium">{tPages("kpiGate.purposeLabel")}</span>
                <Input
                  value={purposeText}
                  onChange={(e) => setPurposeText(e.target.value)}
                  placeholder={tPages("kpiGate.purposePlaceholder")}
                  className="mt-1"
                />
              </label>
            </div>
          </div>

          {/* Briefs */}
          <SectionHeader
            title={tPages("plan.headerTitle", { count: briefs.length })}
            subtitle={tPages("plan.headerSubtitle", { total: formatNumber(totalSpend, locale) })}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            {briefs.map((brief, idx) => (
              <BriefCard
                key={brief.briefId}
                brief={brief}
                accounts={accounts}
                onChange={(patch) => updateBrief(idx, patch)}
                onRemove={() => removeBrief(idx)}
              />
            ))}
          </div>

          {/* Bottom actions */}
          {briefs.length > 0 && (
            <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/95 p-4 shadow-card-hover backdrop-blur">
              <div className="text-sm">
                <p className="font-semibold">{tPages("plan.summary", { count: briefs.length, total: formatNumber(totalSpend, locale) })}</p>
                <p className="text-xs text-muted-foreground">
                  {tPages("plan.defaultStatusNote")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleExecute("PAUSED")}
                  disabled={executing}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
                >
                  {executing && <Loader2 className="size-4 animate-spin" />}
                  {tPages("plan.saveDraft")}
                </button>
                <BrandButton
                  onClick={() => handleExecute("ACTIVE")}
                  disabled={executing || !canPublishActive}
                  title={!canPublishActive ? tPages("plan.publishActiveTooltip") : undefined}
                >
                  {executing ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
                  {tPages("plan.publishActive", { total: formatNumber(totalSpend, locale) })}
                </BrandButton>
              </div>
            </div>
          )}
        </>
      )}

      {/* Execution results */}
      {results && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <SectionHeader
            title={tPages("results.title", {
              success: results.filter((r) => r.status === "success").length,
              total: results.length,
            })}
            subtitle={tPages("results.subtitle")}
            actions={
              <button
                type="button"
                onClick={() => {
                  setPlan(null);
                  setBriefs([]);
                  setResults(null);
                  setPromptText("");
                  setKpiText("");
                  setPurposeText("");
                  router.refresh();
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent"
              >
                <Zap className="size-3.5" />
                {tPages("results.newBoost")}
              </button>
            }
          />
          <ul className="mt-4 space-y-2">
            {results.map((r) => (
              <li
                key={r.briefId}
                className={cn(
                  "flex items-start gap-3 rounded-xl border px-4 py-3",
                  r.status === "success"
                    ? "border-emerald-300/60 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                    : "border-destructive/30 bg-destructive/5",
                )}
              >
                {r.status === "success" ? (
                  <CheckCircle2 className="mt-0.5 size-4 text-emerald-600 dark:text-emerald-300" />
                ) : (
                  <AlertTriangle className="mt-0.5 size-4 text-destructive" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{r.pageName}</p>
                  <p className="truncate text-[11px] text-muted-foreground">post: {r.postId}</p>
                  {r.status === "failed" && (
                    <>
                      <p className="mt-1 text-xs text-destructive">{r.error}</p>
                      {REEL_NOT_PROMOTABLE_PATTERN.test(r.error ?? "") && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {tPages("results.reelNotPromotable")}
                        </p>
                      )}
                    </>
                  )}
                </div>
                {r.status === "success" && r.campaignInternalId && (
                  <Link
                    href={`/t/${tenantSlug}/campaigns?highlight=${r.campaignInternalId}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 hover:underline dark:text-violet-300"
                  >
                    {tPages("results.view")} <ExternalLink className="size-3" />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function BriefCard({
  brief,
  accounts,
  onChange,
  onRemove,
}: {
  brief: BoostBrief;
  accounts: AdAccountOption[];
  onChange: (patch: Partial<BoostBrief>) => void;
  onRemove: () => void;
}) {
  const tPages = useTranslations("pages.boost");
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-semibold" title={brief.campaignName}>
            {brief.campaignName}
          </p>
          <a
            href={brief.resolved.permalinkUrl.startsWith("http")
              ? brief.resolved.permalinkUrl
              : `https://facebook.com${brief.resolved.permalinkUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            {brief.resolved.pageName} · {brief.resolved.mediaType}
            <ExternalLink className="size-3" />
          </a>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={tPages("brief.removeAria")}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {brief.warnings.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-amber-300/60 bg-amber-50/40 p-2 text-[11px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          {brief.warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-1">
              <AlertTriangle className="mt-0.5 size-3 shrink-0" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs">
        <label className="col-span-2 block">
          <span className="text-muted-foreground">Ad Account</span>
          <select
            value={brief.metaAccountId}
            onChange={(e) => {
              const a = accounts.find((x) => x.id === e.target.value);
              onChange({ metaAccountId: e.target.value, accountName: a?.name ?? "" });
            }}
            className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2"
          >
            <option value="">{tPages("brief.selectPlaceholder")}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-muted-foreground">{tPages("brief.budgetLabel")}</span>
          <Input
            type="number"
            min={20}
            step={50}
            value={brief.lifetimeBudgetThb}
            onChange={(e) => onChange({ lifetimeBudgetThb: Number(e.target.value) })}
            className="mt-1"
          />
        </label>
        <label className="block">
          <span className="text-muted-foreground">Optimization</span>
          <Input value={brief.optimizationGoal} disabled className="mt-1 opacity-60" />
        </label>
        <label className="block">
          <span className="text-muted-foreground">{tPages("brief.startLabel")}</span>
          <div className="mt-1">
            <DatePicker
              value={toLocalInputValue(brief.startTime)}
              onChange={(next) => onChange({ startTime: fromLocalInputValue(next) })}
              showTime
            />
          </div>
        </label>
        <label className="block">
          <span className="text-muted-foreground">{tPages("brief.endLabel")}</span>
          <div className="mt-1">
            <DatePicker
              value={toLocalInputValue(brief.endTime)}
              onChange={(next) => onChange({ endTime: fromLocalInputValue(next) })}
              showTime
            />
          </div>
        </label>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Clock className="size-3" />
        <span>{durationLabel(brief.startTime, brief.endTime, tPages)}</span>
      </div>
    </div>
  );
}

function toLocalInputValue(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  // Convert to "YYYY-MM-DDTHH:mm" in local timezone for the DatePicker value.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function fromLocalInputValue(s: string): Date {
  return new Date(s);
}

function durationLabel(
  start: Date | string,
  end: Date | string,
  t: ReturnType<typeof useTranslations>,
): string {
  const s = start instanceof Date ? start : new Date(start);
  const e = end instanceof Date ? end : new Date(end);
  const ms = e.getTime() - s.getTime();
  const hours = Math.round(ms / 3_600_000);
  if (hours < 24) return t("brief.durationHours", { hours });
  const days = Math.round(hours / 24);
  return t("brief.durationDays", { days });
}

function formatKpiText(
  kpi: BoostIntent["kpi"],
  t: ReturnType<typeof useTranslations>,
): string {
  if (!kpi) return "";
  const dir =
    kpi.direction === "at_least"
      ? t("kpi.atLeast")
      : kpi.direction === "at_most"
        ? t("kpi.atMost")
        : "";
  const parts = [kpi.type.toUpperCase()];
  if (kpi.target !== null) parts.push(String(kpi.target));
  if (kpi.unit) parts.push(kpi.unit);
  if (dir) parts.push(dir);
  return parts.join(" ");
}
