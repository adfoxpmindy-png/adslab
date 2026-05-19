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
import { getTranslations } from "next-intl/server";

import { requireTenantMember } from "@/lib/auth/tenant";
import { SetPageTitle } from "@/components/tenant/topbar-page-title";
import { SectionHeader } from "@/components/ui-system";

type ToolKey =
  | "aiMaster"
  | "journey"
  | "competitors"
  | "events"
  | "customConversions"
  | "namingTemplates"
  | "goals"
  | "aiOptimize";

type Tool = {
  key: ToolKey;
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
  const tPages = await getTranslations("pages.tools");
  const tItems = await getTranslations("pages.tools.items");

  const tools: Tool[] = [
    {
      key: "aiMaster",
      href: `/t/${tenantSlug}/ai`,
      icon: Bot,
      tint: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300",
    },
    {
      key: "journey",
      href: `/t/${tenantSlug}/journey`,
      icon: Compass,
      tint: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300",
    },
    {
      key: "competitors",
      href: `/t/${tenantSlug}/competitors`,
      icon: Eye,
      tint: "bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300",
    },
    {
      key: "events",
      href: `/t/${tenantSlug}/events`,
      icon: Zap,
      tint: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300",
    },
    {
      key: "customConversions",
      href: `/t/${tenantSlug}/audiences`,
      icon: Target,
      tint: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300",
    },
    {
      key: "namingTemplates",
      href: `/t/${tenantSlug}/goals/naming`,
      icon: PenLine,
      tint: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300",
    },
    {
      key: "goals",
      href: `/t/${tenantSlug}/goals`,
      icon: Sparkles,
      tint: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300",
    },
    {
      key: "aiOptimize",
      href: `/t/${tenantSlug}/ai-optimize`,
      icon: Layers,
      tint: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300",
    },
  ];

  return (
    <>
      <SetPageTitle title={tPages("title")} subtitle={tPages("subtitle")} />
      <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-6">
        <SectionHeader
          title={tPages("sectionTitle")}
          subtitle={tPages("toolCount", { count: tools.length })}
        />

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => {
            const Icon = tool.icon;
            const label = tItems(`${tool.key}.label`);
            const description = tItems(`${tool.key}.description`);
            return (
              <Link
                key={tool.key}
                href={tool.href}
                className="group rounded-2xl border border-border bg-card p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-card-hover"
              >
                <div className={`flex size-11 items-center justify-center rounded-xl ${tool.tint}`}>
                  <Icon className="size-5" />
                </div>
                <p className="mt-4 text-sm font-semibold">{label}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
