"use client";

// LabPage — shared shell for tenant sections (Insights, Launch, AI Lab,
// Automation, Settings). Header (icon + title + optional Lab badge +
// description) + a server-rendered tab strip + content slot.
//
// IMPORTANT: `icon` is typed React.ReactNode (not LucideIcon function).
// Next.js 16 forbids passing function references across the Server→Client
// boundary; the original LabPage took `icon: LucideIcon` and crashed prod
// with "Functions cannot be passed directly to Client Components" the
// moment any authenticated route tried to render. Sentry caught it as
// JAVASCRIPT-NEXTJS-5 on 2026-05-20. Usage now:
//
//   <LabPage icon={<LineChart className="size-4" />} tabs={[...]}>

import type { ReactNode } from "react";

import { Link, usePathname } from "@/i18n/routing";

import { cn } from "@/lib/utils";

export type LabTab = {
  key: string;
  label: string;
  /** Locale-less href (e.g. `/t/<slug>/insights`). next-intl's Link
   * auto-prepends the active locale and usePathname() also returns the
   * locale-less path so the active-tab comparison matches. */
  href: string;
};

export type LabPageProps = {
  title: string;
  description?: string;
  icon: ReactNode;
  tabs: LabTab[];
  /** Show the violet "Lab" badge next to the title. Reserved for AI Lab —
   * the only exploratory surface. Other sections (Insights / Launch /
   * Automation / Settings) get a plain header. */
  showLabBadge?: boolean;
  children: ReactNode;
};

export function LabPage({
  title,
  description,
  icon,
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
            {icon}
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
