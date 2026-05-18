"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Check, Languages } from "lucide-react";
import { toast } from "sonner";

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/i18n/locales";

/**
 * Language switcher fragment — meant to be inlined inside an existing
 * DropdownMenuContent (e.g., the sidebar profile menu).
 *
 * Renders a small section header + 3 menu items (one per supported locale).
 * Clicking an item POSTs to /api/user/locale → updates DB + cookie →
 * router.refresh() so server components re-render in the new language.
 */
export function LanguageSwitcher() {
  const router = useRouter();
  const t = useTranslations("sidebar.profile.menu");
  const tSwitcher = useTranslations("languageSwitcher");
  const activeLocale = useLocale();
  const [, startTransition] = useTransition();

  async function switchTo(locale: Locale) {
    if (locale === activeLocale) return;
    try {
      const res = await fetch("/api/user/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      if (!res.ok) throw new Error("save failed");
      startTransition(() => router.refresh());
    } catch {
      toast.error(tSwitcher("errorChange"));
    }
  }

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="flex items-center gap-1.5 text-xs">
        <Languages className="size-3.5" />
        {t("language")}
      </DropdownMenuLabel>
      {LOCALES.map((loc) => (
        <DropdownMenuItem
          key={loc}
          onClick={() => switchTo(loc)}
          className="justify-between"
        >
          <span>{LOCALE_LABELS[loc]}</span>
          {loc === activeLocale && <Check className="size-3.5" />}
        </DropdownMenuItem>
      ))}
    </>
  );
}
