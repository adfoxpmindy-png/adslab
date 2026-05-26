import Link from "next/link";
import { ChevronLeft, AlertCircle, CircleDollarSign, Info } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { requireTenantMember } from "@/lib/auth/tenant";
import { BudgetDonut } from "@/components/charts/budget-donut";
import { cn } from "@/lib/utils";
import {
  MEDIA_PLAN,
  PLAN_PERIOD_LABEL,
  PLATFORM_LABELS,
  PLATFORMS_TRACKED,
  TOTAL_PLANNED_BUDGET,
  buildBrandRollups,
  fetchBrandActuals,
  fmtThb,
  type BrandRollup,
  type Platform,
} from "@/lib/media-plan";

export default async function MediaPlanPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant } = await requireTenantMember(tenantSlug);

  const actuals = await fetchBrandActuals(tenant.id);
  const rollups = buildBrandRollups(actuals);

  const totalTrackedBudget = rollups.reduce((s, r) => s + r.trackedBudget, 0);
  const totalMetaSpend = rollups.reduce((s, r) => s + r.metaSpend, 0);
  const totalRemaining = Math.max(0, TOTAL_PLANNED_BUDGET - totalMetaSpend);
  const overallPct = TOTAL_PLANNED_BUDGET > 0 ? (totalMetaSpend / TOTAL_PLANNED_BUDGET) * 100 : 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-8">
      <Link
        href={`/t/${tenantSlug}/insights/reports`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        <ChevronLeft className="size-4" />
        กลับไปหน้า Reports
      </Link>

      {/* Hero */}
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Media Plan · ปะทะ Actual Spend
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          งบประมาณ vs ใช้จริง — {PLAN_PERIOD_LABEL}
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          เปรียบเทียบงบที่ตั้งไว้ใน Media Plan (4 แบรนด์ รวม {fmtThb(TOTAL_PLANNED_BUDGET)}) กับ
          spend จริงที่ AdsLab ดึงสดจาก Meta API (Facebook + Instagram) — TikTok และ Google Ads
          ยังไม่ได้เชื่อมต่อ
        </p>
      </header>

      {/* Account-wide donut */}
      <Card className="p-5">
        <CardContent className="px-0">
          <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[auto_1fr]">
            <BudgetDonut
              budget={TOTAL_PLANNED_BUDGET}
              spent={totalMetaSpend}
              brandColor="#10b981"
              formatValue={(n) => fmtThb(n)}
              size={200}
            />
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CircleDollarSign className="size-5 text-emerald-500" />
                <h2 className="text-xl font-semibold">รวมทุกแบรนด์</h2>
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Stat label="งบที่ตั้งไว้" value={fmtThb(TOTAL_PLANNED_BUDGET)} tone="neutral" />
                <Stat label="ใช้ไปแล้ว (Meta)" value={fmtThb(totalMetaSpend)} tone="good" />
                <Stat label="เหลือ" value={fmtThb(totalRemaining)} tone="neutral" />
                <Stat label="% ของแผน" value={`${overallPct.toFixed(1)}%`} tone="neutral" />
              </div>
              <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <strong className="text-foreground">หมายเหตุ:</strong>{" "}
                ใช้จริงนับเฉพาะ Facebook + Instagram (ที่ AdsLab ดึงข้อมูลได้) ·
                Tracked budget ของแผน = {fmtThb(totalTrackedBudget)} ({((totalTrackedBudget / TOTAL_PLANNED_BUDGET) * 100).toFixed(0)}% ของงบรวม) ·
                ส่วนที่เหลือคือ TikTok + Google ที่ยังไม่ได้เชื่อมต่อ
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-brand donuts */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">แยกตามแบรนด์</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {rollups.map((r) => (
            <BrandCard key={r.plan.key} rollup={r} />
          ))}
        </div>
      </section>

      {/* Per-platform breakdown table */}
      <PlatformBreakdownTable rollups={rollups} />

      {/* Reference: PDF reported numbers */}
      <ReferenceNote rollups={rollups} />
    </div>
  );
}

function BrandCard({ rollup }: { rollup: BrandRollup }) {
  const { plan, metaSpend, perPlatformSpend, trackedBudget, trackedRemaining, spentPctOfTotal } = rollup;
  return (
    <Card className="overflow-hidden p-4">
      <CardContent className="space-y-4 px-0">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span
              className="inline-block size-3 rounded-full"
              style={{ backgroundColor: plan.brandColor }}
              aria-hidden
            />
            <h3 className="text-base font-semibold tracking-tight">{plan.name}</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            แผน {fmtThb(plan.monthlyBudget)} · prefix {plan.campaignPrefix}
          </p>
        </div>

        <div className="flex justify-center">
          <BudgetDonut
            budget={plan.monthlyBudget}
            spent={metaSpend}
            brandColor={plan.brandColor}
            formatValue={(n) => fmtThb(n)}
            size={140}
          />
        </div>

        <div className="space-y-2 text-sm">
          <Row label="ใช้แล้ว (FB + IG)" value={fmtThb(metaSpend)} tone={metaSpend > 0 ? "good" : "neutral"} />
          <Row label="เหลือใน FB + IG" value={fmtThb(trackedRemaining)} tone="neutral" />
          <Row
            label={`% ของงบทั้งแบรนด์`}
            value={`${spentPctOfTotal.toFixed(1)}%`}
            tone={spentPctOfTotal > 100 ? "bad" : "neutral"}
          />
        </div>

        {/* Per-platform mini-rows */}
        <div className="space-y-1 border-t border-border pt-3 text-xs">
          {(Object.keys(plan.platforms) as Platform[]).map((p) => {
            const planned = plan.platforms[p];
            if (planned === 0) return null;
            const tracked = PLATFORMS_TRACKED.includes(p);
            const actual = tracked ? perPlatformSpend[p] ?? 0 : null;
            return (
              <div key={p} className="flex items-center justify-between">
                <span className="text-muted-foreground">{PLATFORM_LABELS[p]}</span>
                <span className="tabular-nums">
                  {actual !== null ? (
                    <>
                      <span className="text-foreground">{fmtThb(actual)}</span>{" "}
                      <span className="text-muted-foreground">/ {fmtThb(planned)}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground italic">
                      ยังไม่เชื่อม · แผน {fmtThb(planned)}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function PlatformBreakdownTable({ rollups }: { rollups: BrandRollup[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border bg-muted/30 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Per-platform breakdown
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/20">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium">แบรนด์</th>
              <th className="px-3 py-2 font-medium">Facebook</th>
              <th className="px-3 py-2 font-medium">Instagram</th>
              <th className="px-3 py-2 font-medium">TikTok</th>
              <th className="px-3 py-2 font-medium">Google Ads</th>
              <th className="px-3 py-2 font-medium">Total Plan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rollups.map((r) => {
              const plan = r.plan;
              return (
                <tr key={plan.key}>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block size-2.5 rounded-full"
                        style={{ backgroundColor: plan.brandColor }}
                        aria-hidden
                      />
                      <span className="font-medium">{plan.name}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    <PlatformCell
                      planned={plan.platforms.facebook}
                      actual={r.perPlatformSpend.facebook ?? 0}
                      tracked
                    />
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    <PlatformCell
                      planned={plan.platforms.instagram}
                      actual={r.perPlatformSpend.instagram ?? 0}
                      tracked
                    />
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    <PlatformCell planned={plan.platforms.tiktok} tracked={false} />
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    <PlatformCell planned={plan.platforms.google} tracked={false} />
                  </td>
                  <td className="px-3 py-2 font-semibold tabular-nums">
                    {fmtThb(plan.monthlyBudget)}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-muted/30 font-semibold">
              <td className="px-3 py-2">รวม</td>
              <td className="px-3 py-2 tabular-nums">
                {fmtThb(rollups.reduce((s, r) => s + r.plan.platforms.facebook, 0))}
              </td>
              <td className="px-3 py-2 tabular-nums">
                {fmtThb(rollups.reduce((s, r) => s + r.plan.platforms.instagram, 0))}
              </td>
              <td className="px-3 py-2 tabular-nums">
                {fmtThb(rollups.reduce((s, r) => s + r.plan.platforms.tiktok, 0))}
              </td>
              <td className="px-3 py-2 tabular-nums">
                {fmtThb(rollups.reduce((s, r) => s + r.plan.platforms.google, 0))}
              </td>
              <td className="px-3 py-2 tabular-nums">{fmtThb(TOTAL_PLANNED_BUDGET)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PlatformCell({
  planned,
  actual,
  tracked,
}: {
  planned: number;
  actual?: number;
  tracked: boolean;
}) {
  if (planned === 0) return <span className="text-muted-foreground">—</span>;
  if (!tracked) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="text-foreground">{fmtThb(planned)}</span>
        <AlertCircle className="size-3 text-amber-500" />
      </span>
    );
  }
  const a = actual ?? 0;
  const pct = planned > 0 ? (a / planned) * 100 : 0;
  return (
    <span>
      <span className="text-foreground">{fmtThb(a)}</span>
      <span className="text-muted-foreground"> / {fmtThb(planned)}</span>
      <span className={cn("ml-1 text-[10px]", pct > 100 ? "text-rose-600" : "text-muted-foreground")}>
        ({pct.toFixed(0)}%)
      </span>
    </span>
  );
}

function ReferenceNote({ rollups }: { rollups: BrandRollup[] }) {
  const withRef = rollups.filter((r) => r.pdfReportedSpend !== null);
  if (withRef.length === 0) return null;
  return (
    <Card className="border-amber-500/30 bg-amber-500/5 p-4">
      <CardContent className="space-y-2 px-0">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Info className="size-4 text-amber-600 dark:text-amber-400" />
          อ้างอิงจาก Media Plan PDF (1-20 พ.ค.)
        </h3>
        <ul className="ml-5 list-disc space-y-1 text-xs text-muted-foreground">
          {withRef.map((r) => (
            <li key={r.plan.key}>
              <strong className="text-foreground">{r.plan.name}</strong> · PDF บอกใช้ไป{" "}
              {fmtThb(r.pdfReportedSpend!)} (1-20 พ.ค.) · AdsLab fetch สด MTD จาก Meta ได้{" "}
              {fmtThb(r.metaSpend)}
            </li>
          ))}
          <li>ยอดที่รอตัดบัตร PDF: ฿1,304.39 — ยังไม่รวมในตัวเลข AdsLab</li>
        </ul>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "bad" | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "bad"
        ? "text-rose-600 dark:text-rose-400"
        : "text-foreground";
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn("text-lg font-semibold tabular-nums", toneClass)}>{value}</span>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone: "good" | "bad" | "neutral" }) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "bad"
        ? "text-rose-600 dark:text-rose-400"
        : "text-foreground";
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium tabular-nums", toneClass)}>{value}</span>
    </div>
  );
}

void MEDIA_PLAN;
