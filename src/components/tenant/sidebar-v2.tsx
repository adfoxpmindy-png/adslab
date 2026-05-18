"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown, Crown, Settings, LogOut, User as UserIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LanguageSwitcher } from "./language-switcher";
import { SIDEBAR_NAV_ITEMS, isPathActive } from "./sidebar-nav-items";

/**
 * Sidebar v2 — matches new design mockup exactly.
 *
 * Sections (top → bottom):
 *   1. AdsLab logo
 *   2. 8 nav items (gradient active state)
 *   3. "Connected accounts" — 4 platform icons (Meta active, others coming soon)
 *   4. "Upgrade AdsLab" promo card (hidden for Scale+)
 *   5. User profile with role + dropdown chevron
 *
 * Active state: indigo→violet→pink gradient bg + white text + soft shadow.
 */

type SidebarV2Props = {
  tenantSlug: string;
  showUpgrade?: boolean;
  user: { name: string; email: string; role: string };
};

export function SidebarV2({ tenantSlug, showUpgrade = true, user }: SidebarV2Props) {
  const pathname = usePathname();
  const router = useRouter();
  const tNav = useTranslations("sidebar.nav");
  const tSection = useTranslations("sidebar.section");
  const tUpgrade = useTranslations("sidebar.upgrade");
  const tProfile = useTranslations("sidebar.profile.menu");
  const items = SIDEBAR_NAV_ITEMS.map((item) => ({
    label: tNav(item.labelKey as Parameters<typeof tNav>[0]),
    href: item.href(tenantSlug),
    icon: item.icon,
  }));

  const initials = user.name
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col self-start overflow-y-auto border-r border-border bg-sidebar lg:flex">
      {/* Logo — uses brightness/invert in dark mode so the dark "AdsLab"
          wordmark stays readable on the dark sidebar bg */}
      <div className="flex h-16 shrink-0 items-center px-5">
        <Link href={`/t/${tenantSlug}/dashboard`} className="flex items-center" aria-label="AdsLab">
          <Image
            src="/adslab-logo.png"
            alt="AdsLab"
            width={400}
            height={120}
            priority
            className="h-8 w-auto object-contain object-left dark:brightness-0 dark:invert"
          />
        </Link>
      </div>

      {/* Nav items */}
      <nav className="space-y-1 px-3 py-2">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = isPathActive(pathname, item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                isActive
                  ? "bg-brand-gradient text-white shadow-card"
                  : "text-foreground/70 hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0",
                  isActive ? "text-white" : "text-muted-foreground group-hover:text-foreground",
                )}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Connect accounts section */}
      <div className="mt-2 border-t border-border px-5 py-4">
        <p className="text-[11px] font-medium text-muted-foreground">{tSection("connectAccounts")}</p>
        <div className="mt-2.5 flex items-center gap-1.5">
          <PlatformLogo
            href={`/t/${tenantSlug}/settings/integrations`}
            label="Meta"
            active
            brandBg="#1877F2"
          >
            <svg viewBox="0 0 24 24" className="size-4">
              <path
                fill="currentColor"
                d="M12 2C6.48 2 2 6.48 2 12c0 5 3.66 9.13 8.44 9.88v-6.99H7.9V12h2.54V9.85c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.23.19 2.23.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.77l-.44 2.89h-2.33v6.99C18.34 21.13 22 17 22 12c0-5.52-4.48-10-10-10z"
              />
            </svg>
          </PlatformLogo>
          <PlatformLogo label="Google" brandBg="#4285F4">
            <svg viewBox="0 0 24 24" className="size-4">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
            </svg>
          </PlatformLogo>
          <PlatformLogo label="TikTok" brandBg="#111">
            <svg viewBox="0 0 24 24" className="size-4">
              <path
                fill="currentColor"
                d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.69a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.12z"
              />
            </svg>
          </PlatformLogo>
          <PlatformLogo label="YouTube" brandBg="#FF0000">
            <svg viewBox="0 0 24 24" className="size-4">
              <path
                fill="currentColor"
                d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.6 15.6V8.4l6.2 3.6-6.2 3.6z"
              />
            </svg>
          </PlatformLogo>
        </div>
      </div>

      {/* Upgrade promo */}
      {showUpgrade && (
        <div className="mx-3 my-2 rounded-2xl bg-gradient-to-br from-violet-50 via-indigo-50 to-pink-50 p-4 ring-1 ring-border/60 dark:bg-gradient-to-br dark:from-violet-900/40 dark:via-indigo-900/40 dark:to-pink-900/40 dark:ring-white/10">
          <div className="flex size-9 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-card">
            <Crown className="size-4" />
          </div>
          <p className="mt-3 text-sm font-bold tracking-tight text-foreground">{tUpgrade("title")}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {tUpgrade("description")}
          </p>
          <Link
            href={`/t/${tenantSlug}/settings/billing`}
            className="mt-3 inline-flex h-8 w-full items-center justify-center rounded-lg bg-brand-gradient text-xs font-semibold text-white shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover"
          >
            {tUpgrade("cta")}
          </Link>
        </div>
      )}

      {/* User profile at bottom — dropdown with profile / settings / logout */}
      <div data-sidebar-profile className="mt-auto border-t border-border px-3 py-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-xl p-2 text-left transition-colors hover:bg-accent">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-xs font-bold text-white shadow-card">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight">{user.name}</p>
              <p className="truncate text-[11px] capitalize text-muted-foreground">
                {user.role.toLowerCase()}
              </p>
            </div>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="truncate">
                {user.email}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push(`/t/${tenantSlug}/settings/integrations`)}>
                <UserIcon className="mr-2 size-4" />
                {tProfile("profile")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push(`/t/${tenantSlug}/settings/integrations`)}>
                <Settings className="mr-2 size-4" />
                {tProfile("settings")}
              </DropdownMenuItem>
              <LanguageSwitcher />
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" });
                  router.push("/login");
                }}
                className="text-rose-600 dark:text-rose-300"
              >
                <LogOut className="mr-2 size-4" />
                {tProfile("logout")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}

function PlatformLogo({
  href,
  label,
  active,
  brandBg,
  children,
}: {
  href?: string;
  label: string;
  active?: boolean;
  brandBg: string;
  children: React.ReactNode;
}) {
  // Active: white-ish chip in light, dark-tinted chip in dark — icon rendered
  // in the platform brand color. Inactive: same but desaturated + dim.
  const content = (
    <span
      className={cn(
        "flex size-9 items-center justify-center rounded-full transition-all",
        active
          ? "bg-white shadow-card ring-1 ring-border dark:bg-card dark:ring-white/10"
          : "bg-muted opacity-50 hover:opacity-80 dark:bg-white/5",
      )}
      style={{ color: active ? brandBg : "currentColor" }}
      title={`${label}${!active ? " (soon)" : ""}`}
    >
      {children}
    </span>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}
