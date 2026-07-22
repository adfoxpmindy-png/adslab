/**
 * BaanYen sales-evidence pitch page.
 *
 * Public, unauthenticated Server Component that renders a 30-day audit of
 * the BaanYen Cool Shield Meta ad account (act_850301510936600). All numbers
 * are real — pulled by scripts/analyze-baanyen-30d.ts and frozen into
 * src/lib/pitch/baanyen.ts. This page is intentionally static so it can be
 * shared as a URL with the prospect and does not depend on live API access.
 *
 * Route: /pitch/baanyen  (outside [locale], outside auth, outside tenant scope)
 */
import {
  AlertCircle,
  Award,
  CircleDollarSign,
  Info,
  Ruler,
  Sparkles,
  Target,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  BAANYEN_COPY,
  BAANYEN_FINDINGS,
  BAANYEN_HIDDEN_GEM,
  BAANYEN_PROOF_POINTS,
  BAANYEN_SNAPSHOT,
  BAANYEN_TOTAL_PROJECTED_IMPACT_THB,
  fmtInt,
  fmtThb,
  type Finding,
  type FindingSeverity,
  type ProofPoint,
} from "@/lib/pitch/baanyen";

export const metadata = {
  title: "AdsLab — วิเคราะห์บัญชี BaanYen Cool Shield (30 วัน)",
  description:
    "รายงานวิเคราะห์บัญชีโฆษณา Meta ของ BaanYen 30 วันย้อนหลัง พร้อมชี้จุดที่ Meta ไม่บอก และผลกระทบเป็นตัวเลขบาท",
};

export default function BaanYenPitchPage() {
  const s = BAANYEN_SNAPSHOT;
  const findingsWithImpact = BAANYEN_FINDINGS.filter(
    (f) => f.projectedImpactThb > 0,
  ).length;
  const highSeverityCount = BAANYEN_FINDINGS.filter((f) => f.severity === "high")
    .length;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-6 py-10">
      {/* Hero */}
      <header className="space-y-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          AdsLab · รายงานวิเคราะห์บัญชีโฆษณา
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {BAANYEN_COPY.heroHeadline}
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          {BAANYEN_COPY.heroSubheadline}
        </p>

        {/* Brand strip */}
        <div className="flex flex-wrap items-center gap-2 pt-2 text-xs text-muted-foreground">
          <BrandChip>BaanYen Cool Shield</BrandChip>
          <span aria-hidden>·</span>
          <BrandChip>Meta Ads (Facebook + Instagram)</BrandChip>
          <span aria-hidden>·</span>
          <BrandChip>30 วัน · {s.since} → {s.until}</BrandChip>
          <span aria-hidden>·</span>
          <BrandChip>account {s.accountId}</BrandChip>
        </div>
      </header>

      {/* Snapshot: 4 tiles */}
      <section aria-labelledby="snapshot-heading" className="space-y-3">
        <h2
          id="snapshot-heading"
          className="flex items-center gap-2 text-xl font-semibold"
        >
          <Ruler className="size-5" />
          ภาพรวมบัญชี 30 วัน
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <SnapshotTile
            label="Total spend"
            value={fmtThb(s.totalSpendThb)}
            sub={`${s.campaignsCount} campaigns`}
            tone="neutral"
          />
          <SnapshotTile
            label="Reach"
            value={fmtInt(s.totalReach)}
            sub={`${fmtInt(s.totalImpressions)} impressions`}
            tone="neutral"
          />
          <SnapshotTile
            label="Findings ที่เจอ"
            value={`${BAANYEN_FINDINGS.length}`}
            sub={`${highSeverityCount} high severity · ${findingsWithImpact} มีผลกระทบเป็นบาท`}
            tone="neutral"
          />
          <SnapshotTile
            label="ผลกระทบต่อเดือน (ประมาณการ)"
            value={fmtThb(BAANYEN_TOTAL_PROJECTED_IMPACT_THB)}
            sub="งบที่กู้กลับได้ / เดือน"
            tone="good"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          CTR เฉลี่ย {s.ctrAvg.toFixed(2)}% · CPM เฉลี่ย {fmtThb(s.cpmAvg)} ·
          Engagement {fmtInt(s.totalEngagement)} · Messages {fmtInt(s.totalMessages)}
        </p>
      </section>

      {/* Problem */}
      <Card className="p-5">
        <CardContent className="space-y-3 px-0">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <AlertCircle className="size-5 text-rose-500" />
            ปัญหาที่ Ads Manager ไม่บอกคุณ
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {BAANYEN_COPY.problemSection}
          </p>
        </CardContent>
      </Card>

      {/* Findings grid */}
      <section aria-labelledby="findings-heading" className="space-y-4">
        <div className="space-y-1">
          <h2
            id="findings-heading"
            className="flex items-center gap-2 text-xl font-semibold"
          >
            <Target className="size-5" />
            10 จุดที่ AdsLab เจอในบัญชี BaanYen
          </h2>
          <p className="text-sm text-muted-foreground">
            แต่ละจุดคำนวณผลกระทบเป็นบาท ไม่ใช่แค่กราฟหรือ % — high severity คือจุดที่ควรแก้ก่อน
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {BAANYEN_FINDINGS.map((f) => (
            <FindingCard key={f.code} finding={f} />
          ))}
        </div>
      </section>

      {/* Hidden gem */}
      <HiddenGemCallout />

      {/* Solution */}
      <Card className="border-foreground/20 bg-foreground/5 p-5">
        <CardContent className="space-y-3 px-0">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Sparkles className="size-5" />
            AdsLab ทำงานยังไง
          </h2>
          <p className="text-sm leading-relaxed">{BAANYEN_COPY.solutionSection}</p>
        </CardContent>
      </Card>

      {/* Proof points */}
      <section aria-labelledby="proof-heading" className="space-y-4">
        <h2
          id="proof-heading"
          className="flex items-center gap-2 text-xl font-semibold"
        >
          <CircleDollarSign className="size-5" />
          5 ตัวอย่างสิ่งที่ระบบตรวจให้อัตโนมัติ
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {BAANYEN_PROOF_POINTS.map((p) => (
            <ProofPointCard key={p.titleTh} point={p} />
          ))}
        </div>
      </section>

      {/* Testimonial */}
      <Card className="border-amber-500/30 bg-amber-500/5 p-5">
        <CardContent className="px-0">
          <blockquote className="space-y-2 text-sm leading-relaxed">
            <Info
              className="size-4 text-amber-600 dark:text-amber-400"
              aria-hidden
            />
            <p>{BAANYEN_COPY.testimonial}</p>
          </blockquote>
        </CardContent>
      </Card>

      {/* Final CTA */}
      <Card className="border-foreground/20 bg-foreground/5 p-6">
        <CardContent className="space-y-4 px-0">
          <div className="flex items-center gap-2">
            <Award className="size-5" />
            <h2 className="text-xl font-semibold">ขั้นต่อไป</h2>
          </div>
          <p className="text-sm leading-relaxed">{BAANYEN_COPY.finalCta}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {BAANYEN_COPY.pricingHint}
          </p>
          <div className="pt-2">
            <span className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background">
              <Sparkles className="size-4" />
              {BAANYEN_COPY.heroCta}
            </span>
          </div>
        </CardContent>
      </Card>

      <footer className="pt-4 text-center text-xs text-muted-foreground">
        รายงานฉบับนี้อ้างอิงข้อมูลจริงจาก Meta Marketing API v23.0 ·
        ดึงข้อมูล {s.since} → {s.until} · account {s.accountId}
      </footer>
    </div>
  );
}

/* ----------------------------- Sub-components ----------------------------- */

function BrandChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-muted/40 px-3 py-1 text-xs text-foreground">
      {children}
    </span>
  );
}

type Tone = "good" | "bad" | "neutral";

function toneTextClass(tone: Tone): string {
  return tone === "good"
    ? "text-emerald-600 dark:text-emerald-400"
    : tone === "bad"
      ? "text-rose-600 dark:text-rose-400"
      : "text-foreground";
}

function SnapshotTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: Tone;
}) {
  return (
    <Card size="sm" className="px-4">
      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className={cn("text-xl font-semibold tabular-nums", toneTextClass(tone))}>
          {value}
        </span>
        <span className="text-[11px] text-muted-foreground">{sub}</span>
      </div>
    </Card>
  );
}

function SeverityBadge({ severity }: { severity: FindingSeverity }) {
  const label =
    severity === "high" ? "HIGH" : severity === "medium" ? "MEDIUM" : "LOW";
  const cls =
    severity === "high"
      ? "bg-rose-500/10 text-rose-600 ring-rose-500/30 dark:text-rose-400"
      : severity === "medium"
        ? "bg-amber-500/10 text-amber-700 ring-amber-500/30 dark:text-amber-400"
        : "bg-muted/40 text-muted-foreground ring-foreground/10";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1",
        cls,
      )}
    >
      {label}
    </span>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  const hasImpact = finding.projectedImpactThb > 0;
  return (
    <Card className="p-5">
      <CardContent className="space-y-3 px-0">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
                {finding.code}
              </span>
              <SeverityBadge severity={finding.severity} />
            </div>
            <h3 className="text-base font-semibold leading-snug">{finding.title}</h3>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              metric: {finding.metric}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              ผลกระทบ / เดือน
            </div>
            <div
              className={cn(
                "text-lg font-semibold tabular-nums",
                hasImpact ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
              )}
            >
              {hasImpact ? fmtThb(finding.projectedImpactThb) : "—"}
            </div>
          </div>
        </div>

        <div className="space-y-2 rounded-md bg-muted/30 p-3 text-xs leading-relaxed">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            สภาพปัจจุบัน
          </div>
          <p>{finding.currentValue}</p>
        </div>

        <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
          <div className="text-[10px] uppercase tracking-wide">AdsLab หาเจอได้ยังไง</div>
          <p>{finding.howAdsLabFindsIt}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function HiddenGemCallout() {
  const g = BAANYEN_HIDDEN_GEM;
  return (
    <Card className="border-emerald-500/30 bg-emerald-500/5 p-5">
      <CardContent className="space-y-3 px-0">
        <div className="flex items-center gap-2">
          <Award className="size-5 text-emerald-600 dark:text-emerald-400" />
          <h2 className="text-xl font-semibold">Hidden gem: {g.name}</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr]">
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {g.metric}
            </div>
            <div className="text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {g.value}
            </div>
          </div>
          <p className="text-sm leading-relaxed">{g.whyImportant}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ProofPointCard({ point }: { point: ProofPoint }) {
  return (
    <Card className="p-5">
      <CardContent className="space-y-3 px-0">
        <h3 className="text-base font-semibold leading-snug">{point.titleTh}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {point.descriptionTh}
        </p>
        <div className="rounded-md bg-muted/40 px-3 py-2 text-xs font-medium tabular-nums">
          {point.metricDisplay}
        </div>
      </CardContent>
    </Card>
  );
}
