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
 */
export type SidebarNavItem = {
  label: string;
  href: (tenantSlug: string) => string;
  icon: LucideIcon;
};

export const SIDEBAR_NAV_ITEMS: SidebarNavItem[] = [
  { label: "ภาพรวม", href: (s) => `/t/${s}/dashboard`, icon: Home },
  { label: "บูสต์ด่วน", href: (s) => `/t/${s}/boost`, icon: Zap },
  { label: "กฎอัตโนมัติ", href: (s) => `/t/${s}/rules`, icon: Shield },
  { label: "แคมเปญ", href: (s) => `/t/${s}/campaigns`, icon: Folder },
  { label: "โฆษณา", href: (s) => `/t/${s}/ads`, icon: Camera },
  { label: "กลุ่มเป้าหมาย", href: (s) => `/t/${s}/audiences`, icon: Users },
  { label: "ครีเอทีฟ", href: (s) => `/t/${s}/creatives`, icon: ImageIcon },
  { label: "โพสต์เพจ", href: (s) => `/t/${s}/posts`, icon: FileText },
  { label: "รายงาน", href: (s) => `/t/${s}/reports`, icon: BarChart3 },
  { label: "วิเคราะห์", href: (s) => `/t/${s}/ai-optimize`, icon: TrendingUp },
  { label: "ความจำ AI", href: (s) => `/t/${s}/ai/memory`, icon: Brain },
  { label: "เครื่องมือ", href: (s) => `/t/${s}/tools`, icon: Wrench },
  { label: "การตั้งค่า", href: (s) => `/t/${s}/settings/integrations`, icon: Settings },
];

/** A route is active when its path is the current pathname OR a parent of it. */
export function isPathActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}
