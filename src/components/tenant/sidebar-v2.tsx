"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Crown,
  Folder,
  Home,
  Image as ImageIcon,
  MessageSquare,
  Settings,
  Sparkles,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Sidebar v2 — matches new design mockups.
 *
 * Visual changes from v1:
 *   - Active item: indigo→violet→pink gradient background, white text
 *   - Inactive items: muted gray, hover → soft accent
 *   - Logo size + brand color
 *   - "อัปเกรด AdsLab" promo card slotted mid-sidebar
 *   - Auto-detects active route via usePathname()
 *
 * Information-architecture changes from v1:
 *   - "Goals" + "Journey" + "Reports" + "AI Master" all surface — but
 *     less prominent than the daily-driver items
 *   - "เครื่องมือ" collapses Events / Naming under one entry
 */

type SidebarItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

type SidebarV2Props = {
  tenantSlug: string;
  /** Show "Upgrade" promotion card. Default true; hide for Scale+ tenants. */
  showUpgrade?: boolean;
};

export function SidebarV2({ tenantSlug, showUpgrade = true }: SidebarV2Props) {
  const pathname = usePathname();

  const items: SidebarItem[] = [
    { label: "ภาพรวม", href: `/t/${tenantSlug}/dashboard`, icon: Home },
    { label: "แคมเปญ", href: `/t/${tenantSlug}/campaigns`, icon: Folder },
    { label: "กลุ่มเป้าหมาย", href: `/t/${tenantSlug}/audiences`, icon: Users },
    { label: "Customer Journey", href: `/t/${tenantSlug}/journey`, icon: ImageIcon },
    { label: "AI Optimize", href: `/t/${tenantSlug}/ai-optimize`, icon: Sparkles },
    { label: "Competitor Spy", href: `/t/${tenantSlug}/competitors`, icon: Wrench },
    { label: "AI Master", href: `/t/${tenantSlug}/ai`, icon: MessageSquare },
    { label: "ตั้งค่า", href: `/t/${tenantSlug}/settings/integrations`, icon: Settings },
  ];

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar lg:flex">
      {/* Logo */}
      <div className="flex h-16 items-center px-5">
        <Link href={`/t/${tenantSlug}/dashboard`} className="flex items-center" aria-label="AdsLab">
          <Image
            src="/adslab-logo.png"
            alt="AdsLab"
            width={400}
            height={120}
            priority
            className="h-8 w-auto"
          />
        </Link>
      </div>

      {/* Nav items */}
      <nav className="flex-1 space-y-1 px-3 py-2">
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
              <Icon className={cn("size-4 shrink-0", isActive ? "text-white" : "text-muted-foreground group-hover:text-foreground")} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Upgrade promo card */}
      {showUpgrade && (
        <div className="mx-3 my-4 rounded-2xl bg-gradient-to-br from-violet-50 via-indigo-50 to-pink-50 p-4 dark:from-violet-950/30 dark:via-indigo-950/30 dark:to-pink-950/30">
          <div className="flex size-9 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-card">
            <Crown className="size-4" />
          </div>
          <p className="mt-3 text-sm font-bold tracking-tight text-foreground">อัปเกรด AdsLab</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            ปลดล็อกฟีเจอร์ขั้นสูง จัดการโฆษณาให้เหนือกว่า
          </p>
          <Link
            href={`/t/${tenantSlug}/settings/billing`}
            className="mt-3 inline-flex h-8 w-full items-center justify-center rounded-lg bg-brand-gradient text-xs font-semibold text-white shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover"
          >
            อัปเกรดตอนนี้
          </Link>
        </div>
      )}
    </aside>
  );
}

/** A route is active when its path is the current pathname OR a parent of it. */
function isPathActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (pathname === href) return true;
  // "/t/x/campaigns" should activate when on "/t/x/campaigns/new"
  return pathname.startsWith(`${href}/`);
}
