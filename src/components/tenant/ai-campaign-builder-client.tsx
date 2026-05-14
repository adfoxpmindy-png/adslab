"use client";

import { useState } from "react";
import {
  Check,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
  Megaphone,
  Settings2,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brandButton, EmptyState } from "@/components/ui-system";
import { cn } from "@/lib/utils";
import type { CampaignPlanResponse } from "@/app/api/ai/campaign-plan/route";

type Step = 1 | 2 | 3;

type Form = {
  product: string;
  websiteUrl: string;
  objective: "awareness" | "traffic" | "engagement" | "leads" | "conversions" | "sales";
  dailyBudgetThb: number;
  durationDays: number;
  features: string[];
  message: string;
  primaryAudience: string;
  secondaryAudience: string;
  placements: { facebook: boolean; instagram: boolean; tiktok: boolean; audienceNetwork: boolean };
  language: "th" | "en" | "mixed";
};

const STEPS = [
  { num: 1, label: "ตั้งค่าแคมเปญ" },
  { num: 2, label: "AI สร้างแผน" },
  { num: 3, label: "ตรวจสอบและเผยแพร่" },
] as const;

const OBJECTIVE_OPTIONS = [
  { value: "awareness", label: "Awareness" },
  { value: "traffic", label: "Traffic" },
  { value: "engagement", label: "Engagement" },
  { value: "leads", label: "Leads" },
  { value: "conversions", label: "Conversions" },
  { value: "sales", label: "Sales" },
] as const;

export function AICampaignBuilderClient({ tenantSlug }: { tenantSlug: string }) {
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<Form>({
    product: "",
    websiteUrl: "",
    objective: "conversions",
    dailyBudgetThb: 1000,
    durationDays: 7,
    features: [],
    message: "",
    primaryAudience: "",
    secondaryAudience: "",
    placements: { facebook: true, instagram: true, tiktok: false, audienceNetwork: false },
    language: "th",
  });
  const [plan, setPlan] = useState<CampaignPlanResponse | null>(null);
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    if (form.product.trim().length < 3) {
      toast.error("กรอกข้อมูลสินค้าก่อนสร้างแผน");
      return;
    }
    setGenerating(true);
    setStep(2);
    try {
      const res = await fetch("/api/ai/campaign-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantSlug, ...form }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message ?? "AI สร้างแผนไม่สำเร็จ");
        setStep(1);
        return;
      }
      setPlan(data.plan);
      toast.success("AI สร้างแผนแคมเปญสำเร็จ");
    } catch (err) {
      toast.error((err as Error).message);
      setStep(1);
    } finally {
      setGenerating(false);
    }
  }

  function handleSaveCampaign() {
    setStep(3);
    toast.success("บันทึกแล้ว — กำลังสร้างแคมเปญใน Meta...");
    // TODO Phase B-4.5: wire to /api/meta/campaigns/create with the plan structure
    // For now, redirect to existing manual builder pre-filled with form data.
    setTimeout(() => {
      window.location.href = `/t/${tenantSlug}/campaigns/new?prefill=${encodeURIComponent(JSON.stringify({ name: plan?.campaignName ?? form.product, objective: form.objective }))}`;
    }, 1500);
  }

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-6">
      {/* Step indicator */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-6 py-4 shadow-card">
        <div className="flex items-center gap-4 sm:gap-8">
          {STEPS.map((s, i) => {
            const isActive = step === s.num;
            const isDone = step > s.num;
            return (
              <div key={s.num} className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full text-xs font-semibold transition-all",
                    isDone
                      ? "bg-success text-white"
                      : isActive
                        ? "bg-brand-gradient text-white shadow-card"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {isDone ? <Check className="size-3.5" /> : s.num}
                </div>
                <span
                  className={cn(
                    "text-xs font-medium",
                    isActive ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <ChevronRight className="ml-2 size-4 text-muted-foreground" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: form */}
        <BuilderForm
          form={form}
          onChange={setForm}
          onGenerate={handleGenerate}
          generating={generating}
        />

        {/* Right: AI plan preview */}
        <PlanPreview plan={plan} generating={generating} onSave={handleSaveCampaign} />
      </div>
    </div>
  );
}

// =============================================================================
// Left form
// =============================================================================

function BuilderForm({
  form,
  onChange,
  onGenerate,
  generating,
}: {
  form: Form;
  onChange: (f: Form) => void;
  onGenerate: () => void;
  generating: boolean;
}) {
  const [tagInput, setTagInput] = useState("");

  function addFeature(text: string) {
    const t = text.trim();
    if (!t || form.features.includes(t)) return;
    onChange({ ...form, features: [...form.features, t] });
    setTagInput("");
  }

  function removeFeature(tag: string) {
    onChange({ ...form, features: form.features.filter((f) => f !== tag) });
  }

  return (
    <div className="space-y-5">
      {/* Section 1: Business */}
      <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-card">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
            <Sparkles className="size-4" />
          </div>
          <h2 className="text-base font-semibold">บอก AI เกี่ยวกับธุรกิจของคุณ</h2>
        </div>

        <FieldWithCount
          id="product"
          label="คุณกำลังขายอะไร?"
          required
          max={500}
          value={form.product}
          onChange={(v) => onChange({ ...form, product: v })}
          placeholder="เช่น ครีมกันแดดหน้าใส SPF50 PA+++"
          textarea
        />

        <div>
          <Label htmlFor="websiteUrl">ลิงก์เว็บไซต์ / สินค้า</Label>
          <Input
            id="websiteUrl"
            value={form.websiteUrl}
            onChange={(e) => onChange({ ...form, websiteUrl: e.target.value })}
            placeholder="https://yourbrand.com/sunscreen"
          />
        </div>

        <div>
          <Label htmlFor="objective">เป้าหมายแคมเปญ</Label>
          <select
            id="objective"
            value={form.objective}
            onChange={(e) => onChange({ ...form, objective: e.target.value as Form["objective"] })}
            className="mt-1 flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {OBJECTIVE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="dailyBudget">งบประมาณต่อวัน (THB)</Label>
            <Input
              id="dailyBudget"
              type="number"
              value={form.dailyBudgetThb}
              onChange={(e) => onChange({ ...form, dailyBudgetThb: parseInt(e.target.value || "0", 10) })}
              min={50}
              max={1_000_000}
            />
          </div>
          <div>
            <Label htmlFor="duration">ระยะเวลา (วัน)</Label>
            <Input
              id="duration"
              type="number"
              value={form.durationDays}
              onChange={(e) => onChange({ ...form, durationDays: parseInt(e.target.value || "0", 10) })}
              min={1}
              max={90}
            />
          </div>
        </div>

        <FieldWithCount
          id="primaryAudience"
          label="กลุ่มเป้าหมายหลัก"
          max={200}
          value={form.primaryAudience}
          onChange={(v) => onChange({ ...form, primaryAudience: v })}
          placeholder="เช่น ผู้หญิง อายุ 18-34 สนใจสกินแคร์ ความงาม ไลฟ์สไตล์"
          textarea
        />

        <FieldWithCount
          id="secondaryAudience"
          label="กลุ่มเป้าหมายเพิ่มเติม (ไม่บังคับ)"
          max={200}
          value={form.secondaryAudience}
          onChange={(v) => onChange({ ...form, secondaryAudience: v })}
          placeholder="เช่น ผู้ชาย อายุ 20-35 ออกกำลังกาย ดูแลผิว"
          textarea
        />

        <div>
          <Label>ตำแหน่งการแสดงผล</Label>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <PlacementChip
              label="Facebook"
              icon="f"
              color="#1877F2"
              checked={form.placements.facebook}
              onChange={(v) => onChange({ ...form, placements: { ...form.placements, facebook: v } })}
            />
            <PlacementChip
              label="Instagram"
              icon="◉"
              color="#E4405F"
              checked={form.placements.instagram}
              onChange={(v) => onChange({ ...form, placements: { ...form.placements, instagram: v } })}
            />
            <PlacementChip
              label="TikTok"
              icon="♪"
              color="#000"
              checked={form.placements.tiktok}
              onChange={(v) => onChange({ ...form, placements: { ...form.placements, tiktok: v } })}
            />
            <PlacementChip
              label="Audience Network"
              icon="◈"
              color="#4A90E2"
              checked={form.placements.audienceNetwork}
              onChange={(v) => onChange({ ...form, placements: { ...form.placements, audienceNetwork: v } })}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="language">ภาษาที่ใช้</Label>
          <select
            id="language"
            value={form.language}
            onChange={(e) => onChange({ ...form, language: e.target.value as Form["language"] })}
            className="mt-1 flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="th">ภาษาไทย</option>
            <option value="en">English</option>
            <option value="mixed">ผสม (Thai + English)</option>
          </select>
        </div>
      </section>

      {/* Section 2: Additional info */}
      <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-card">
        <div className="flex items-center gap-2">
          <Settings2 className="size-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">ข้อมูลเพิ่มเติม (ไม่บังคับ)</h2>
        </div>

        <div>
          <Label htmlFor="features">จุดเด่นสินค้า</Label>
          <div className="mt-1 flex flex-wrap items-center gap-2 rounded-md border border-input bg-card px-3 py-2 min-h-10">
            {form.features.map((f) => (
              <span
                key={f}
                className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
              >
                {f}
                <button
                  type="button"
                  onClick={() => removeFeature(f)}
                  className="rounded-full p-0.5 hover:bg-violet-100 dark:hover:bg-violet-900/40"
                >
                  <X className="size-2.5" />
                </button>
              </span>
            ))}
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addFeature(tagInput);
                }
              }}
              className="min-w-[120px] flex-1 bg-transparent text-xs focus:outline-none"
              placeholder="พิมพ์แล้วกด Enter"
            />
          </div>
        </div>

        <FieldWithCount
          id="message"
          label="ข้อความที่ต้องการสื่อ"
          max={500}
          value={form.message}
          onChange={(v) => onChange({ ...form, message: v })}
          placeholder="เช่น กันแดดหน้าใส ไม่วอก ไม่มัน กันน้ำ กันเหงื่อ ใช้ได้ทุกวัน"
          textarea
        />
      </section>

      <button
        type="button"
        onClick={onGenerate}
        disabled={generating || form.product.trim().length < 3}
        className={cn(brandButton({ size: "xl" }), "w-full")}
      >
        {generating ? (
          <>
            <Loader2 className="size-5 animate-spin" /> AI กำลังสร้างแผน...
          </>
        ) : (
          <>
            <Sparkles className="size-5" /> สร้างแผนแคมเปญด้วย AI
          </>
        )}
      </button>
    </div>
  );
}

function PlacementChip({
  label,
  icon,
  color,
  checked,
  onChange,
}: {
  label: string;
  icon: string;
  color: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-all",
        checked
          ? "border-violet-300 bg-violet-50 text-violet-700 shadow-card dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300"
          : "border-border bg-card text-muted-foreground hover:bg-accent",
      )}
    >
      <span style={{ color }} className="text-base font-bold leading-none">
        {icon}
      </span>
      {label}
      {checked && <Check className="ml-auto size-3.5" />}
    </button>
  );
}

function FieldWithCount({
  id,
  label,
  value,
  onChange,
  placeholder,
  max,
  required,
  textarea,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  max: number;
  required?: boolean;
  textarea?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>
          {label} {required && <span className="text-destructive">*</span>}
        </Label>
        <span className="text-[10px] text-muted-foreground">
          {value.length}/{max}
        </span>
      </div>
      {textarea ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, max))}
          placeholder={placeholder}
          rows={3}
          className="mt-1 flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      ) : (
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, max))}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

// =============================================================================
// Right plan preview
// =============================================================================

function PlanPreview({
  plan,
  generating,
  onSave,
}: {
  plan: CampaignPlanResponse | null;
  generating: boolean;
  onSave: () => void;
}) {
  if (generating) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-border bg-card p-12 text-center shadow-card">
        <div className="relative">
          <div className="size-16 rounded-full bg-brand-gradient opacity-50 blur-xl" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Sparkles className="size-8 text-white" />
          </div>
        </div>
        <p className="mt-6 text-base font-semibold">AI กำลังวิเคราะห์...</p>
        <p className="mt-1 text-xs text-muted-foreground">
          กำลังสร้างแคมเปญ + ad sets + creative ที่เหมาะกับธุรกิจของคุณ
        </p>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
          <Sparkles className="size-6" />
        </div>
        <p className="mt-4 text-base font-semibold">รอ AI สร้างแผน</p>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          กรอกข้อมูลธุรกิจของคุณด้านซ้าย แล้วคลิก &ldquo;สร้างแผนแคมเปญด้วย AI&rdquo;
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">AI สร้างแผนแคมเปญให้คุณ</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{plan.campaignName}</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          <Check className="size-3" />
          คาดการณ์ผลลัพธ์
        </span>
      </div>

      {/* Predictions */}
      <div className="grid grid-cols-4 gap-2">
        <PredictCard label="ROAS" value={`${plan.predictions.roas.toFixed(2)}x`} good={plan.predictions.roas >= 3} />
        <PredictCard label="CPA" value={`฿${Math.round(plan.predictions.cpaTHB).toLocaleString()}`} good={plan.predictions.cpaTHB <= 300} />
        <PredictCard label="Conversion" value={plan.predictions.conversions.toString()} good />
        <PredictCard label="ยอดขาย" value={`฿${plan.predictions.salesTHB.toLocaleString()}`} good />
      </div>

      {/* Campaign hierarchy */}
      <div className="rounded-xl border border-border p-4">
        <div className="flex items-center gap-2">
          <Megaphone className="size-4 text-violet-600 dark:text-violet-300" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Campaign
          </span>
          <span className="text-sm font-medium">{plan.campaignName}</span>
        </div>

        <ul className="mt-3 space-y-2 border-l-2 border-dashed border-border pl-4">
          {plan.adSets.map((s, i) => (
            <li key={i} className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Users className="size-3" />
                Ad Set {i + 1}
              </div>
              <p className="mt-1 text-sm font-medium">{s.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{s.audienceDesc}</p>
              {s.interests.length > 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {s.interests.join(", ")}
                </p>
              )}
              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className="rounded-full bg-violet-50 px-2 py-0.5 font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                  ฿{Math.round(s.budgetPercent / 100 * (plan.predictions.salesTHB / plan.predictions.roas / 30))}/วัน ({s.budgetPercent}%)
                </span>
                <span className="text-muted-foreground">
                  ROAS {s.expectedRoas.toFixed(2)}x · CPA ฿{s.expectedCpaTHB}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Creatives grid */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <ImageIcon className="size-4 text-violet-600" />
          <h3 className="text-sm font-semibold">Ads &mdash; รวม {plan.creatives.length} โฆษณา (แนะนำโดย AI)</h3>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {plan.creatives.map((c, i) => {
            const Icon = c.type === "video" ? Video : ImageIcon;
            return (
              <div
                key={i}
                className="rounded-lg border border-border bg-card p-2 transition-all hover:shadow-card-hover"
              >
                <div className="relative aspect-square overflow-hidden rounded-md bg-gradient-to-br from-violet-100 via-pink-100 to-amber-100 dark:from-violet-950/40 dark:via-pink-950/40 dark:to-amber-950/40">
                  {c.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.imageUrl}
                      alt={c.headline}
                      className="absolute inset-0 size-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center text-violet-600 dark:text-violet-300">
                      <Icon className="size-5" />
                      <span className="mt-1 text-[9px] font-medium uppercase">{c.type}</span>
                    </div>
                  )}
                  <span className="absolute top-1 right-1 inline-flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[8px] font-bold uppercase text-white">
                    <Icon className="size-2.5" />
                    {c.type}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-[11px] font-medium leading-snug" title={c.headline}>
                  {c.headline}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  CTR คาด {c.expectedCtr.toFixed(2)}%
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* CTAs */}
      <div className="flex gap-2 border-t border-border pt-4">
        <button type="button" className="flex-1 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent">
          ปรับแต่งแผน
        </button>
        <button
          type="button"
          onClick={onSave}
          className={cn(brandButton({ size: "md" }), "flex-1")}
        >
          บันทึกและสร้างแคมเปญ
        </button>
      </div>
    </div>
  );
}

function PredictCard({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
      {good && (
        <span className="mt-1 inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          <TrendingUp className="size-2.5" />
          ดีมาก
        </span>
      )}
    </div>
  );
}
