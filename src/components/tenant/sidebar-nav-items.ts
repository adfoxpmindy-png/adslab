import {
  Brain,
  LineChart,
  Megaphone,
  Settings2,
  Workflow,
  type LucideIcon,
} from "lucide-react";

/**
 * Single source of truth for the tenant nav items, shared between the
 * desktop sidebar and the mobile drawer so both stay in sync.
 *
 * Labels are translation keys under the `sidebar.nav` namespace. The
 * consuming component should call `useTranslations("sidebar.nav")` and
 * resolve `labelKey` at render time so locale switches reflect immediately.
 *
 * 5-section workflow-driven IA. Each top item lands on its section's
 * default tab; the LabPage tab strip exposes the rest of the tools that
 * used to be standalone sidebar entries. "Lab" badge is reserved for
 * AI Lab only (it's the exploratory surface — see lab-page.tsx).
 */
export type SidebarNavItem = {
  /** Key into messages/{locale}.json under `sidebar.nav.*`. */
  labelKey: string;
  href: (tenantSlug: string) => string;
  icon: LucideIcon;
};

export const SIDEBAR_NAV_ITEMS: SidebarNavItem[] = [
  { labelKey: "insights", href: (s) => `/t/${s}/insights`, icon: LineChart },
  { labelKey: "launch", href: (s) => `/t/${s}/launch`, icon: Megaphone },
  { labelKey: "aiLab", href: (s) => `/t/${s}/ai-lab`, icon: Brain },
  { labelKey: "automation", href: (s) => `/t/${s}/automation`, icon: Workflow },
  { labelKey: "settings", href: (s) => `/t/${s}/settings/integrations`, icon: Settings2 },
];

/** A route is active when its path is the current pathname OR a parent of it. */
export function isPathActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}
