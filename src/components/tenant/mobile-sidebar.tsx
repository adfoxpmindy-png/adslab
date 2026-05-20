"use client";

import { useEffect } from "react";
import Image from "next/image";
import { Link, usePathname } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { SIDEBAR_NAV_ITEMS, isPathActive } from "./sidebar-nav-items";

type Props = {
  tenantSlug: string;
  open: boolean;
  onClose: () => void;
};

/**
 * Mobile drawer counterpart of SidebarV2. Slides in from the left on
 * tap of the hamburger button (rendered in topbar-v2 at < lg widths).
 *
 * Closes when:
 *   - User taps the backdrop
 *   - User taps the X button
 *   - The route changes (so navigation auto-dismisses the drawer)
 *   - Escape key is pressed
 */
export function MobileSidebar({ tenantSlug, open, onClose }: Props) {
  const pathname = usePathname();
  const tNav = useTranslations("sidebar.nav");
  const tMobile = useTranslations("mobileNav");

  // Auto-close on route change.
  useEffect(() => {
    if (open) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Escape key closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll while drawer is open so the page behind doesn't move.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      {/* Drawer */}
      <aside
        aria-hidden={!open}
        className={cn(
          "fixed left-0 top-0 z-50 flex h-dvh w-72 max-w-[85vw] flex-col border-r border-border bg-sidebar shadow-2xl transition-transform duration-200 lg:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Top: logo + close button */}
        <div className="flex h-16 shrink-0 items-center justify-between px-5">
          <Link
            href={`/t/${tenantSlug}/insights`}
            className="flex items-center"
            aria-label="AdsLab"
            onClick={onClose}
          >
            <Image
              src="/adslab-logo.png"
              alt="AdsLab"
              width={400}
              height={120}
              priority
              className="h-8 w-auto object-contain object-left dark:brightness-0 dark:invert"
            />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label={tMobile("closeMenu")}
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {SIDEBAR_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const href = item.href(tenantSlug);
            const active = isPathActive(pathname, href);
            const label = tNav(item.labelKey as Parameters<typeof tNav>[0]);
            return (
              <Link
                key={item.labelKey}
                href={href}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all",
                  active
                    ? "bg-brand-gradient text-white shadow-card"
                    : "text-foreground/70 hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    active ? "text-white" : "text-muted-foreground group-hover:text-foreground",
                  )}
                />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
