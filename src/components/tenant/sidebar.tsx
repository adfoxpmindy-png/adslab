import Image from "next/image";
import Link from "next/link";
import { Bot, Compass, FileText, LayoutDashboard, Megaphone, Settings, Target, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type SidebarItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

type SidebarProps = {
  tenantSlug: string;
};

/**
 * Top-level nav. Goals folded into Reports' detail surface and the
 * old "Insights (เร็วๆ นี้)" dead link removed. Event Log moved
 * under /audiences as its own tab to keep the top-level list to the
 * actions a daily user does: Dashboard, Reports, Campaigns, Audiences.
 */
export function Sidebar({ tenantSlug }: SidebarProps) {
  const items: SidebarItem[] = [
    { label: "Dashboard", href: `/t/${tenantSlug}/dashboard`, icon: LayoutDashboard },
    { label: "Reports", href: `/t/${tenantSlug}/reports`, icon: FileText },
    { label: "Campaigns", href: `/t/${tenantSlug}/campaigns`, icon: Megaphone },
    { label: "Audiences", href: `/t/${tenantSlug}/audiences`, icon: Users },
    { label: "Journey", href: `/t/${tenantSlug}/journey`, icon: Compass },
    { label: "AI Master", href: `/t/${tenantSlug}/ai`, icon: Bot },
    { label: "Goals", href: `/t/${tenantSlug}/goals`, icon: Target },
    { label: "Settings", href: `/t/${tenantSlug}/settings/integrations`, icon: Settings },
  ];

  return (
    <aside className="hidden border-r border-border bg-background lg:flex lg:w-60 lg:flex-col">
      <div className="flex h-14 items-center border-b border-border px-4">
        <Link
          href={`/t/${tenantSlug}/dashboard`}
          className="flex items-center"
          aria-label="AdsLab"
        >
          <Image
            src="/adslab-logo.png"
            alt="AdsLab"
            width={400}
            height={120}
            priority
            className="h-7 w-auto dark:brightness-0 dark:invert"
          />
        </Link>
      </div>
      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Icon className="size-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
