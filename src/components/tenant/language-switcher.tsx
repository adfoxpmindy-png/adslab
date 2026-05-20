"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
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
 * Clicking an item:
 *   1. POSTs to /api/user/locale (DB + cookie persistence so cross-device
 *      + unprefixed-URL fallback keeps working).
 *   2. router.replace() to the SAME path but with the new locale segment
 *      swapped in (e.g. /th/t/foo/dashboard → /en/t/foo/dashboard). The
 *      URL is the source of truth for the active locale after the
 *      locale-prefix migration; just refreshing wouldn't change anything
 *      because the URL still says /th/.
 */
export function LanguageSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
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
      // Swap the locale segment at the start of the pathname. Lookahead
      // matches only the locale token itself (`/th`, `/en`, `/lo`) so we
      // never mangle paths that happen to start with those letters.
      const newPath = pathname.replace(/^\/(?:th|en|lo)(?=\/|$)/, `/${locale}`);
      startTransition(() => router.replace(newPath));
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
