"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Bot, Plug, Tag, Target } from "lucide-react";

import { cn } from "@/lib/utils";

export type SettingsTab = "scope" | "naming" | "ai" | "integrations";

const TABS: { id: SettingsTab; label: string; icon: typeof Target }[] = [
  { id: "scope", label: "Tenant Scope", icon: Target },
  { id: "naming", label: "Naming Standards", icon: Tag },
  { id: "ai", label: "AI Master", icon: Bot },
  { id: "integrations", label: "Integrations", icon: Plug },
];

export function SettingsTabs({ active }: { active: SettingsTab }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function go(tab: SettingsTab) {
    const next = new URLSearchParams(params.toString());
    next.set("tab", tab);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <div className="flex items-center gap-1 border-b border-border">
      {TABS.map((t) => {
        const Icon = t.icon;
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => go(t.id)}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
