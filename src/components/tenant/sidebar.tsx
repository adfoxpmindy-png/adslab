import Link from "next/link";
import { BarChart3, FileText, LayoutDashboard, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type SidebarItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  enabled: boolean;
};

type SidebarProps = {
  tenantSlug: string;
};

export function Sidebar({ tenantSlug }: SidebarProps) {
  const items: SidebarItem[] = [
    { label: "Dashboard", href: `/t/${tenantSlug}/dashboard`, icon: LayoutDashboard, enabled: true },
    { label: "Reports", href: `/t/${tenantSlug}/reports`, icon: FileText, enabled: false },
    { label: "Insights", href: `/t/${tenantSlug}/insights`, icon: BarChart3, enabled: false },
    { label: "Settings", href: `/t/${tenantSlug}/settings`, icon: Settings, enabled: false },
  ];

  return (
    <aside className="hidden border-r border-border bg-background lg:flex lg:w-60 lg:flex-col">
      <div className="flex h-14 items-center border-b border-border px-5">
        <Link href={`/t/${tenantSlug}/dashboard`} className="text-base font-semibold tracking-tight">
          AdsLab
        </Link>
      </div>
      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.enabled ? item.href : "#"}
              aria-disabled={!item.enabled}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                item.enabled
                  ? "text-foreground hover:bg-muted"
                  : "pointer-events-none text-muted-foreground/60",
              )}
            >
              <Icon className="size-4" />
              <span className="flex-1">{item.label}</span>
              {!item.enabled && (
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60">
                  เร็วๆ นี้
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
