"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import { MobileSidebar } from "./mobile-sidebar";

/**
 * Hamburger trigger + slide-in drawer, paired together. Lives on the
 * left of the topbar at < lg widths only; desktop uses the sticky
 * SidebarV2 instead.
 */
export function MobileNav({ tenantSlug }: { tenantSlug: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="เปิดเมนู"
        aria-expanded={open}
        className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      <MobileSidebar tenantSlug={tenantSlug} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
