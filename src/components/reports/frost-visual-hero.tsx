import {
  ArrowDown,
  Calendar,
  CheckCircle2,
  CircleDollarSign,
  RotateCw,
  Sparkles,
  Wrench,
} from "lucide-react";

import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto/aes";
import { cn } from "@/lib/utils";

const FROST_ACCOUNT_ID = "act_1856743671701430";
const V = "v23.0";
const WINDOW_START = "2026-05-21";
const WINDOW_END = "2026-05-25";

type RawInsight = {
  date_start?: string;
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: Array<{ action_type: string; value: string }>;
};

type DailyRow = {
  campaignId: string;
  campaignName: string;
  date: string;
  spend: number;
  engagement: number;
};

type Activity = {
  event_type?: string;
  event_time?: string;
  object_id?: string;
  object_name?: string;
  extra_data?: string;
};

type BudgetEdit = {
  date: string;
  time: string;
  campaignName: string;
  oldThb: number | null;
  newThb: number | null;
  deltaThb: number | null;
};

function num(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function getEngagement(actions: RawInsight["actions"]): number {
  if (!actions) return 0;
  return actions.filter((a) => a.action_type === "post_engagement").reduce((s, a) => s + num(a.value), 0);
}
async function fetchPaginated<T>(url: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = url;
  while (next) {
    const res = await fetch(next, { cache: "no-store" });
    const body = (await res.json()) as { data?: T[]; paging?: { next?: string }; error?: { message: string } };
    if (body.error) break;
    out.push(...(body.data ?? []));
    next = body.paging?.next ?? null;
  }
  return out;
}
function parseExtra(extra: string | undefined): { oldThb: number | null; newThb: number | null } {
  if (!extra) return { oldThb: null, newThb: null };
  try {
    const obj = JSON.parse(extra) as {
      old_value?: { old_value?: number };
      new_value?: { new_value?: number };
    };
    const oldRaw = obj.old_value?.old_value;
    const newRaw = obj.new_value?.new_value;
    return {
      oldThb: typeof oldRaw === "number" ? oldRaw / 100 : null,
      newThb: typeof newRaw === "number" ? newRaw / 100 : null,
    };
  } catch {
    return { oldThb: null, newThb: null };
  }
}
function fmtThb(n: number, decimals = 0): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}
function fmtCpe(n: number): string {
  if (n <= 0) return "—";
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(n);
}
function fmtNum(n: number): string {
  return new Intl.NumberFormat("th-TH").format(n);
}

const DAY_HEAD: Record<string, string> = {
  "2026-05-21": "21 พ.ค. (Thu)",
  "2026-05-22": "22 พ.ค. (Fri)",
  "2026-05-23": "23 พ.ค. (Sat)",
  "2026-05-24": "24 พ.ค. (Sun)",
  "2026-05-25": "25 พ.ค. (Mon)",
};
const DAY_LABEL_TABLE: Record<string, string> = {
  "2026-05-21": "Thu 21",
  "2026-05-22": "Fri 22",
  "2026-05-23": "Sat 23",
  "2026-05-24": "Sun 24",
  "2026-05-25": "Mon 25",
};
const DAY_THEMES: Record<string, string> = {
  "2026-05-21": "Launch Day",
  "2026-05-22": "",
  "2026-05-23": "Scale Day",
  "2026-05-24": "",
  "2026-05-25": "Heavy Pause Day",
};

export async function FrostVisualHero({ tenantId }: { tenantId: string; reportDate: Date }) {
  const conn = await prisma.metaConnection.findUnique({
    where: { tenantId },
    select: { accessTokenEncrypted: true, status: true },
  });
  if (!conn || conn.status !== "ACTIVE") return null;
  const token = decrypt(conn.accessTokenEncrypted);

  const days = ["2026-05-21", "2026-05-22", "2026-05-23", "2026-05-24", "2026-05-25"];

  const [dailyRows, activities] = await Promise.all([
    fetchPaginated<RawInsight>(
      `https://graph.facebook.com/${V}/${FROST_ACCOUNT_ID}/insights?` +
        new URLSearchParams({
          level: "campaign",
          time_range: JSON.stringify({ since: WINDOW_START, until: WINDOW_END }),
          time_increment: "1",
          fields: "campaign_id,campaign_name,spend,impressions,clicks,actions",
          limit: "500",
          access_token: token,
        }).toString(),
    ),
    (async () => {
      const sinceUnix = Math.floor(new Date(`${WINDOW_START}T00:00:00+07:00`).getTime() / 1000);
      const untilUnix = Math.floor(new Date(`${WINDOW_END}T23:59:59+07:00`).getTime() / 1000);
      return fetchPaginated<Activity>(
        `https://graph.facebook.com/${V}/${FROST_ACCOUNT_ID}/activities?` +
          new URLSearchParams({
            since: String(sinceUnix),
            until: String(untilUnix),
            fields: "event_type,event_time,object_id,object_name,extra_data",
            limit: "500",
            access_token: token,
          }).toString(),
      );
    })(),
  ]);

  if (dailyRows.length === 0) return null;

  // Per-campaign aggregated
  const rows: DailyRow[] = dailyRows.map((r) => ({
    campaignId: r.campaign_id ?? "?",
    campaignName: r.campaign_name ?? "?",
    date: r.date_start ?? "?",
    spend: num(r.spend),
    engagement: getEngagement(r.actions),
  }));

  // Daily totals
  const dailyTotals = days.map((d) => {
    const dRows = rows.filter((r) => r.date === d);
    const spend = dRows.reduce((s, r) => s + r.spend, 0);
    const eng = dRows.reduce((s, r) => s + r.engagement, 0);
    const active = dRows.filter((r) => r.spend > 0).length;
    return { date: d, spend, eng, active, cpe: eng > 0 ? spend / eng : 0 };
  });
  const weekSpend = dailyTotals.reduce((s, d) => s + d.spend, 0);
  const weekEng = dailyTotals.reduce((s, d) => s + d.eng, 0);
  const weekCpe = weekEng > 0 ? weekSpend / weekEng : 0;

  // Optimization events per day
  const budgetEdits: BudgetEdit[] = [];
  const statusByDay = new Map<string, { paused: number; resumed: number; total: number }>();
  const createByDay = new Map<string, { campaigns: number; adsets: number; ads: number }>();
  for (const a of activities) {
    if (!a.event_time || !a.event_type) continue;
    const date = a.event_time.slice(0, 10);
    const time = a.event_time.slice(11, 16);
    if (a.event_type === "update_campaign_budget" || a.event_type === "update_ad_set_budget") {
      const { oldThb, newThb } = parseExtra(a.extra_data);
      const delta = oldThb !== null && newThb !== null ? newThb - oldThb : null;
      budgetEdits.push({
        date,
        time,
        campaignName: a.object_name ?? "?",
        oldThb,
        newThb,
        deltaThb: delta,
      });
    } else if (
      a.event_type === "update_campaign_run_status" ||
      a.event_type === "update_ad_set_run_status"
    ) {
      const cur = statusByDay.get(date) ?? { paused: 0, resumed: 0, total: 0 };
      cur.total++;
      try {
        const obj = JSON.parse(a.extra_data ?? "{}") as { new_value?: string };
        if (obj.new_value === "PAUSED") cur.paused++;
        else if (obj.new_value === "ACTIVE") cur.resumed++;
      } catch {}
      statusByDay.set(date, cur);
    } else if (
      a.event_type === "create_campaign_group" ||
      a.event_type === "create_ad_set" ||
      a.event_type === "create_ad"
    ) {
      const cur = createByDay.get(date) ?? { campaigns: 0, adsets: 0, ads: 0 };
      if (a.event_type === "create_campaign_group") cur.campaigns++;
      else if (a.event_type === "create_ad_set") cur.adsets++;
      else cur.ads++;
      createByDay.set(date, cur);
    }
  }
  const totalActivityByDay = new Map<string, number>();
  for (const a of activities) {
    const d = (a.event_time ?? "").slice(0, 10);
    totalActivityByDay.set(d, (totalActivityByDay.get(d) ?? 0) + 1);
  }

  return (
    <section className="space-y-8 text-foreground">
      {/* ============ Optimization log ============ */}
      <div className="space-y-4">
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Wrench className="size-5" /> การ Optimize ที่เกิดขึ้นจริง (จาก /activities log)
        </h2>
        <p className="text-sm text-muted-foreground">
          Optimize {[...totalActivityByDay.keys()].filter((d) => (totalActivityByDay.get(d) ?? 0) > 0).length} วัน
          — ไม่ใช่ทุกวัน:
        </p>

        <div className="space-y-5">
          {days.map((d) => {
            const totalActs = totalActivityByDay.get(d) ?? 0;
            const created = createByDay.get(d);
            const editsToday = budgetEdits.filter((e) => e.date === d);
            const statusToday = statusByDay.get(d);
            const theme = DAY_THEMES[d];

            return (
              <div key={d} className="space-y-2">
                <h3 className="flex items-center gap-2 text-base font-semibold">
                  <Calendar className="size-4 text-muted-foreground" />
                  {DAY_HEAD[d]} — <span className="font-mono">{totalActs} activities</span>
                  {theme && (
                    <>
                      <span className="text-muted-foreground">·</span>
                      <span className="font-bold">{theme}</span>
                    </>
                  )}
                </h3>

                {totalActs === 0 ? (
                  <ul className="ml-6 space-y-1 text-sm text-muted-foreground">
                    <li>• ปล่อย campaigns รัน, ไม่แตะอะไร</li>
                  </ul>
                ) : (
                  <ul className="ml-6 space-y-1 text-sm">
                    {created && created.campaigns > 0 && (
                      <li className="flex items-baseline gap-2">
                        <Sparkles className="size-3.5 shrink-0 translate-y-0.5 text-amber-500" />
                        <span>
                          <span className="font-medium">สร้างใหม่:</span> {created.campaigns} campaigns
                          {created.adsets > 0 && ` + ${created.adsets} ad sets`}
                          {created.ads > 0 && ` + ${created.ads} ads`}
                        </span>
                      </li>
                    )}
                    {editsToday.length > 0 && (
                      <li className="flex items-baseline gap-2">
                        <CircleDollarSign className="size-3.5 shrink-0 translate-y-0.5 text-emerald-500" />
                        <span>
                          <span className="font-medium">Budget edits:</span> {editsToday.length} ครั้ง
                        </span>
                      </li>
                    )}
                    {statusToday && statusToday.total > 0 && (
                      <li className="flex items-baseline gap-2">
                        <RotateCw className="size-3.5 shrink-0 translate-y-0.5 text-muted-foreground" />
                        <span>
                          <span className="font-medium">Status changes:</span> {statusToday.total} ครั้ง
                          {statusToday.paused > 0 && ` (${statusToday.paused} paused`}
                          {statusToday.resumed > 0 && `${statusToday.paused > 0 ? ", " : " ("}${statusToday.resumed} resumed`}
                          {(statusToday.paused > 0 || statusToday.resumed > 0) && ")"}
                        </span>
                      </li>
                    )}

                    {/* Inline budget edits — up to 5 */}
                    {editsToday.length > 0 && (
                      <li className="!mt-2">
                        <ul className="ml-6 space-y-1 font-mono text-xs text-muted-foreground">
                          {editsToday.slice(0, 5).map((e, i) => (
                            <li key={i}>
                              {e.time} — {e.campaignName.slice(0, 55)}:{" "}
                              <span className="text-foreground">
                                {e.oldThb !== null ? fmtThb(e.oldThb) : "—"} →{" "}
                                {e.newThb !== null ? fmtThb(e.newThb) : "—"}
                              </span>
                              {e.deltaThb !== null && e.deltaThb !== 0 && (
                                <span
                                  className={cn(
                                    "ml-1",
                                    e.deltaThb > 0
                                      ? "text-emerald-600 dark:text-emerald-400"
                                      : "text-rose-600 dark:text-rose-400",
                                  )}
                                >
                                  ({e.deltaThb > 0 ? "+" : ""}
                                  {fmtThb(e.deltaThb)})
                                </span>
                              )}
                            </li>
                          ))}
                          {editsToday.length > 5 && (
                            <li className="italic">+ {editsToday.length - 5} edits เพิ่มเติม</li>
                          )}
                        </ul>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ============ Spend movement table ============ */}
      <div className="space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <CircleDollarSign className="size-5 text-emerald-500" /> Spend Movement (ของจริง)
        </h2>

        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">วัน</th>
                <th className="px-3 py-2 font-medium">Spend</th>
                <th className="px-3 py-2 font-medium">Engagement</th>
                <th className="px-3 py-2 font-medium">CPE</th>
                <th className="px-3 py-2 font-medium">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {dailyTotals.map((d, i) => {
                const prevCpe = i > 0 ? dailyTotals[i - 1].cpe : 0;
                const isImproving = i > 0 && d.cpe > 0 && d.cpe < prevCpe;
                return (
                  <tr key={d.date}>
                    <td className="px-3 py-2">{DAY_LABEL_TABLE[d.date]}</td>
                    <td className="px-3 py-2 tabular-nums">{fmtThb(d.spend)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmtNum(d.eng)}</td>
                    <td className="px-3 py-2 tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        {fmtCpe(d.cpe)}
                        {isImproving && (
                          <ArrowDown className="size-3 text-emerald-600 dark:text-emerald-400" />
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{d.active}</td>
                  </tr>
                );
              })}
              <tr className="bg-muted/30 font-semibold">
                <td className="px-3 py-2">รวม</td>
                <td className="px-3 py-2 tabular-nums">{fmtThb(weekSpend)}</td>
                <td className="px-3 py-2 tabular-nums">{fmtNum(weekEng)}</td>
                <td className="px-3 py-2 tabular-nums">{fmtCpe(weekCpe)} avg</td>
                <td className="px-3 py-2"></td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          CPE ลดลงทุกวัน = optimize ทำงาน
          <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
        </p>
      </div>
    </section>
  );
}
