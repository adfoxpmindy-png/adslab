import {
  BarChart3,
  Brain,
  Camera,
  FileText,
  Folder,
  Home,
  Image as ImageIcon,
  Settings,
  Shield,
  TrendingUp,
  Users,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Single source of truth for the tenant nav items, shared between the
 * desktop sidebar and the mobile drawer so both stay in sync.
 *
 * Labels are translation keys under the `sidebar.nav` namespace. The
 * consuming component should call `useTranslations("sidebar.nav")` and
 * resolve `labelKey` at render time so locale switches reflect immediately.
 */
export type SidebarNavItem = {
  /** Key into messages/{locale}.json under `sidebar.nav.*`. */
  labelKey: string;
  href: (tenantSlug: string) => string;
  icon: LucideIcon;
};

export const SIDEBAR_NAV_ITEMS: SidebarNavItem[] = [
  { labelKey: "overview", href: (s) => `/t/${s}/dashboard`, icon: Home },
  { labelKey: "boost", href: (s) => `/t/${s}/boost`, icon: Zap },
  { labelKey: "rules", href: (s) => `/t/${s}/rules`, icon: Shield },
  { labelKey: "campaigns", href: (s) => `/t/${s}/campaigns`, icon: Folder },
  { labelKey: "ads", href: (s) => `/t/${s}/ads`, icon: Camera },
  { labelKey: "audiences", href: (s) => `/t/${s}/audiences`, icon: Users },
  { labelKey: "creatives", href: (s) => `/t/${s}/creatives`, icon: ImageIcon },
  { labelKey: "posts", href: (s) => `/t/${s}/posts`, icon: FileText },
  { labelKey: "reports", href: (s) => `/t/${s}/reports`, icon: BarChart3 },
  { labelKey: "analyze", href: (s) => `/t/${s}/ai-optimize`, icon: TrendingUp },
  { labelKey: "memory", href: (s) => `/t/${s}/ai/memory`, icon: Brain },
  { labelKey: "tools", href: (s) => `/t/${s}/tools`, icon: Wrench },
  { labelKey: "settings", href: (s) => `/t/${s}/settings/integrations`, icon: Settings },
];

/** A route is active when its path is the current pathname OR a parent of it. */
export function isPathActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}
