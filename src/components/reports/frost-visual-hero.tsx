import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto/aes";
import { getCreativePreview, type CreativePreview } from "@/lib/meta/creative-preview";

const FROST_ACCOUNT_ID = "act_1856743671701430";
const FROST_NAME = "FROST Magical Ice Of Siam";
const V = "v23.0";

type RawInsight = {
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  actions?: Array<{ action_type: string; value: string }>;
};

type CampaignRow = {
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  engagement: number;
  cpe: number;
  ctr: number;
};

function num(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getEngagement(actions: RawInsight["actions"]): number {
  if (!actions) return 0;
  return actions.filter((a) => a.action_type === "post_engagement").reduce((s, a) => s + num(a.value), 0);
}

async function fetchFrostDayInsights(
  tenantId: string,
  dateISO: string,
): Promise<CampaignRow[] | null> {
  const conn = await prisma.metaConnection.findUnique({
    where: { tenantId },
    select: { accessTokenEncrypted: true, status: true },
  });
  if (!conn || conn.status !== "ACTIVE") return null;
  const token = decrypt(conn.accessTokenEncrypted);

  const url =
    `https://graph.facebook.com/${V}/${FROST_ACCOUNT_ID}/insights?` +
    new URLSearchParams({
      level: "campaign",
      time_range: JSON.stringify({ since: dateISO, until: dateISO }),
      fields: "campaign_id,campaign_name,spend,impressions,clicks,ctr,actions",
      limit: "500",
      access_token: token,
    }).toString();

  try {
    const res = await fetch(url, { cache: "no-store" });
    const body = (await res.json()) as { data?: RawInsight[]; error?: { message: string } };
    if (body.error) return null;
    const rows = body.data ?? [];
    return rows.map((r) => {
      const spend = num(r.spend);
      const eng = getEngagement(r.actions);
      const imp = num(r.impressions);
      const clicks = num(r.clicks);
      return {
        campaignId: r.campaign_id ?? "?",
        campaignName: r.campaign_name ?? "?",
        spend,
        impressions: imp,
        clicks,
        engagement: eng,
        cpe: eng > 0 ? spend / eng : 0,
        ctr: imp > 0 ? (clicks / imp) * 100 : 0,
      };
    });
  } catch {
    return null;
  }
}

/**
 * Fetches a creativeId for each campaign via 1 batched Meta call per account.
 * Returns Map<campaignId, creativeId>.
 */
async function fetchCreativeIdMap(tenantId: string): Promise<Map<string, string>> {
  const conn = await prisma.metaConnection.findUnique({
    where: { tenantId },
    select: { accessTokenEncrypted: true, status: true },
  });
  if (!conn || conn.status !== "ACTIVE") return new Map();
  const token = decrypt(conn.accessTokenEncrypted);
  // No effective_status filter — Meta uses CAMPAIGN_PAUSED / ADSET_PAUSED for
  // ads under paused parents, and filtering for ["ACTIVE","PAUSED"] silently
  // drops them. We want the first creativeId per campaign regardless of
  // current run status (so previews show even on a Prune Day).
  const out = new Map<string, string>();
  let url: string | null =
    `https://graph.facebook.com/${V}/${FROST_ACCOUNT_ID}/ads?` +
    new URLSearchParams({
      fields: "id,campaign_id,creative{id}",
      limit: "200",
      access_token: token,
    }).toString();
  try {
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
  } catch {
    // swallow — hero falls back to placeholders
  }
  return out;
}

function formatThb(n: number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatNum(n: number): string {
  return new Intl.NumberFormat("th-TH").format(n);
}

export async function FrostVisualHero({
  tenantId,
  reportDate,
}: {
  tenantId: string;
  reportDate: Date;
}) {
  const dateISO = reportDate.toISOString().slice(0, 10);
  const campaigns = await fetchFrostDayInsights(tenantId, dateISO);
  if (!campaigns || campaigns.length === 0) {
    return null; // hero is opt-in; if no FROST data, just render the markdown below
  }

  // Aggregate totals
  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
  const totalEng = campaigns.reduce((s, c) => s + c.engagement, 0);
  const activeCount = campaigns.filter((c) => c.spend > 0).length;
  const accountCpe = totalEng > 0 ? totalSpend / totalEng : 0;

  // Top 9 by spend (3x3 grid)
  const topSpend = [...campaigns].filter((c) => c.spend > 0).sort((a, b) => b.spend - a.spend).slice(0, 9);

  // Fetch creative previews in parallel (cached via MetaAdCreativePreview)
  const creativeIdMap = await fetchCreativeIdMap(tenantId);
  const previewPromises = topSpend.map(async (c) => {
    const credId = creativeIdMap.get(c.campaignId);
    if (!credId) return [c.campaignId, null as CreativePreview | null] as const;
    const p = await getCreativePreview(credId, tenantId);
    return [c.campaignId, p] as const;
  });
  const previewResults = await Promise.allSettled(previewPromises);
  const previewMap = new Map<string, CreativePreview | null>();
  for (const r of previewResults) {
    if (r.status === "fulfilled") {
      previewMap.set(r.value[0], r.value[1]);
    }
  }

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Account focus</p>
        <h2 className="text-xl font-semibold tracking-tight">{FROST_NAME}</h2>
      </header>

      {/* KPI row — 4 cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Spend" value={formatThb(totalSpend)} />
        <KpiCard label="Engagement" value={formatNum(totalEng)} />
        <KpiCard label="Cost / Engagement" value={accountCpe > 0 ? formatThb(accountCpe) : "—"} />
        <KpiCard label="Active campaigns" value={`${activeCount}/${campaigns.length}`} />
      </div>

      {/* Campaign grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {topSpend.map((c) => {
          const preview = previewMap.get(c.campaignId) ?? null;
          return (
            <Card key={c.campaignId} className="overflow-hidden">
              <PreviewBox preview={preview} alt={c.campaignName} />
              <CardContent className="flex flex-col gap-2 px-4 pt-3 pb-4 text-sm">
                <div className="line-clamp-2 font-medium text-foreground">{c.campaignName}</div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <Metric label="Spend" value={formatThb(c.spend)} />
                  <Metric label="Eng" value={formatNum(c.engagement)} />
                  <Metric
                    label="CPE"
                    value={c.cpe > 0 ? formatThb(c.cpe) : "—"}
                    tone={c.cpe > 0 && c.cpe < 0.15 ? "good" : c.cpe > 1 ? "bad" : "neutral"}
                  />
                  <Metric label="CTR" value={`${c.ctr.toFixed(2)}%`} />
                </dl>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card size="sm" className="px-4">
      <div className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="text-xl font-semibold tabular-nums">{value}</span>
      </div>
    </Card>
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
