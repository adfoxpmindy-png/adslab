import { Bell } from "lucide-react";

import { TenantSwitcher } from "@/components/tenant/tenant-switcher";
import { UserMenu } from "@/components/tenant/user-menu";

import { TopbarPageTitle } from "./topbar-page-title";

type TopbarV2Props = {
  currentTenantSlug: string;
  tenants: { slug: string; name: string }[];
  user: { name: string; email: string };
};

/**
 * Topbar v2 — matches new design mockups.
 *
 * Layout: page title + subtitle (left), tenant switcher + notification
 * bell + user dropdown (right). The page title is pulled from a client-
 * side context that pages set via <SetPageTitle title=... subtitle=... />.
 *
 * Removed: ThemeToggle. Most modern SaaS hide this and detect via
 * system preference — uncluttered the header.
 */
export function TopbarV2({ currentTenantSlug, tenants, user }: TopbarV2Props) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-background px-6">
      <TopbarPageTitle />

      <div className="ml-auto flex items-center gap-3">
        <TenantSwitcher currentSlug={currentTenantSlug} tenants={tenants} />
        <button
          type="button"
          className="relative inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="การแจ้งเตือน"
        >
          <Bell className="size-4" />
          <span className="absolute top-2 right-2 size-1.5 rounded-full bg-brand-pink" />
        </button>
        <UserMenu name={user.name} email={user.email} />
      </div>
    </header>
  );
}
