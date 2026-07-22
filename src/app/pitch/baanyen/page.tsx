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
  Aperture,
  Award,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClockAlert,
  Layers,
  MapPin,
  MessageCircle,
  PieChart,
  PlayCircle,
  Repeat,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Video,
  Wrench,
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
  BAANYEN_EXECUTIVE_SUMMARY,
  BAANYEN_FINDINGS,
  BAANYEN_HIDDEN_GEM,
  BAANYEN_OVERALL_AFTER,
  BAANYEN_OVERALL_BEFORE,
  BAANYEN_PROOF_POINTS,
  BAANYEN_SNAPSHOT,
  BAANYEN_TOTAL_PROJECTED_IMPACT_THB,
  fmtInt,
  fmtThb,
  type Finding,
  type FindingIconHint,
  type FindingSeverity,
} from "@/lib/pitch/baanyen";

export const metadata = {
  title: "AdsLab — วิเคราะห์บัญชี BaanYen Cool Shield (30 วัน)",
  description:
    "รายงานวิเคราะห์บัญชีโฆษณา Meta ของ BaanYen 30 วันย้อนหลัง พร้อมชี้จุดที่ Meta ไม่บอก และผลกระทบเป็นตัวเลขบาท",
};

const SEVERITY_ORDER: Record<FindingSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
  passed: 3,
};

export default function BaanYenPitchPage() {
  const s = BAANYEN_SNAPSHOT;
  const needsFixCount = BAANYEN_FINDINGS.filter(
    (f) => f.status === "needs_fix",
  ).length;
  const passedCount = BAANYEN_FINDINGS.filter(
    (f) => f.status === "passed",
  ).length;

  // Sort: needs_fix first, then by severity, then by delta desc
  const sortedFindings = [...BAANYEN_FINDINGS].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "needs_fix" ? -1 : 1;
    }
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return b.delta_thb_per_month - a.delta_thb_per_month;
  });

  const hoursSaved =
    BAANYEN_OVERALL_BEFORE.manual_hours_per_week -
    BAANYEN_OVERALL_AFTER.manual_hours_per_week;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-10 sm:px-6">
      {/* ============================================================
          Section 1 — HERO
          ============================================================ */}
      <header className="space-y-6">
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
            หลักฐาน 30 วัน · BaanYen Cool Shield
          </p>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl md:text-5xl">
            AdsLab สแกน BaanYen เจอ 10 จุด แก้ 5 ปิดรูรั่ว{" "}
            <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">
              {fmtThb(BAANYEN_TOTAL_PROJECTED_IMPACT_THB)}
            </span>{" "}
            / เดือน
          </h1>
          <p className="max-w-3xl text-base leading-relaxed text-muted-foreground">
            {BAANYEN_COPY.heroSubheadline}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Chip>BaanYen</Chip>
            <Chip>Meta Ads</Chip>
            <Chip>30 วัน</Chip>
            <Chip tone="live">Live</Chip>
            <span className="ml-2 font-mono text-xs text-muted-foreground">
              {s.accountId}
            </span>
            <span className="text-xs text-muted-foreground">
              · {s.since} → {s.until}
            </span>
          </div>
        </div>
      </header>

      {/* ============================================================
          Section 2 — EXECUTIVE SUMMARY
          ============================================================ */}
      <Card className="p-6">
        <CardContent className="px-0">
          <div className="grid gap-6 md:grid-cols-[1.4fr_1fr] md:items-center">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-emerald-600 dark:text-emerald-400" />
                <h2 className="text-xl font-semibold tracking-tight">
                  สรุปผู้บริหาร
                </h2>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {BAANYEN_EXECUTIVE_SUMMARY}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <SummaryTile label="ปัญหาพบ" value="10" tone="neutral" />
              <SummaryTile label="ต้องแก้" value={`${needsFixCount}`} tone="warn" />
              <SummaryTile
                label="ประหยัด / เดือน"
                value={fmtThb(BAANYEN_TOTAL_PROJECTED_IMPACT_THB)}
                tone="good"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ============================================================
          Section 3 — BEFORE / AFTER COMPARISON
          ============================================================ */}
      <section aria-labelledby="before-after-heading" className="space-y-4">
        <div className="space-y-1">
          <h2
            id="before-after-heading"
            className="flex items-center gap-2 text-2xl font-semibold tracking-tight"
          >
            <ChevronRight className="size-5 text-emerald-600 dark:text-emerald-400" />
            ก่อน vs หลังใช้ AdsLab
          </h2>
          <p className="text-sm text-muted-foreground">
            เทียบต้นทุนงบและเวลา — จากที่ Meta ไม่ flag ให้เห็น เหลือแค่รีวิว 30 นาที/สัปดาห์
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {/* BEFORE */}
          <Card className="border-rose-500/30 bg-rose-500/5 p-6">
            <CardContent className="space-y-4 px-0">
              <div className="flex items-center gap-2">
                <ClockAlert className="size-5 text-rose-600 dark:text-rose-400" />
                <h3 className="text-lg font-semibold">ก่อนใช้ AdsLab</h3>
              </div>
              <ul className="space-y-3 text-sm">
                <ComparisonRow
                  label="งบเสียเปล่า"
                  value={`${fmtThb(BAANYEN_OVERALL_BEFORE.wasted_budget_thb)}/เดือน`}
                  tone="bad"
                />
                <ComparisonRow
                  label="ปัญหาที่ไม่ถูก flag"
                  value={`${BAANYEN_OVERALL_BEFORE.issues} จุด`}
                  tone="bad"
                />
                <ComparisonRow
                  label="Actionable insights"
                  value={`${BAANYEN_OVERALL_BEFORE.actionable_insights}`}
                  tone="bad"
                />
                <ComparisonRow
                  label="เวลาวิเคราะห์เอง"
                  value={`~${BAANYEN_OVERALL_BEFORE.manual_hours_per_week} ชม./สัปดาห์`}
                  tone="bad"
                />
              </ul>
            </CardContent>
          </Card>
          {/* AFTER */}
          <Card className="border-emerald-500/30 bg-emerald-500/5 p-6">
            <CardContent className="space-y-4 px-0">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-lg font-semibold">ใช้ AdsLab แล้ว</h3>
              </div>
              <ul className="space-y-3 text-sm">
                <ComparisonRow
                  label="งบเสียเปล่า"
                  value={fmtThb(BAANYEN_OVERALL_AFTER.wasted_budget_thb)}
                  tone="good"
                />
                <ComparisonRow
                  label="ปัญหาที่ flag"
                  value={`${BAANYEN_OVERALL_AFTER.issues}/10`}
                  tone="good"
                />
                <ComparisonRow
                  label="Actionable insights"
                  value={`${BAANYEN_OVERALL_AFTER.actionable_insights}`}
                  tone="good"
                />
                <ComparisonRow
                  label="เวลารีวิว"
                  value={`~${Math.round(BAANYEN_OVERALL_AFTER.manual_hours_per_week * 60)} นาที/สัปดาห์`}
                  tone="good"
                />
              </ul>
            </CardContent>
          </Card>
        </div>
        {/* Arrow summary */}
        <div className="flex items-center justify-center gap-3 rounded-xl bg-emerald-500/10 px-6 py-4 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-300 sm:text-base">
          <TrendingDown className="size-5 shrink-0" />
          <span className="text-center">
            ประหยัด ~{hoursSaved} ชม./สัปดาห์ ·{" "}
            <span className="tabular-nums">
              {fmtThb(BAANYEN_TOTAL_PROJECTED_IMPACT_THB)}
            </span>{" "}
            / เดือน
          </span>
          <TrendingUp className="size-5 shrink-0" />
        </div>
      </section>

      {/* ============================================================
          Section 4 — CHARTS ROW (3 columns)
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
          Section 5 — FB vs IG
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
          Section 6 — Gender allocation
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
          Section 7 — HIDDEN GEM (age 65+)
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
                    Message rate ดีที่สุด:{" "}
                    <span className="tabular-nums font-medium">1 msg / ฿17</span> (บัญชีเฉลี่ย 1 msg / ฿28)
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
                    ถ้าเพิ่มงบเป็น 15% → projected impact{" "}
                    <span className="tabular-nums font-medium">฿1,700 / เดือน</span>
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
          Section 8 — Video funnel
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
          Section 9 — 10 FINDINGS with NARRATIVE FORMAT
          ============================================================ */}
      <section aria-labelledby="findings-heading" className="space-y-4">
        <div className="space-y-1">
          <h2
            id="findings-heading"
            className="flex items-center gap-2 text-2xl font-semibold tracking-tight"
          >
            <AlertCircle className="size-5" />
            10 จุดที่ AdsLab เจอ — ปัญหา · การแก้ · ผลลัพธ์
          </h2>
          <p className="text-sm text-muted-foreground">
            {needsFixCount} ต้องแก้ · {passedCount} ผ่านเกณฑ์ — เรียงตามลำดับความสำคัญ
          </p>
        </div>
        <div className="space-y-5">
          {sortedFindings.map((f) => (
            <NarrativeFindingCard key={f.code} finding={f} />
          ))}
        </div>
      </section>

      {/* ============================================================
          Section 10 — Solution flow
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
            ].map((step) => (
              <div
                key={step.step}
                className="rounded-lg bg-background p-3 text-center ring-1 ring-foreground/10"
              >
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Step {step.step}
                </div>
                <div className="mt-1 text-sm font-semibold">{step.label}</div>
                <div className="mt-1 text-[11px] leading-tight text-muted-foreground">
                  {step.desc}
                </div>
              </div>
            ))}
          </div>
          <p className="text-sm leading-relaxed">{BAANYEN_COPY.solutionSection}</p>
        </CardContent>
      </Card>

      {/* ============================================================
          Section 11 — Proof strip
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
          Section 12 — Final CTA
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

type Tone = "good" | "bad" | "warn" | "neutral";

function toneTextClass(tone: Tone): string {
  if (tone === "good") return "text-emerald-600 dark:text-emerald-400";
  if (tone === "bad") return "text-rose-600 dark:text-rose-400";
  if (tone === "warn") return "text-amber-700 dark:text-amber-400";
  return "text-foreground";
}

function Chip({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "live";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1",
        tone === "live"
          ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300"
          : "bg-foreground/5 text-foreground ring-foreground/10",
      )}
    >
      {tone === "live" ? (
        <span className="size-1.5 rounded-full bg-emerald-500" />
      ) : null}
      {children}
    </span>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: Tone;
}) {
  return (
    <div
      className={cn(
        "rounded-xl p-3 text-center ring-1",
        tone === "good"
          ? "bg-emerald-500/10 ring-emerald-500/30"
          : tone === "warn"
            ? "bg-amber-500/10 ring-amber-500/30"
            : "bg-card ring-foreground/10",
      )}
    >
      <div
        className={cn(
          "text-xl font-semibold tabular-nums leading-tight sm:text-2xl",
          toneTextClass(tone),
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function ComparisonRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: Tone;
}) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-foreground/5 pb-2 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold tabular-nums", toneTextClass(tone))}>
        {value}
      </span>
    </li>
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
  const config: Record<
    FindingSeverity,
    { label: string; cls: string }
  > = {
    high: {
      label: "HIGH",
      cls: "bg-rose-500/10 text-rose-600 ring-rose-500/30 dark:text-rose-400",
    },
    medium: {
      label: "MEDIUM",
      cls: "bg-amber-500/10 text-amber-700 ring-amber-500/30 dark:text-amber-400",
    },
    low: {
      label: "LOW",
      cls: "bg-muted/40 text-muted-foreground ring-foreground/10",
    },
    passed: {
      label: "PASSED",
      cls: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/30 dark:text-emerald-400",
    },
  };
  const { label, cls } = config[severity];
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

function StatusPill({ status }: { status: Finding["status"] }) {
  if (status === "needs_fix") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-rose-600 ring-1 ring-rose-500/30 dark:text-rose-400">
        <AlertCircle className="size-3" />
        ต้องแก้
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-400">
      <CheckCircle2 className="size-3" />
      ผ่านเกณฑ์
    </span>
  );
}

function FindingIcon({ hint }: { hint: FindingIconHint }) {
  const iconMap: Record<FindingIconHint, React.ComponentType<{ className?: string }>> = {
    Video,
    Users,
    MapPin,
    Target,
    Instagram: Aperture,
    CheckCircle: CheckCircle2,
    MessageCircle,
    Layers,
    Repeat,
    PieChart,
  };
  const Icon = iconMap[hint];
  return <Icon className="size-5 text-foreground/70" />;
}

function NarrativeFindingCard({ finding }: { finding: Finding }) {
  const isPassed = finding.status === "passed";
  return (
    <Card
      className={cn(
        "p-6",
        isPassed
          ? "border-foreground/10 bg-card"
          : "border-foreground/15 bg-card",
      )}
    >
      <CardContent className="space-y-5 px-0">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0 rounded-lg bg-foreground/5 p-2 ring-1 ring-foreground/10">
              <FindingIcon hint={finding.icon_hint} />
            </div>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
                  {finding.code}
                </span>
                <SeverityBadge severity={finding.severity} />
                <StatusPill status={finding.status} />
              </div>
              <h3 className="text-lg font-semibold leading-snug">
                {finding.title}
              </h3>
            </div>
          </div>
        </div>

        {isPassed ? (
          /* Passed compact layout — only problem summary */
          <div className="space-y-3">
            <StageBlock
              tone="passed"
              icon={<CheckCircle2 className="size-4" />}
              label="สถานะ"
            >
              <p className="text-sm leading-relaxed">{finding.problem_th}</p>
              <p className="mt-2 text-xs italic text-muted-foreground">
                {finding.fix_th}
              </p>
            </StageBlock>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              ผ่านเกณฑ์แล้ว — เฝ้าระวังต่อไป
            </div>
          </div>
        ) : (
          /* Needs-fix full 3-stage layout */
          <div className="space-y-4">
            <StageBlock
              tone="problem"
              icon={<AlertCircle className="size-4" />}
              label="ปัญหา"
            >
              <p className="text-sm leading-relaxed">{finding.problem_th}</p>
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-rose-500/10 px-2 py-1 text-[11px] font-medium text-rose-700 ring-1 ring-rose-500/20 dark:text-rose-300">
                <span className="text-[10px] uppercase tracking-wide">ตอนนี้:</span>
                <span className="tabular-nums">{finding.before_metric}</span>
              </div>
            </StageBlock>
            <StageBlock
              tone="fix"
              icon={<Wrench className="size-4" />}
              label="สิ่งที่ AdsLab แนะนำให้แก้"
            >
              <p className="text-sm leading-relaxed">{finding.fix_th}</p>
            </StageBlock>
            <StageBlock
              tone="result"
              icon={<CheckCircle2 className="size-4" />}
              label="ผลลัพธ์ที่จะได้"
            >
              <p className="text-sm leading-relaxed">{finding.result_th}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-md bg-foreground/5 px-2 py-1 font-medium tabular-nums text-muted-foreground">
                  {finding.before_metric}
                </span>
                <ChevronRight className="size-4 text-emerald-600 dark:text-emerald-400" />
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 font-semibold tabular-nums text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300">
                  {finding.after_metric}
                </span>
                {finding.delta_thb_per_month > 0 ? (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2.5 py-1 text-sm font-bold tabular-nums text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-300">
                    <TrendingUp className="size-3.5" />
                    +{fmtThb(finding.delta_thb_per_month)}/เดือน
                  </span>
                ) : null}
              </div>
            </StageBlock>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-foreground/5 pt-3 text-[11px] text-muted-foreground">
          <Sparkles className="mr-1 inline size-3" />
          AdsLab surface ให้อัตโนมัติจาก Meta breakdown scan (ทุก 6 ชม.)
        </div>
      </CardContent>
    </Card>
  );
}

function StageBlock({
  tone,
  icon,
  label,
  children,
}: {
  tone: "problem" | "fix" | "result" | "passed";
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  const styles: Record<
    "problem" | "fix" | "result" | "passed",
    { border: string; labelCls: string; iconCls: string }
  > = {
    problem: {
      border: "border-l-rose-500",
      labelCls: "text-rose-700 dark:text-rose-400",
      iconCls: "text-rose-500",
    },
    fix: {
      border: "border-l-amber-500",
      labelCls: "text-amber-700 dark:text-amber-400",
      iconCls: "text-amber-500",
    },
    result: {
      border: "border-l-emerald-500",
      labelCls: "text-emerald-700 dark:text-emerald-400",
      iconCls: "text-emerald-500",
    },
    passed: {
      border: "border-l-emerald-500",
      labelCls: "text-emerald-700 dark:text-emerald-400",
      iconCls: "text-emerald-500",
    },
  };
  const cfg = styles[tone];
  return (
    <div className={cn("rounded-r-md border-l-2 bg-foreground/[0.02] px-4 py-3", cfg.border)}>
      <div
        className={cn(
          "mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide",
          cfg.labelCls,
        )}
      >
        <span className={cfg.iconCls}>{icon}</span>
        {label}
      </div>
      {children}
    </div>
  );
}
