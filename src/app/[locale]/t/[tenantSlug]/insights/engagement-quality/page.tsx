import Link from "next/link";
import { ChevronLeft, ChevronRight, Ruler, Award } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { requireTenantMember } from "@/lib/auth/tenant";
import {
  ALL_PREFIXES,
  FROST_ACCOUNT_NAME,
  THEME_LABELS,
  fetchAllFrostCampaigns,
  fmtCpe,
  fmtNum,
  fmtThb,
  getFrostToken,
  type CampaignSummary,
  type ThemePrefix,
} from "@/lib/frost-engagement";
import { cn } from "@/lib/utils";

export default async function EngagementQualityIndex({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant } = await requireTenantMember(tenantSlug);

  const token = await getFrostToken(tenant.id);
  if (!token) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-muted-foreground">No active Meta connection for this workspace.</p>
      </div>
    );
  }
  const allCampaigns = await fetchAllFrostCampaigns(token);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-8">
      <Link
        href={`/t/${tenantSlug}/insights/reports`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        <ChevronLeft className="size-4" />
        กลับไปหน้า Reports
      </Link>

      {/* Hero */}
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Insight · ทฤษฎีกับการอ่านผลโฆษณา
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">CPE ถูก ≠ Campaign ดี</h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Cost per Engagement (CPE) ที่ Meta คืน รวมการกระทำตั้งแต่ &ldquo;กดไลค์จริงจัง&rdquo;
          ถึง &ldquo;เลื่อนผ่านวิดีโอ 3 วินาที&rdquo; ในตัวเลขเดียว — แต่ละ campaign
          ในแต่ละ theme มี character ต่างกัน · เลือก theme ด้านล่างเพื่อดูแยก FB / IG +
          คำแนะนำเฉพาะของแต่ละกลุ่ม
        </p>
      </header>

      {/* Concept */}
      <Card className="bg-muted/30 p-5">
        <CardContent className="space-y-3 px-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Ruler className="size-5" /> Engagement quality scale
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Tier
              level="HIGH"
              tone="good"
              title="Comments + Shares"
              examples={["คนพิมพ์ comment ถาม / ตอบ", "Share ไปหน้าเพจตัวเอง / กลุ่ม"]}
              note="คนใช้เวลา + เปิดเผยตัวตน = intent สูง"
            />
            <Tier
              level="MEDIUM"
              tone="neutral"
              title="Reactions (likes + reactions)"
              examples={["กดไลค์ภาพ", "กด Heart บน Reel"]}
              note="คนใช้เวลา 1 วินาที — ความสนใจระดับกลาง"
            />
            <Tier
              level="LOW"
              tone="bad"
              title="Video views + Link clicks"
              examples={["เลื่อนผ่านดูวิดีโอ 3 วิ", "Auto-play แล้วไม่ unmute"]}
              note="Meta นับ แม้คน scroll ผ่าน — passive"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            * Meta นับทุกอย่างนี้รวมใน <code className="rounded bg-muted px-1">post_engagement</code> ตัวเดียว
          </p>
        </CardContent>
      </Card>

      {/* Account-wide totals */}
      <AccountTotalsCard campaigns={allCampaigns} />

      {/* Theme hub */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Award className="size-5" /> เลือก theme เพื่อดูรายละเอียด
        </h2>
        <p className="text-sm text-muted-foreground">
          {FROST_ACCOUNT_NAME} · {allCampaigns.length} active campaigns รวมทุก theme
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {ALL_PREFIXES.map((p) => (
            <ThemeCard key={p} theme={p} tenantSlug={tenantSlug} campaigns={allCampaigns} />
          ))}
        </div>
      </section>
    </div>
  );
}

function AccountTotalsCard({ campaigns }: { campaigns: CampaignSummary[] }) {
  const spend = campaigns.reduce((s, c) => s + c.spend, 0);
  const eng = campaigns.reduce((s, c) => s + c.engagement, 0);
  const comments = campaigns.reduce((s, c) => s + c.comments, 0);
  const shares = campaigns.reduce((s, c) => s + c.shares, 0);
  const reactions = campaigns.reduce((s, c) => s + c.reactions, 0);
  const videoViews = campaigns.reduce((s, c) => s + c.videoViews, 0);
  const fbCount = campaigns.filter((c) => c.channel === "FB").length;
  const igCount = campaigns.filter((c) => c.channel === "IG").length;
  const cpe = eng > 0 ? spend / eng : 0;

  return (
    <Card className="border-foreground/20 bg-foreground/5 p-5">
      <CardContent className="space-y-4 px-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">รวมทั้ง account · 5-day window (21-25 พ.ค.)</h2>
          <span className="text-xs text-muted-foreground">
            {campaigns.length} active · {fbCount} FB · {igCount} IG
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Total spend" value={fmtThb(spend)} />
          <Stat label="Engagement" value={fmtNum(eng)} />
          <Stat label="CPE blended" value={fmtCpe(cpe)} />
          <Stat label="Comments + Shares" value={fmtNum(comments + shares)} />
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground md:grid-cols-4">
          <span>Reactions: {fmtNum(reactions)}</span>
          <span>Comments: {fmtNum(comments)}</span>
          <span>Shares: {fmtNum(shares)}</span>
          <span>Video views: {fmtNum(videoViews)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function ThemeCard({
  theme,
  tenantSlug,
  campaigns,
}: {
  theme: ThemePrefix;
  tenantSlug: string;
  campaigns: CampaignSummary[];
}) {
  const themeCampaigns = campaigns.filter((c) => c.theme === theme);
  const fbCampaigns = themeCampaigns.filter((c) => c.channel === "FB");
  const igCampaigns = themeCampaigns.filter((c) => c.channel === "IG");
  const totalSpend = themeCampaigns.reduce((s, c) => s + c.spend, 0);
  const totalEng = themeCampaigns.reduce((s, c) => s + c.engagement, 0);
  const avgCpe = totalEng > 0 ? totalSpend / totalEng : 0;
  const bestCpe = themeCampaigns.length > 0 ? Math.min(...themeCampaigns.map((c) => c.cpe || Infinity)) : 0;
  const worstCpe = themeCampaigns.length > 0 ? Math.max(...themeCampaigns.map((c) => c.cpe)) : 0;
  const disabled = themeCampaigns.length === 0;

  const inner = (
    <Card
      className={cn(
        "h-full overflow-hidden p-4 transition-colors",
        !disabled && "hover:border-foreground/30 hover:bg-accent/30",
        disabled && "opacity-60",
      )}
    >
      <CardContent className="space-y-3 px-0">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold tracking-tight">{theme}</h3>
            <p className="text-xs text-muted-foreground">{THEME_LABELS[theme]}</p>
          </div>
          {!disabled && <ChevronRight className="size-4 text-muted-foreground" />}
        </div>

        {disabled ? (
          <p className="text-sm text-muted-foreground">ไม่มี campaign ที่มี data ใน window นี้</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <Stat label="Total spend" value={fmtThb(totalSpend)} />
              <Stat label="Engagement" value={fmtNum(totalEng)} />
              <Stat label="CPE blended" value={fmtCpe(avgCpe)} />
            </div>

            <div className="flex items-center gap-3 text-xs">
              <PlatformPill platform="FB" count={fbCampaigns.length} />
              <PlatformPill platform="IG" count={igCampaigns.length} />
              <span className="text-muted-foreground">
                · range CPE {fmtCpe(bestCpe)} → {fmtCpe(worstCpe)}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );

  if (disabled) return inner;
  return (
    <Link href={`/t/${tenantSlug}/insights/engagement-quality/${theme.toLowerCase()}`} className="block">
      {inner}
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function PlatformPill({ platform, count }: { platform: "FB" | "IG"; count: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/50 px-2 py-0.5 text-xs">
      <span
        className={cn(
          "inline-flex size-4 items-center justify-center rounded text-[9px] font-bold text-white",
          platform === "FB" ? "bg-[#1877f2]" : "bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af]",
        )}
      >
        {platform}
      </span>
      <span className="font-medium">{count}</span>
    </span>
  );
}

function Tier({
  level,
  title,
  examples,
  note,
  tone,
}: {
  level: string;
  title: string;
  examples: string[];
  note: string;
  tone: "good" | "bad" | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : tone === "bad"
        ? "border-rose-500/30 bg-rose-500/5"
        : "border-border bg-background";
  return (
    <div className={cn("space-y-2 rounded-md border p-3", toneClass)}>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{level}</div>
      <div className="font-medium">{title}</div>
      <ul className="ml-4 list-disc space-y-0.5 text-xs text-muted-foreground">
        {examples.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground">{note}</p>
    </div>
  );
}
