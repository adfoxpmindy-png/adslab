import Link from "next/link";
import {
  Bot,
  Compass,
  Eye,
  Layers,
  type LucideIcon,
  PenLine,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";

import { requireTenantMember } from "@/lib/auth/tenant";
import { SetPageTitle } from "@/components/tenant/topbar-page-title";
import { SectionHeader } from "@/components/ui-system";

type Tool = {
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  tint: string;
};

export default async function ToolsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  await requireTenantMember(tenantSlug);

  const tools: Tool[] = [
    {
      label: "AI Master",
      description: "ผู้ช่วย AI แชทตอบเรื่อง campaign + ทำคำสั่ง pause/scale ได้",
      href: `/t/${tenantSlug}/ai`,
      icon: Bot,
      tint: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300",
    },
    {
      label: "Customer Journey",
      description: "แผนที่เกาะลอยแสดงเส้นทางลูกค้า จาก ad → page → conversion",
      href: `/t/${tenantSlug}/journey`,
      icon: Compass,
      tint: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300",
    },
    {
      label: "Competitor Spy",
      description: "ติดตามและวิเคราะห์โฆษณาคู่แข่งในอุตสาหกรรมของคุณ",
      href: `/t/${tenantSlug}/competitors`,
      icon: Eye,
      tint: "bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300",
    },
    {
      label: "Event Tracking SDK",
      description: "Pixel + CAPI events tracking — ติดตั้งบนเว็บลูกค้าได้เลย",
      href: `/t/${tenantSlug}/events`,
      icon: Zap,
      tint: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300",
    },
    {
      label: "Custom Conversions",
      description: "สร้าง custom event + conversion rules บน Meta โดยตรง",
      href: `/t/${tenantSlug}/audiences`,
      icon: Target,
      tint: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300",
    },
    {
      label: "Naming Templates",
      description: "Template สำหรับ campaign/ad set name + AI auto-suggest",
      href: `/t/${tenantSlug}/goals/naming`,
      icon: PenLine,
      tint: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300",
    },
    {
      label: "Goals",
      description: "ตั้งเป้าหมาย KPI ของแต่ละ campaign + AI ประเมินผล",
      href: `/t/${tenantSlug}/goals`,
      icon: Sparkles,
      tint: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300",
    },
    {
      label: "AI Optimize",
      description: "AI วิเคราะห์ + แนะนำการปรับปรุงแคมเปญแบบเรียลไทม์",
      href: `/t/${tenantSlug}/ai-optimize`,
      icon: Layers,
      tint: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300",
    },
  ];

  return (
    <>
      <SetPageTitle title="เครื่องมือ" subtitle="รวมเครื่องมือ AI + tools ขั้นสูงทั้งหมด" />
      <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-6">
        <SectionHeader title="เครื่องมือทั้งหมด" subtitle={`${tools.length} tools`} />

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tools.map((t) => {
            const Icon = t.icon;
            return (
              <Link
                key={t.label}
                href={t.href}
                className="group rounded-2xl border border-border bg-card p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-card-hover"
              >
                <div className={`flex size-11 items-center justify-center rounded-xl ${t.tint}`}>
                  <Icon className="size-5" />
                </div>
                <p className="mt-4 text-sm font-semibold">{t.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.description}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
