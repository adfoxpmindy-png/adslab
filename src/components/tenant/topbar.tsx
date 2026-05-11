import { ThemeToggle } from "@/components/theme-toggle";
import { TenantSwitcher } from "@/components/tenant/tenant-switcher";
import { UserMenu } from "@/components/tenant/user-menu";

type TopbarProps = {
  currentTenantSlug: string;
  tenants: { slug: string; name: string }[];
  user: { name: string; email: string };
};

export function Topbar({ currentTenantSlug, tenants, user }: TopbarProps) {
  return (
    <header className="flex h-14 items-center gap-3 border-b border-border bg-background px-4 lg:px-6">
      <div className="flex items-center gap-2 lg:hidden">
        <span className="text-base font-semibold tracking-tight">AdsLab</span>
      </div>
      <div className="flex flex-1 items-center gap-2">
        <TenantSwitcher currentSlug={currentTenantSlug} tenants={tenants} />
      </div>
      <ThemeToggle />
      <UserMenu name={user.name} email={user.email} />
    </header>
  );
}
