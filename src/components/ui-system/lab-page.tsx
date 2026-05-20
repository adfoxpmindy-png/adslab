"use client";

// LabPage — the consistent shell every "Lab" (Insights, Launch, Inventory,
// AI, Automation) renders. See openspec/changes/add-lab-information-
// architecture/specs/ui-design-system/spec.md for the spec.
//
// Composition:
//   <LabPage title="..." description="..." tabs={[...]} activeTab="...">
//     {/* content for the active tab */}
//   </LabPage>
//
// Tabs are server-rendered links (next-intl Link, not state). Each tab is
// a real route under /<locale>/<lab>/<tab>; clicking navigates without
// client-side state juggling.

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type LabTab = {
  key: string;
  label: string;
  href: string;
};

export type LabPageProps = {
  title: string;
  description?: string;
  icon: LucideIcon;
  tabs: LabTab[];
  /** Show the violet "Lab" badge next to the title. Reserved for AI Lab — the
   * only surface that feels experimental. Defaults to false so other section
   * shells (Insights, Launch, Automation) get a plain header. */
  showLabBadge?: boolean;
  children: React.ReactNode;
};

export function LabPage({
  title,
  description,
  icon: Icon,
  tabs,
  showLabBadge = false,
  children,
}: LabPageProps) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-background px-6 py-4">
        <div className="flex items-baseline gap-2.5">
          <div className="inline-flex size-7 items-center justify-center rounded-md bg-brand-violet/10 text-brand-violet">
            <Icon className="size-4" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {showLabBadge && (
            <span className="rounded-full bg-brand-violet/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-violet">
              Lab
            </span>
          )}
        </div>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
        <nav
          className="mt-3 flex flex-wrap gap-1 overflow-x-auto"
          role="tablist"
          aria-label={`${title} tabs`}
        >
          {tabs.map((tab) => {
            const isActive =
              pathname === tab.href || (pathname && pathname.startsWith(`${tab.href}/`));
            return (
              <Link
                key={tab.key}
                href={tab.href}
                role="tab"
                aria-selected={isActive ? "true" : "false"}
                className={cn(
                  "inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-brand-violet/10 text-brand-violet"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}
