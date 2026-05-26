import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto/aes";
import { getCreativePreview, type CreativePreview } from "@/lib/meta/creative-preview";
import { cn } from "@/lib/utils";

const FROST_ACCOUNT_ID = "act_1856743671701430";
const FROST_NAME = "FROST Magical Ice Of Siam";
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
  ctr?: string;
  actions?: Array<{ action_type: string; value: string }>;
};

type DailyRow = {
  campaignId: string;
  campaignName: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
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
  campaignId: string;
  oldValueThb: number | null;
  newValueThb: number | null;
  deltaThb: number | null;
};

type StatusChange = {
  date: string;
  time: string;
  campaignName: string;
  campaignId: string;
  newStatus: string;
};

function num(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getEngagement(actions: RawInsight["actions"]): number {
  if (!actions) return 0;
  return actions
    .filter((a) => a.action_type === "post_engagement")
    .reduce((s, a) => s + num(a.value), 0);
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

async function fetchWeekDaily(token: string): Promise<DailyRow[]> {
  const url =
    `https://graph.facebook.com/${V}/${FROST_ACCOUNT_ID}/insights?` +
    new URLSearchParams({
      level: "campaign",
      time_range: JSON.stringify({ since: WINDOW_START, until: WINDOW_END }),
      time_increment: "1",
      fields: "campaign_id,campaign_name,spend,impressions,clicks,ctr,actions",
      limit: "500",
      access_token: token,
    }).toString();
  const rows = await fetchPaginated<RawInsight>(url);
  return rows.map((r) => ({
    campaignId: r.campaign_id ?? "?",
    campaignName: r.campaign_name ?? "?",
    date: r.date_start ?? "?",
    spend: num(r.spend),
    impressions: num(r.impressions),
    clicks: num(r.clicks),
    engagement: getEngagement(r.actions),
  }));
}

async function fetchActivities(token: string): Promise<Activity[]> {
  const sinceUnix = Math.floor(new Date(`${WINDOW_START}T00:00:00+07:00`).getTime() / 1000);
  const untilUnix = Math.floor(new Date(`${WINDOW_END}T23:59:59+07:00`).getTime() / 1000);
  const url =
    `https://graph.facebook.com/${V}/${FROST_ACCOUNT_ID}/activities?` +
    new URLSearchParams({
      since: String(sinceUnix),
      until: String(untilUnix),
      fields: "event_type,event_time,object_id,object_name,extra_data",
      limit: "500",
      access_token: token,
    }).toString();
  return fetchPaginated<Activity>(url);
}

async function fetchCreativeIdMap(token: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let url: string | null =
    `https://graph.facebook.com/${V}/${FROST_ACCOUNT_ID}/ads?` +
    new URLSearchParams({
      fields: "id,campaign_id,creative{id}",
      limit: "200",
      access_token: token,
    }).toString();
  while (url) {
    const res = await fetch(url, { cache: "no-store" });
    const body = (await res.json()) as {
      data?: Array<{ campaign_id?: string; creative?: { id?: string } }>;
      paging?: { next?: string };
    };
    for (const ad of body.data ?? []) {
      const cid = ad.campaign_id;
      const credId = ad.creative?.id;
      if (cid && credId && !out.has(cid)) out.set(cid, credId);
    }
    url = body.paging?.next ?? null;
  }
  return out;
}

function parseExtra(extra: string | undefined): { oldValue: number | null; newValue: number | null } {
  if (!extra) return { oldValue: null, newValue: null };
  try {
    const obj = JSON.parse(extra) as {
      old_value?: { type?: string; old_value?: number };
      new_value?: { type?: string; new_value?: number };
    };
    // Meta stores currency values in minor units (satang for THB), with type=payment_amount
    const oldRaw = obj.old_value?.old_value;
    const newRaw = obj.new_value?.new_value;
    const oldThb = typeof oldRaw === "number" ? oldRaw / 100 : null;
    const newThb = typeof newRaw === "number" ? newRaw / 100 : null;
    return { oldValue: oldThb, newValue: newThb };
  } catch {
    return { oldValue: null, newValue: null };
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

function fmtDelta(delta: number, isCurrency = true): string {
  const sign = delta > 0 ? "+" : "";
  return isCurrency ? `${sign}${fmtThb(delta)}` : `${sign}${delta.toFixed(2)}`;
}

const DAY_LABEL_TH: Record<string, string> = {
  "2026-05-21": "พฤหัส 21",
  "2026-05-22": "ศุกร์ 22",
  "2026-05-23": "เสาร์ 23",
  "2026-05-24": "อาทิตย์ 24",
  "2026-05-25": "จันทร์ 25",
};

export async function FrostVisualHero({ tenantId }: { tenantId: string; reportDate: Date }) {
  const conn = await prisma.metaConnection.findUnique({
    where: { tenantId },
    select: { accessTokenEncrypted: true, status: true },
  });
  if (!conn || conn.status !== "ACTIVE") return null;
  const token = decrypt(conn.accessTokenEncrypted);

  // Fan out three Meta calls in parallel
  const [dailyRows, activities, creativeMap] = await Promise.all([
    fetchWeekDaily(token),
    fetchActivities(token),
    fetchCreativeIdMap(token),
  ]);

  if (dailyRows.length === 0) return null;

  // ---- Daily totals across the week ----
  const days = ["2026-05-21", "2026-05-22", "2026-05-23", "2026-05-24", "2026-05-25"];
  const dailyTotals = days.map((d) => {
    const rows = dailyRows.filter((r) => r.date === d);
    const spend = rows.reduce((s, r) => s + r.spend, 0);
    const eng = rows.reduce((s, r) => s + r.engagement, 0);
    const active = rows.filter((r) => r.spend > 0).length;
    const cpe = eng > 0 ? spend / eng : 0;
    return { date: d, spend, eng, active, cpe };
  });
  const weekTotalSpend = dailyTotals.reduce((s, d) => s + d.spend, 0);
  const weekTotalEng = dailyTotals.reduce((s, d) => s + d.eng, 0);
  const weekAvgCpe = weekTotalEng > 0 ? weekTotalSpend / weekTotalEng : 0;
  const day1Cpe = dailyTotals[0]?.cpe ?? 0;
  const day5Cpe = dailyTotals[dailyTotals.length - 1]?.cpe ?? 0;
  const cpeImprovement = day1Cpe > 0 ? ((day1Cpe - day5Cpe) / day1Cpe) * 100 : 0;

  // ---- Optimization log per day ----
  const budgetEdits: BudgetEdit[] = [];
  const statusChanges: StatusChange[] = [];
  for (const a of activities) {
    if (!a.event_type || !a.event_time) continue;
    const date = a.event_time.slice(0, 10);
    const time = a.event_time.slice(11, 16);
    if (a.event_type === "update_campaign_budget" || a.event_type === "update_ad_set_budget") {
      const { oldValue, newValue } = parseExtra(a.extra_data);
      const delta = oldValue !== null && newValue !== null ? newValue - oldValue : null;
      budgetEdits.push({
        date,
        time,
        campaignName: a.object_name ?? "?",
        campaignId: a.object_id ?? "?",
        oldValueThb: oldValue,
        newValueThb: newValue,
        deltaThb: delta,
      });
    } else if (
      a.event_type === "update_campaign_run_status" ||
      a.event_type === "update_ad_set_run_status"
    ) {
      let newStatus = "?";
      try {
        const obj = JSON.parse(a.extra_data ?? "{}") as { new_value?: string };
        newStatus = obj.new_value ?? "?";
      } catch {}
      statusChanges.push({
        date,
        time,
        campaignName: a.object_name ?? "?",
        campaignId: a.object_id ?? "?",
        newStatus,
      });
    }
  }

  // Aggregate per-day stats
  const optByDay = days.map((d) => {
    const edits = budgetEdits.filter((e) => e.date === d);
    const statuses = statusChanges.filter((s) => s.date === d);
    const bumpAdded = edits
      .filter((e) => (e.deltaThb ?? 0) > 0)
      .reduce((s, e) => s + (e.deltaThb ?? 0), 0);
    const bumpCut = edits
      .filter((e) => (e.deltaThb ?? 0) < 0)
      .reduce((s, e) => s + Math.abs(e.deltaThb ?? 0), 0);
    const paused = statuses.filter((s) => s.newStatus === "PAUSED").length;
    const resumed = statuses.filter((s) => s.newStatus === "ACTIVE").length;
    return { date: d, edits, statuses, bumpAdded, bumpCut, paused, resumed };
  });

  // ---- Estimated savings from pauses ----
  // For each pause event, take the campaign's avg daily spend over the 3 days
  // before the pause, multiply by days remaining in the window.
  let estimatedSavings = 0;
  for (const s of statusChanges.filter((s) => s.newStatus === "PAUSED")) {
    const pauseDay = new Date(s.date);
    const daysRemaining = Math.max(0, Math.floor((new Date(WINDOW_END).getTime() - pauseDay.getTime()) / 86400000));
    if (daysRemaining === 0) continue;
    const campSpend = dailyRows.filter((r) => r.campaignId === s.campaignId && new Date(r.date) < pauseDay);
    const avgDaily = campSpend.length > 0 ? campSpend.reduce((sum, r) => sum + r.spend, 0) / campSpend.length : 0;
    estimatedSavings += avgDaily * daysRemaining;
  }

  // ---- Top 9 campaigns by week spend ----
  const byCamp = new Map<string, { name: string; spend: number; eng: number; clicks: number; imp: number }>();
  for (const r of dailyRows) {
    const cur = byCamp.get(r.campaignId) ?? { name: r.campaignName, spend: 0, eng: 0, clicks: 0, imp: 0 };
    cur.spend += r.spend;
    cur.eng += r.engagement;
    cur.clicks += r.clicks;
    cur.imp += r.impressions;
    byCamp.set(r.campaignId, cur);
  }
  const topCampaigns = [...byCamp.entries()]
    .map(([id, c]) => ({
      campaignId: id,
      ...c,
      cpe: c.eng > 0 ? c.spend / c.eng : 0,
      ctr: c.imp > 0 ? (c.clicks / c.imp) * 100 : 0,
    }))
    .filter((c) => c.spend > 0)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 9);

  // ---- Fetch creative previews for top 9 ----
  const previewPromises = topCampaigns.map(async (c) => {
    const credId = creativeMap.get(c.campaignId);
    if (!credId) return [c.campaignId, null as CreativePreview | null] as const;
    const p = await getCreativePreview(credId, tenantId);
    return [c.campaignId, p] as const;
  });
  const previewResults = await Promise.allSettled(previewPromises);
  const previewMap = new Map<string, CreativePreview | null>();
  for (const r of previewResults) {
    if (r.status === "fulfilled") previewMap.set(r.value[0], r.value[1]);
  }

  // -----------------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------------
  return (
    <section className="space-y-6">
      {/* Header */}
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Account focus · 5-day window</p>
        <h2 className="text-xl font-semibold tracking-tight">{FROST_NAME}</h2>
        <p className="text-sm text-muted-foreground">
          21 พ.ค. (พฤ) → 25 พ.ค. (จ) · เปรียบเทียบ optimization 5 วันรวด
        </p>
      </header>

      {/* Week summary — 4 KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Spend ทั้ง week" value={fmtThb(weekTotalSpend)} />
        <KpiCard label="Engagement ทั้ง week" value={fmtNum(weekTotalEng)} />
        <KpiCard
          label="CPE เฉลี่ย week"
          value={fmtCpe(weekAvgCpe)}
          accent={cpeImprovement > 30 ? "good" : cpeImprovement < 0 ? "bad" : "neutral"}
          sub={
            cpeImprovement !== 0
              ? `${cpeImprovement > 0 ? "↓" : "↑"} ${Math.abs(cpeImprovement).toFixed(1)}% vs day 1`
              : undefined
          }
        />
        <KpiCard
          label="ประหยัด (จาก pauses)"
          value={fmtThb(estimatedSavings)}
          accent={estimatedSavings > 0 ? "good" : "neutral"}
          sub={estimatedSavings > 0 ? "est. budget saved" : undefined}
        />
      </div>

      {/* Daily timeline */}
      <Card className="overflow-hidden">
        <div className="border-b border-border bg-muted/30 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Daily Optimization Log
        </div>
        <div className="divide-y divide-border">
          {dailyTotals.map((d, i) => {
            const opt = optByDay[i];
            const prevCpe = i > 0 ? dailyTotals[i - 1].cpe : 0;
            const cpeDelta = i > 0 ? d.cpe - prevCpe : 0;
            const cpeDeltaPct = prevCpe > 0 ? (cpeDelta / prevCpe) * 100 : 0;
            return (
              <div key={d.date} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <span className="font-medium text-foreground">{DAY_LABEL_TH[d.date]}</span>
                    <span className="ml-3 text-xs text-muted-foreground">
                      Spend {fmtThb(d.spend, 2)} · Eng {fmtNum(d.eng)} · {d.active} active
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">CPE </span>
                    <span className="font-medium tabular-nums">{fmtCpe(d.cpe)}</span>
                    {i > 0 && cpeDelta !== 0 && (
                      <span
                        className={cn(
                          "ml-2 text-xs tabular-nums",
                          cpeDelta < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
                        )}
                      >
                        {cpeDelta < 0 ? "↓" : "↑"} {fmtCpe(Math.abs(cpeDelta))} ({cpeDeltaPct > 0 ? "+" : ""}
                        {cpeDeltaPct.toFixed(1)}%)
                      </span>
                    )}
                  </div>
                </div>

                {/* Optimization summary line */}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  {opt.edits.length === 0 && opt.statuses.length === 0 ? (
                    <span className="text-muted-foreground">No changes — HOLD day</span>
                  ) : (
                    <>
                      {opt.bumpAdded > 0 && (
                        <Badge tone="good" label={`+ ฿${fmtNum(opt.bumpAdded)} bumped`} />
                      )}
                      {opt.bumpCut > 0 && (
                        <Badge tone="bad" label={`- ฿${fmtNum(opt.bumpCut)} cut`} />
                      )}
                      {opt.edits.length > 0 && (
                        <Badge tone="neutral" label={`${opt.edits.length} budget edits`} />
                      )}
                      {opt.paused > 0 && <Badge tone="bad" label={`${opt.paused} paused`} />}
                      {opt.resumed > 0 && <Badge tone="good" label={`${opt.resumed} resumed`} />}
                    </>
                  )}
                </div>

                {/* Show first 3 budget edits inline */}
                {opt.edits.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {opt.edits.slice(0, 3).map((e, idx) => (
                      <li key={idx} className="flex items-baseline gap-2">
                        <span className="font-mono text-[10px]">{e.time}</span>
                        <span className="truncate">{e.campaignName}</span>
                        <span className="tabular-nums">
                          {e.oldValueThb !== null && e.newValueThb !== null
                            ? `${fmtThb(e.oldValueThb)} → ${fmtThb(e.newValueThb)} (${fmtDelta(e.deltaThb ?? 0)})`
                            : "—"}
                        </span>
                      </li>
                    ))}
                    {opt.edits.length > 3 && (
                      <li className="italic">+ {opt.edits.length - 3} edits เพิ่มเติม</li>
                    )}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Top campaigns grid */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">Top campaigns ของ week (เรียงตาม spend)</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {topCampaigns.map((c) => {
            const preview = previewMap.get(c.campaignId) ?? null;
            return (
              <Card key={c.campaignId} className="overflow-hidden">
                <PreviewBox preview={preview} alt={c.name} />
                <CardContent className="flex flex-col gap-2 px-4 pt-3 pb-4 text-sm">
                  <div className="line-clamp-2 font-medium text-foreground">{c.name}</div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <Metric label="Spend" value={fmtThb(c.spend, 2)} />
                    <Metric label="Eng" value={fmtNum(c.eng)} />
                    <Metric
                      label="CPE"
                      value={fmtCpe(c.cpe)}
                      tone={c.cpe > 0 && c.cpe < 0.15 ? "good" : c.cpe > 1 ? "bad" : "neutral"}
                    />
                    <Metric label="CTR" value={`${c.ctr.toFixed(2)}%`} />
                  </dl>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function KpiCard({
  label,
  value,
  sub,
  accent = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "good" | "bad" | "neutral";
}) {
  const accentClass =
    accent === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : accent === "bad"
        ? "text-rose-600 dark:text-rose-400"
        : "text-foreground";
  return (
    <Card size="sm" className="px-4">
      <div className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className={cn("text-xl font-semibold tabular-nums", accentClass)}>{value}</span>
        {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
      </div>
    </Card>
  );
}

function Badge({ label, tone }: { label: string; tone: "good" | "bad" | "neutral" }) {
  const cls =
    tone === "good"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20"
      : tone === "bad"
        ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/20"
        : "bg-muted text-muted-foreground ring-border";
  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1", cls)}>
      {label}
    </span>
  );
}

function PreviewBox({ preview, alt }: { preview: CreativePreview | null; alt: string }) {
  const url = preview?.imageUrl ?? preview?.videoThumbUrl ?? null;
  if (!url) {
    return (
      <div className="flex aspect-video w-full items-center justify-center bg-muted/40 text-xs text-muted-foreground">
        No preview
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} loading="lazy" className="aspect-video w-full object-cover" />;
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "bad"
        ? "text-rose-600 dark:text-rose-400"
        : "text-foreground";
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`font-medium tabular-nums ${toneClass}`}>{value}</dd>
    </div>
  );
}
