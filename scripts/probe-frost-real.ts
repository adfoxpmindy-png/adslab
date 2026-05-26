/**
 * Fetch REAL data from Meta API for FROST Magical Ice Of Siam over Thu-Mon.
 * - Per-campaign daily breakdown (spend, post_engagement, CPE)
 * - Account /activities log to see what budget edits / pauses happened each day
 *
 * Run: npx dotenv -e .env.local -- tsx scripts/probe-frost-real.ts
 */
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto/aes";

const FROST = "act_1856743671701430";
const FROST_NAME = "FROST Magical Ice Of Siam";
const V = "v23.0";
const SINCE = "2026-05-21";
const UNTIL = "2026-05-25";

type RawInsight = {
  date_start?: string;
  date_stop?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  reach?: string;
  ctr?: string;
  cpm?: string;
  frequency?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
  campaign_id?: string;
  campaign_name?: string;
};
type Page<T> = { data: T[]; paging?: { next?: string } };

function num(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function getActionValue(actions: RawInsight["actions"], type: string): number {
  if (!actions) return 0;
  return actions.filter((a) => a.action_type === type).reduce((s, a) => s + num(a.value), 0);
}
function getEngagement(actions: RawInsight["actions"]): number {
  // Meta's "post_engagement" rolls up likes + comments + shares + photo views + etc.
  return getActionValue(actions, "post_engagement");
}

async function fetchAll<T>(url: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = url;
  while (next) {
    const r = await fetch(next);
    const j = (await r.json()) as Page<T>;
    const errLike = j as unknown as { error?: { message: string } };
    if (errLike.error) {
      throw new Error(`Meta API: ${errLike.error.message}`);
    }
    out.push(...(j.data ?? []));
    next = j.paging?.next ?? null;
  }
  return out;
}

async function main() {
  const user = await prisma.user.findUnique({ where: { email: "test@test.com" } });
  if (!user) return;
  const membership = await prisma.tenantMember.findFirst({ where: { userId: user.id } });
  if (!membership) return;
  const conn = await prisma.metaConnection.findUnique({
    where: { tenantId: membership.tenantId },
    select: { accessTokenEncrypted: true, status: true },
  });
  if (!conn || conn.status !== "ACTIVE") {
    console.log("no active meta connection");
    return;
  }
  const token = decrypt(conn.accessTokenEncrypted);
  console.log(`Token decrypted. Window: ${SINCE} → ${UNTIL} (BKK).`);

  // 1. Per-campaign per-day insights
  console.log(`\n[1] Per-campaign daily insights from Meta:`);
  const insightsUrl =
    `https://graph.facebook.com/${V}/${FROST}/insights?` +
    new URLSearchParams({
      level: "campaign",
      time_range: JSON.stringify({ since: SINCE, until: UNTIL }),
      time_increment: "1",
      fields:
        "campaign_id,campaign_name,spend,impressions,clicks,reach,ctr,cpm,frequency,actions",
      limit: "500",
      access_token: token,
    }).toString();
  const rows = await fetchAll<RawInsight>(insightsUrl);
  console.log(`  ${rows.length} rows fetched.`);

  // Index: campaignId -> day -> aggregate
  type DailyRow = {
    campaignId: string;
    campaignName: string;
    date: string;
    spend: number;
    impressions: number;
    clicks: number;
    reach: number;
    ctr: number;
    cpm: number;
    engagement: number;
    cpe: number;
  };
  const daily: DailyRow[] = rows.map((r) => {
    const spend = num(r.spend);
    const eng = getEngagement(r.actions);
    return {
      campaignId: r.campaign_id ?? "?",
      campaignName: r.campaign_name ?? "?",
      date: r.date_start ?? "?",
      spend,
      impressions: num(r.impressions),
      clicks: num(r.clicks),
      reach: num(r.reach),
      ctr: num(r.ctr),
      cpm: num(r.cpm),
      engagement: eng,
      cpe: eng > 0 ? spend / eng : 0,
    };
  });

  // ---- 1a. Account-level totals per day ----
  console.log(`\n[1a] Account daily totals:`);
  const byDay = new Map<string, DailyRow[]>();
  for (const d of daily) {
    if (!byDay.has(d.date)) byDay.set(d.date, []);
    byDay.get(d.date)!.push(d);
  }
  for (const [date, rows] of [...byDay.entries()].sort()) {
    const spend = rows.reduce((s, r) => s + r.spend, 0);
    const imp = rows.reduce((s, r) => s + r.impressions, 0);
    const clk = rows.reduce((s, r) => s + r.clicks, 0);
    const eng = rows.reduce((s, r) => s + r.engagement, 0);
    const activeCampaigns = rows.filter((r) => r.spend > 0).length;
    console.log(
      `  ${date}  spend ฿${spend.toFixed(0).padStart(6)}  imp ${imp.toString().padStart(7)}  eng ${eng.toString().padStart(6)}  CPE ฿${eng > 0 ? (spend / eng).toFixed(2) : "—"}  active campaigns: ${activeCampaigns}/${rows.length}`,
    );
  }

  // ---- 1b. Aggregate window per campaign, sorted by spend ----
  console.log(`\n[1b] Top spenders (window total, sorted by spend):`);
  const byCamp = new Map<string, DailyRow[]>();
  for (const d of daily) {
    if (!byCamp.has(d.campaignId)) byCamp.set(d.campaignId, []);
    byCamp.get(d.campaignId)!.push(d);
  }
  const campAgg = [...byCamp.entries()].map(([cid, rows]) => {
    const spend = rows.reduce((s, r) => s + r.spend, 0);
    const eng = rows.reduce((s, r) => s + r.engagement, 0);
    const imp = rows.reduce((s, r) => s + r.impressions, 0);
    const clk = rows.reduce((s, r) => s + r.clicks, 0);
    return {
      campaignId: cid,
      campaignName: rows[0].campaignName,
      spend,
      engagement: eng,
      impressions: imp,
      clicks: clk,
      cpe: eng > 0 ? spend / eng : 0,
      ctr: imp > 0 ? (clk / imp) * 100 : 0,
    };
  });

  const sortedBySpend = [...campAgg].sort((a, b) => b.spend - a.spend);
  console.log(
    `\n  ${"Spend".padStart(8)}  ${"Eng".padStart(7)}  ${"CPE".padStart(7)}  ${"CTR".padStart(6)}  Campaign`,
  );
  for (const c of sortedBySpend.slice(0, 20)) {
    console.log(
      `  ฿${c.spend.toFixed(0).padStart(7)}  ${c.engagement.toString().padStart(7)}  ฿${c.cpe.toFixed(2).padStart(6)}  ${c.ctr.toFixed(2).padStart(5)}%  ${c.campaignName.slice(0, 70)}`,
    );
  }

  // ---- 1c. Sorted by COST PER ENGAGEMENT (low = good) ----
  console.log(`\n[1c] BEST CPE (cheapest engagement — top 10):`);
  const byCpeLow = campAgg
    .filter((c) => c.engagement >= 50)
    .sort((a, b) => a.cpe - b.cpe);
  for (const c of byCpeLow.slice(0, 10)) {
    console.log(
      `  ฿${c.cpe.toFixed(2).padStart(5)}/eng  spend ฿${c.spend.toFixed(0).padStart(6)}  ${c.engagement.toString().padStart(6)} eng  ${c.campaignName.slice(0, 70)}`,
    );
  }

  console.log(`\n[1d] WORST CPE (most expensive engagement — top 10, still spending):`);
  const byCpeHigh = campAgg
    .filter((c) => c.spend > 100 && c.engagement > 0)
    .sort((a, b) => b.cpe - a.cpe);
  for (const c of byCpeHigh.slice(0, 10)) {
    console.log(
      `  ฿${c.cpe.toFixed(2).padStart(5)}/eng  spend ฿${c.spend.toFixed(0).padStart(6)}  ${c.engagement.toString().padStart(6)} eng  ${c.campaignName.slice(0, 70)}`,
    );
  }

  // ---- 1e. Campaigns that spent BUT got 0 engagement ----
  const wasted = campAgg.filter((c) => c.spend > 200 && c.engagement === 0);
  console.log(`\n[1e] ⚠️ Wasted spend (>฿200 spend, 0 engagement, ${wasted.length} campaigns):`);
  for (const c of wasted) {
    console.log(`  ฿${c.spend.toFixed(0).padStart(6)} wasted  ${c.campaignName.slice(0, 80)}`);
  }

  // 2. Account /activities — what changed each day (budget edits, pauses)
  console.log(`\n\n[2] Account /activities log — what changed:`);
  const sinceUnix = Math.floor(new Date(SINCE + "T00:00:00+07:00").getTime() / 1000);
  const untilUnix = Math.floor(new Date(UNTIL + "T23:59:59+07:00").getTime() / 1000);
  const actUrl =
    `https://graph.facebook.com/${V}/${FROST}/activities?` +
    new URLSearchParams({
      since: String(sinceUnix),
      until: String(untilUnix),
      fields: "event_type,event_time,object_id,object_name,extra_data,actor_name",
      limit: "500",
      access_token: token,
    }).toString();
  type Activity = {
    event_type?: string;
    event_time?: string;
    object_id?: string;
    object_name?: string;
    extra_data?: string;
    actor_name?: string;
  };
  let activities: Activity[] = [];
  try {
    activities = await fetchAll<Activity>(actUrl);
  } catch (err) {
    console.log(`  Meta activities fetch failed: ${(err as Error).message}`);
  }
  console.log(`  ${activities.length} activities total`);

  // Filter to interesting events
  const interesting = activities.filter((a) =>
    a.event_type &&
    [
      "update_campaign_budget",
      "update_campaign_run_status",
      "update_ad_set_budget",
      "update_ad_set_run_status",
      "create_campaign_group",
      "create_ad_set",
      "create_ad",
      "delete_campaign_group",
      "delete_ad_set",
      "delete_ad",
    ].includes(a.event_type),
  );
  console.log(`  ${interesting.length} interesting (budget/status/create/delete):`);

  // Group by day
  const actByDay = new Map<string, Activity[]>();
  for (const a of interesting) {
    const day = (a.event_time ?? "").slice(0, 10);
    if (!actByDay.has(day)) actByDay.set(day, []);
    actByDay.get(day)!.push(a);
  }
  for (const [day, acts] of [...actByDay.entries()].sort()) {
    console.log(`\n  ${day}:  ${acts.length} changes`);
    const byType = new Map<string, number>();
    for (const a of acts) {
      const t = a.event_type ?? "?";
      byType.set(t, (byType.get(t) ?? 0) + 1);
    }
    for (const [t, n] of byType) console.log(`    ${t}: ${n}`);
    // sample 3 budget edits
    const budgetEdits = acts.filter((a) =>
      ["update_campaign_budget", "update_ad_set_budget"].includes(a.event_type ?? ""),
    );
    for (const a of budgetEdits.slice(0, 5)) {
      console.log(
        `      ${a.event_time?.slice(11, 16)}  ${a.event_type}  ${(a.object_name ?? "").slice(0, 50)}  ${(a.extra_data ?? "").slice(0, 100)}`,
      );
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
