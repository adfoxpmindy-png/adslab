import { Bell } from "lucide-react";

import { TenantSwitcher } from "@/components/tenant/tenant-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

import { TopbarPageTitle } from "./topbar-page-title";

type TopbarV2Props = {
  currentTenantSlug: string;
  tenants: { slug: string; name: string }[];
};

/**
 * Topbar v2: page title (from context) + tenant switcher + theme toggle +
 * notification bell. User profile lives in sidebar bottom per mockup.
 */
export function TopbarV2({ currentTenantSlug, tenants }: TopbarV2Props) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-background px-6">
      <TopbarPageTitle />

      <div className="ml-auto flex items-center gap-2">
        <TenantSwitcher currentSlug={currentTenantSlug} tenants={tenants} />
        <ThemeToggle />
        <button
          type="button"
          className="relative inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="การแจ้งเตือน"
        >
          <Bell className="size-4" />
          <span className="absolute top-2 right-2 size-1.5 rounded-full bg-brand-pink" />
        </button>
      </div>
    </header>
  );
}
