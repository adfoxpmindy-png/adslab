/**
 * BaanYen sales-evidence pitch page.
 *
 * Public, unauthenticated Server Component that renders a 30-day audit of
 * the BaanYen Cool Shield Meta ad account (act_850301510936600). All numbers
 * are real — pulled by scripts/analyze-baanyen-30d.ts and frozen into
 * src/lib/pitch/baanyen.ts + src/lib/pitch/baanyen-charts.ts.
 *
 * This page is intentionally static so it can be shared as a URL with the
 * prospect and does not depend on live API access.
 *
 * Route: /pitch/baanyen  (outside [locale], outside auth, outside tenant scope)
 */
import {
  AlertCircle,
  Award,
  CircleDollarSign,
  MapPin,
  PlayCircle,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";

import { AgeCtrBarChart } from "@/components/pitch/AgeCtrBarChart";
import { GenderCpeBars } from "@/components/pitch/GenderCpeBars";
import { ImpactByFindingBarChart } from "@/components/pitch/ImpactByFindingBarChart";
import { PlatformComparisonBars } from "@/components/pitch/PlatformComparisonBars";
import { RegionDonutChart } from "@/components/pitch/RegionDonutChart";
import { VideoFunnelBars } from "@/components/pitch/VideoFunnelBars";
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
  const sortedFindings = [...BAANYEN_FINDINGS].sort(
    (a, b) => b.projectedImpactThb - a.projectedImpactThb,
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-10 sm:px-6">
      {/* ============================================================
          Section 1 — HERO
          ============================================================ */}
      <header className="space-y-6">
        <div className="grid gap-6 md:grid-cols-[1.4fr_1fr] md:items-end">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
              หลักฐาน 30 วัน · BaanYen Cool Shield
            </p>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl md:text-5xl">
              AdsLab ประหยัดงบให้คุณ{" "}
              <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">
                {fmtThb(BAANYEN_TOTAL_PROJECTED_IMPACT_THB)}
              </span>{" "}
              / เดือน
            </h1>
            <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
              เราสแกนบัญชี Meta ของคุณย้อนหลัง 30 วัน เจอ 10 จุดที่ Ads Manager ไม่ flag ให้ —
              แต่ละจุดคำนวณเป็นตัวเลขบาทที่กู้กลับได้จริง ไม่ใช่ %.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 md:items-end">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/5 px-3 py-1 text-xs font-medium ring-1 ring-foreground/10">
              <Sparkles className="size-3.5" />
              Meta Ads · 30 วัน
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {s.accountId}
            </span>
            <span className="text-xs text-muted-foreground">
              {s.since} → {s.until}
            </span>
          </div>
        </div>

        {/* 4-tile row */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <HeroTile
            label="Total spend"
            value={fmtThb(s.totalSpendThb)}
            sub={`${s.campaignsCount} campaigns`}
            tone="neutral"
          />
          <HeroTile
            label="Total reach"
            value={fmtInt(s.totalReach)}
            sub={`${fmtInt(s.totalImpressions)} impressions`}
            tone="neutral"
          />
          <HeroTile
            label="Findings"
            value={`${BAANYEN_FINDINGS.length}`}
            sub={`${highSeverityCount} high · ${findingsWithImpact} มีผลกระทบ`}
            tone="neutral"
          />
          <HeroTile
            label="Projected savings / เดือน"
            value={fmtThb(BAANYEN_TOTAL_PROJECTED_IMPACT_THB)}
            sub="งบที่กู้กลับได้"
            tone="good"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          CTR เฉลี่ย {s.ctrAvg.toFixed(2)}% · CPM เฉลี่ย {fmtThb(s.cpmAvg)} ·
          Engagement {fmtInt(s.totalEngagement)} · Messages {fmtInt(s.totalMessages)}
        </p>
      </header>

      {/* ============================================================
          Section 2 — CHARTS ROW (3 columns)
          ============================================================ */}
      <section aria-labelledby="charts-heading" className="space-y-4">
        <div className="space-y-1">
          <h2
            id="charts-heading"
            className="flex items-center gap-2 text-2xl font-semibold tracking-tight"
          >
            <Target className="size-5" />
            ภาพรวมทันที
          </h2>
          <p className="text-sm text-muted-foreground">
            3 กราฟที่ตอบคำถาม: กลุ่มไหน CTR ดีสุด · แก้จุดไหนได้บาทมากสุด · งบไปที่ภาคไหน
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <ChartCard
            title="CTR ตามอายุ"
            subtitle="กลุ่ม 65+ CTR สูงกว่าค่าเฉลี่ย 1.6×"
            icon={<TrendingUp className="size-4 text-emerald-600 dark:text-emerald-400" />}
          >
            <AgeCtrBarChart />
          </ChartCard>
          <ChartCard
            title="Impact / เดือน แยกตาม Finding"
            subtitle="จัดลำดับจุดที่ให้ผลตอบแทนมากสุด"
            icon={<CircleDollarSign className="size-4 text-emerald-600 dark:text-emerald-400" />}
          >
            <ImpactByFindingBarChart />
          </ChartCard>
          <ChartCard
            title="Spend allocation ตามภาค"
            subtitle="Bangkok กิน 73% · Chiang Mai underserved"
            icon={<MapPin className="size-4 text-emerald-600 dark:text-emerald-400" />}
          >
            <RegionDonutChart />
          </ChartCard>
        </div>
      </section>

      {/* ============================================================
          Section 3 — FB vs IG
          ============================================================ */}
      <Card className="p-6">
        <CardContent className="space-y-5 px-0">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <TrendingDown className="size-5 text-rose-500" />
                Facebook vs Instagram
              </h2>
              <p className="text-sm text-muted-foreground">
                IG placement เผาเงินเปล่า — CTR ต่ำกว่า FB 2.6× และ CPE แพงกว่า 70%
              </p>
            </div>
            <span className="hidden shrink-0 items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-rose-600 ring-1 ring-rose-500/30 sm:inline-flex">
              Finding A2
            </span>
          </div>
          <PlatformComparisonBars />
          <div className="rounded-lg bg-emerald-500/10 p-4 text-sm text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300">
            <span className="font-semibold">Action:</span> IG spend ฿849 (4.4% ของงบ) — ตัดออก
            แล้วย้ายไป FB ที่ CPE ต่ำกว่า → เพิ่ม fresh eyeballs ~1,300 คน/เดือน
          </div>
        </CardContent>
      </Card>

      {/* ============================================================
          Section 4 — Gender allocation
          ============================================================ */}
      <Card className="p-6">
        <CardContent className="space-y-5 px-0">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <Users className="size-5" />
                การจัดสรรงบระหว่างเพศ
              </h2>
              <p className="text-sm text-muted-foreground">
                งบ 50/50 แต่ Male ได้ engagement มากกว่า 45% ในราคาเท่ากัน (CPE ฿0.75 vs ฿1.09)
              </p>
            </div>
            <span className="hidden shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-amber-500/30 sm:inline-flex">
              Finding A6
            </span>
          </div>
          <GenderCpeBars />
          <div className="rounded-lg bg-emerald-500/10 p-4 text-sm text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300">
            <span className="font-semibold">Action:</span> shift งบไปทาง Male 60/40 →
            projected saving ฿2,900 / เดือน (ยังคงคุณภาพ audience ทั้งสองเพศ)
          </div>
        </CardContent>
      </Card>

      {/* ============================================================
          Section 5 — HIDDEN GEM (age 65+)
          ============================================================ */}
      <Card className="border-emerald-500/40 bg-emerald-500/5 p-6">
        <CardContent className="space-y-5 px-0">
          <div className="flex items-center gap-2">
            <Award className="size-5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-xl font-semibold">
              Hidden gem: {BAANYEN_HIDDEN_GEM.name}
            </h2>
            <span className="ml-auto hidden items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-500/40 sm:inline-flex">
              Finding A3
            </span>
          </div>
          <div className="grid gap-6 md:grid-cols-[1.1fr_1fr] md:items-start">
            <div className="space-y-4">
              <div className="rounded-xl bg-white/60 p-5 ring-1 ring-emerald-500/20 dark:bg-emerald-950/30">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                  CTR ของกลุ่ม 65+
                </div>
                <div className="mt-1 flex items-baseline gap-3">
                  <span className="text-4xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    7.89%
                  </span>
                  <span className="text-sm text-muted-foreground">
                    บัญชีเฉลี่ย 4.86%
                  </span>
                </div>
                <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                  1.6× ของค่าเฉลี่ยบัญชี
                </div>
              </div>
              <ul className="space-y-2 text-sm">
                <li className="flex gap-2">
                  <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-emerald-500" />
                  <span>
                    Message rate ดีที่สุด: <span className="tabular-nums font-medium">1 msg / ฿17</span> (บัญชีเฉลี่ย 1 msg / ฿28)
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-emerald-500" />
                  <span>
                    ได้งบเพียง <span className="tabular-nums font-medium">8.9%</span> ของงบทั้งหมด — Meta Auto-placement ยังไม่กระจายมา
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-emerald-500" />
                  <span>
                    ถ้าเพิ่มงบเป็น 15% → projected impact <span className="tabular-nums font-medium">฿1,700 / เดือน</span>
                  </span>
                </li>
              </ul>
            </div>
            <div className="rounded-xl bg-white/60 p-4 ring-1 ring-emerald-500/20 dark:bg-emerald-950/30">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                CTR by age
              </div>
              <AgeCtrBarChart />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ============================================================
          Section 6 — Video funnel
          ============================================================ */}
      <Card className="p-6">
        <CardContent className="space-y-5 px-0">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <PlayCircle className="size-5" />
                Video funnel: hook ดี แต่ hold ต่ำ
              </h2>
              <p className="text-sm text-muted-foreground">
                คน scroll ผ่านหลัง 3 วิ — 86% ไม่ดูจนจบ ThruPlay
              </p>
            </div>
            <span className="hidden shrink-0 items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-rose-600 ring-1 ring-rose-500/30 sm:inline-flex">
              Finding A9
            </span>
          </div>
          <VideoFunnelBars />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-emerald-500/10 p-4 text-sm text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300">
              <div className="text-[10px] font-semibold uppercase tracking-wide">
                Hook rate
              </div>
              <div className="text-2xl font-semibold tabular-nums">93%</div>
              <div className="text-xs">ดีมาก — คนหยุดดู 3 วิแรก</div>
            </div>
            <div className="rounded-lg bg-amber-500/10 p-4 text-sm text-amber-700 ring-1 ring-amber-500/20 dark:text-amber-300">
              <div className="text-[10px] font-semibold uppercase tracking-wide">
                Hold rate
              </div>
              <div className="text-2xl font-semibold tabular-nums">14%</div>
              <div className="text-xs">ต่ำกว่า benchmark F&B 20-25%</div>
            </div>
          </div>
          <div className="rounded-lg bg-emerald-500/10 p-4 text-sm text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300">
            <span className="font-semibold">Action:</span> ตัดวิดีโอสั้นลงหลังวินาที 3-8
            หรือย้าย hook line ให้ยาวขึ้น → projected impact ฿2,900 / เดือน
          </div>
        </CardContent>
      </Card>

      {/* ============================================================
          Section 7 — 10 Findings grid
          ============================================================ */}
      <section aria-labelledby="findings-heading" className="space-y-4">
        <div className="space-y-1">
          <h2
            id="findings-heading"
            className="flex items-center gap-2 text-2xl font-semibold tracking-tight"
          >
            <AlertCircle className="size-5" />
            10 จุดที่ AdsLab เจอในบัญชี BaanYen
          </h2>
          <p className="text-sm text-muted-foreground">
            เรียงตาม projected impact จากมากไปน้อย — high severity คือจุดที่ควรแก้ก่อน
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {sortedFindings.map((f) => (
            <FindingCard key={f.code} finding={f} />
          ))}
        </div>
      </section>

      {/* ============================================================
          Section 8 — Solution flow
          ============================================================ */}
      <Card className="border-foreground/20 bg-foreground/5 p-6">
        <CardContent className="space-y-5 px-0">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Sparkles className="size-5" />
            AdsLab ทำงานยังไง
          </h2>
          <div className="grid gap-3 sm:grid-cols-5">
            {[
              { step: "1", label: "Ingest", desc: "ดึงข้อมูล Meta API ทุก 6 ชม." },
              { step: "2", label: "Detect", desc: "สแกน 10 ประเภทปัญหา" },
              { step: "3", label: "Quantify", desc: "คำนวณเป็น ฿ ต่อเดือน" },
              { step: "4", label: "Explain", desc: "อธิบายเป็นภาษาที่เจ้าของอ่านได้" },
              { step: "5", label: "Recommend", desc: "action ที่กดทำได้ทันที" },
            ].map((s) => (
              <div
                key={s.step}
                className="rounded-lg bg-background p-3 text-center ring-1 ring-foreground/10"
              >
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Step {s.step}
                </div>
                <div className="mt-1 text-sm font-semibold">{s.label}</div>
                <div className="mt-1 text-[11px] leading-tight text-muted-foreground">
                  {s.desc}
                </div>
              </div>
            ))}
          </div>
          <p className="text-sm leading-relaxed">{BAANYEN_COPY.solutionSection}</p>
        </CardContent>
      </Card>

      {/* ============================================================
          Section 9 — Proof strip
          ============================================================ */}
      <section aria-labelledby="proof-heading" className="space-y-4">
        <h2
          id="proof-heading"
          className="flex items-center gap-2 text-2xl font-semibold tracking-tight"
        >
          <CircleDollarSign className="size-5" />
          ทำไมต้อง AdsLab
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ProofStrip
            metric="10"
            label="findings"
            desc="ที่ Ads Manager ไม่ flag ให้ในบัญชี BaanYen"
          />
          <ProofStrip
            metric={fmtThb(BAANYEN_TOTAL_PROJECTED_IMPACT_THB)}
            label="/ เดือน"
            desc="คำนวณจริงจาก 30 วัน — ไม่ใช่ประมาณการ"
          />
          <ProofStrip
            metric="ทุก 6 ชม."
            label="auto-update"
            desc="ระบบสแกนบัญชีอัตโนมัติ ไม่ต้องรอรายงาน"
          />
          <ProofStrip
            metric="14 วัน"
            label="ทดลองใช้"
            desc="ไม่ผูกมัด ยกเลิกได้ทุกเดือน"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {BAANYEN_PROOF_POINTS.map((p) => (
            <Card key={p.titleTh} className="p-5">
              <CardContent className="space-y-3 px-0">
                <h3 className="text-base font-semibold leading-snug">
                  {p.titleTh}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {p.descriptionTh}
                </p>
                <div className="rounded-md bg-muted/40 px-3 py-2 text-xs font-medium tabular-nums">
                  {p.metricDisplay}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ============================================================
          Section 10 — Final CTA
          ============================================================ */}
      <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-transparent p-8">
        <CardContent className="space-y-5 px-0">
          <div className="flex items-center gap-2">
            <Award className="size-5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-2xl font-semibold tracking-tight">
              เริ่มกู้งบกลับใน 14 วัน
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed">
            {BAANYEN_COPY.finalCta}
          </p>
          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center">
            <span className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700">
              <Sparkles className="size-4" />
              เริ่มทดลอง 14 วัน
            </span>
            <span className="inline-flex items-center justify-center gap-2 rounded-lg bg-foreground/5 px-5 py-2.5 text-sm font-semibold ring-1 ring-foreground/15">
              ดู Demo
            </span>
            <span className="text-xs text-muted-foreground">
              ราคาเริ่ม ฿990 / เดือน · ไม่ผูกมัดรายปี
            </span>
          </div>
        </CardContent>
      </Card>

      <footer className="border-t border-foreground/10 pt-4 text-center text-xs text-muted-foreground">
        รายงานฉบับนี้อ้างอิงข้อมูลจริงจาก Meta Marketing API v23.0 ·
        ดึงข้อมูล {s.since} → {s.until} · account {s.accountId}
      </footer>
    </div>
  );
}

/* ----------------------------- Sub-components ----------------------------- */

type Tone = "good" | "bad" | "neutral";

function toneTextClass(tone: Tone): string {
  return tone === "good"
    ? "text-emerald-600 dark:text-emerald-400"
    : tone === "bad"
      ? "text-rose-600 dark:text-rose-400"
      : "text-foreground";
}

function HeroTile({
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
    <div
      className={cn(
        "rounded-xl p-4 ring-1",
        tone === "good"
          ? "bg-emerald-500/10 ring-emerald-500/30"
          : "bg-card ring-foreground/10",
      )}
    >
      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        <span
          className={cn(
            "text-2xl font-semibold tabular-nums leading-tight",
            toneTextClass(tone),
          )}
        >
          {value}
        </span>
        <span className="text-[11px] text-muted-foreground">{sub}</span>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <CardContent className="space-y-3 px-0">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {icon}
            <h3 className="text-sm font-semibold uppercase tracking-wide">
              {title}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function ProofStrip({
  metric,
  label,
  desc,
}: {
  metric: string;
  label: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
          {metric}
        </span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
    </div>
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
    <Card className={cn("p-5", hasImpact && "ring-emerald-500/20")}>
      <CardContent className="space-y-3 px-0">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
                {finding.code}
              </span>
              <SeverityBadge severity={finding.severity} />
            </div>
            <h3 className="text-base font-semibold leading-snug">
              {finding.title}
            </h3>
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
                "text-xl font-semibold tabular-nums",
                hasImpact
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-muted-foreground",
              )}
            >
              {hasImpact ? fmtThb(finding.projectedImpactThb) : "—"}
            </div>
          </div>
        </div>

        <div className="space-y-1.5 rounded-md bg-muted/30 p-3 text-xs leading-relaxed">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            สภาพปัจจุบัน
          </div>
          <p>{finding.currentValue}</p>
        </div>

        <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
          <div className="text-[10px] uppercase tracking-wide">
            AdsLab หาเจอได้ยังไง
          </div>
          <p>{finding.howAdsLabFindsIt}</p>
        </div>
      </CardContent>
    </Card>
  );
}
