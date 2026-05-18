import { Brain, TrendingUp, BarChart3, Clock } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/card";
import { requireTenantMember } from "@/lib/auth/tenant";
import { SetPageTitle } from "@/components/tenant/topbar-page-title";
import {
  actionTypeBreakdown,
  countPendingOutcomes,
  recentOutcomes,
  weeklyRollingSuccessRate,
} from "@/lib/ai/recommendation-stats";
import { OutcomeBadgeView } from "@/components/tenant/ai-result-badges";
import type { OutcomeBadgeKind } from "@/lib/reports/enrich-suggestions";

const ACTION_TYPE_LABEL: Record<string, string> = {
  pause: "หยุดแคมเปญ",
  resume: "เปิดแคมเปญ",
  scale_budget: "เพิ่ม / duplicate budget",
  change_budget: "ปรับ budget",
  refresh_creative: "เปลี่ยน creative",
  change_targeting: "ปรับ audience",
  diagnose: "วิเคราะห์ปัญหา",
  other: "อื่นๆ",
};

function actionLabel(t: string): string {
  return ACTION_TYPE_LABEL[t] ?? t;
}

function fmtWeek(d: Date): string {
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

function outcomeKindFromTaken(
  actionTaken: string,
  kpiDelta: { metric: string; percentChange: number } | null,
): { kind: OutcomeBadgeKind; metricLabel?: string; percentChange?: number } {
  if (actionTaken === "ignored") return { kind: "ignored" };
  if (actionTaken === "target_deleted") return { kind: "target_deleted" };
  if (actionTaken === "no_data") return { kind: "no_data" };
  if (!kpiDelta)
    return { kind: "followed-neutral" };
  const lowerIsBetter = ["spend", "cpv", "cpm"].includes(kpiDelta.metric);
  const change = kpiDelta.percentChange;
  if (Math.abs(change) < 1) {
    return {
      kind: "followed-neutral",
      metricLabel: kpiDelta.metric,
      percentChange: change,
    };
  }
  const positive = lowerIsBetter ? change < 0 : change > 0;
  return {
    kind: positive ? "followed-positive" : "followed-negative",
    metricLabel: kpiDelta.metric,
    percentChange: change,
  };
}

export default async function MemoryPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant } = await requireTenantMember(tenantSlug);

  const [weeks, breakdown, feed, pending] = await Promise.all([
    weeklyRollingSuccessRate(tenant.id, 4),
    actionTypeBreakdown(tenant.id),
    recentOutcomes(tenant.id, 20),
    countPendingOutcomes(tenant.id),
  ]);

  const totalOutcomes = feed.length + breakdown.reduce((s, b) => s + b.total, 0);
  const hasAnyData = breakdown.length > 0 || feed.length > 0;
  const tPages = await getTranslations("pages.memory");

  if (!hasAnyData) {
    return (
      <>
        <SetPageTitle title={tPages("title")} subtitle={tPages("subtitle")} />
        <div className="mx-auto w-full max-w-3xl space-y-6 px-6 py-8">
          <Card className="flex flex-col items-center justify-center gap-3 border-dashed py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
              <Brain className="size-5" />
            </div>
            <p className="text-sm font-medium">AI กำลังเก็บข้อมูล</p>
            <p className="max-w-md text-xs text-muted-foreground">
              เริ่มเห็นผลใน 7 วันหลังคำแนะนำแรก —
              AI จะคำนวณว่าการแนะนำของมันได้ผลจริงหรือไม่
              แล้วเรียนรู้เพื่อแนะนำให้ดีขึ้นในครั้งต่อไป
            </p>
            <p className="rounded-full bg-muted px-3 py-1 text-xs">
              ตอนนี้ track อยู่ {pending.toLocaleString()} คำแนะนำ
            </p>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <SetPageTitle title={tPages("title")} subtitle={tPages("subtitle")} />
      <div className="mx-auto w-full max-w-4xl space-y-6 px-6 py-8">
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">อัตราความสำเร็จ 4 สัปดาห์ล่าสุด</h2>
          </div>
          <div className="space-y-2">
            {weeks.map((w) => {
              const pct = w.total === 0 ? null : Math.round((w.successful / w.total) * 100);
              const barWidth = pct ?? 0;
              return (
                <div key={w.weekStart.toISOString()} className="grid grid-cols-[80px_1fr_60px] items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    สัปดาห์ {fmtWeek(w.weekStart)}
                  </span>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className={
                        pct === null
                          ? "h-2 rounded-full bg-muted"
                          : pct >= 70
                            ? "h-2 rounded-full bg-emerald-500"
                            : pct >= 50
                              ? "h-2 rounded-full bg-sky-500"
                              : "h-2 rounded-full bg-amber-500"
                      }
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <span className="text-right text-xs font-medium tabular-nums">
                    {pct === null ? "–" : `${w.successful}/${w.total} · ${pct}%`}
                  </span>
                </div>
              );
            })}
          </div>
          {pending > 0 && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              + อีก {pending} คำแนะนำกำลังรอผล (ครบ 7 วันเมื่อไหร่ AI จะคำนวณให้)
            </p>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">แยกตามประเภทคำแนะนำ</h2>
          </div>
          {breakdown.length === 0 ? (
            <p className="text-xs text-muted-foreground">ยังไม่มีข้อมูลพอจะแบ่งกลุ่ม</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 font-medium">ประเภท</th>
                  <th className="pb-2 text-right font-medium">ทั้งหมด</th>
                  <th className="pb-2 text-right font-medium">สำเร็จ</th>
                  <th className="pb-2 text-right font-medium">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 text-xs">
                {breakdown.map((b) => (
                  <tr key={b.actionType}>
                    <td className="py-2">{actionLabel(b.actionType)}</td>
                    <td className="py-2 text-right tabular-nums">{b.total}</td>
                    <td className="py-2 text-right tabular-nums">{b.successful}</td>
                    <td
                      className={
                        "py-2 text-right tabular-nums font-medium " +
                        (b.percent >= 70
                          ? "text-emerald-600 dark:text-emerald-400"
                          : b.percent >= 50
                            ? "text-sky-600 dark:text-sky-400"
                            : "text-amber-600 dark:text-amber-400")
                      }
                    >
                      {b.percent}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Clock className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">ผลลัพธ์ล่าสุด (20 รายการ)</h2>
          </div>
          {feed.length === 0 ? (
            <p className="text-xs text-muted-foreground">ยังไม่มีผลลัพธ์ที่คำนวณเสร็จ</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {feed.map((row) => {
                const badge = outcomeKindFromTaken(row.actionTaken, row.kpiDelta);
                return (
                  <li
                    key={row.recId}
                    className="grid grid-cols-1 gap-1 py-2 sm:grid-cols-[100px_1fr_auto] sm:items-center sm:gap-3"
                  >
                    <span className="text-[11px] text-muted-foreground">
                      {row.date.toLocaleDateString("th-TH", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">
                        {actionLabel(row.actionType)} · {row.targetKind}{" "}
                        <span className="text-muted-foreground">{row.targetMetaId}</span>
                      </p>
                    </div>
                    <OutcomeBadgeView badge={badge} />
                  </li>
                );
              })}
            </ul>
          )}
          {totalOutcomes > 20 && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              แสดง 20 ล่าสุดจากทั้งหมด {totalOutcomes} ผลลัพธ์
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
