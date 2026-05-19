import {
  Brain,
  FlaskConical,
  Package,
  Rocket,
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
 * The 6-item Lab structure replaces the previous flat 13-item list. Each
 * Lab is a tabbed workbench: clicking a sidebar item lands on the Lab's
 * default sub-tab, and the tab strip exposes the rest of the tools that
 * used to be standalone routes.
 */
export type SidebarNavItem = {
  /** Key into messages/{locale}.json under `sidebar.nav.*`. */
  labelKey: string;
  href: (tenantSlug: string) => string;
  icon: LucideIcon;
};

export const SIDEBAR_NAV_ITEMS: SidebarNavItem[] = [
  { labelKey: "insightsLab", href: (s) => `/t/${s}/insights-lab`, icon: FlaskConical },
  { labelKey: "launchLab", href: (s) => `/t/${s}/launch-lab`, icon: Rocket },
  { labelKey: "inventoryLab", href: (s) => `/t/${s}/inventory-lab`, icon: Package },
  { labelKey: "aiLab", href: (s) => `/t/${s}/ai-lab`, icon: Brain },
  { labelKey: "automationLab", href: (s) => `/t/${s}/automation-lab`, icon: Workflow },
  { labelKey: "settings", href: (s) => `/t/${s}/settings/integrations`, icon: Settings2 },
];

/** A route is active when its path is the current pathname OR a parent of it. */
export function isPathActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}
