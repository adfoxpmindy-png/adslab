/**
 * next-intl routing config — defines the URL shape of locales.
 *
 * `localePrefix: "always"` means every URL begins with /<locale>/ — there's
 * no implicit "default-locale-without-prefix" branch to test. See
 * openspec/changes/add-isr-via-locale-url-prefix/design.md D1 for the
 * rationale (symmetric URLs, cleaner SEO, simpler tests).
 */
import { defineRouting } from "next-intl/routing";
import { createNavigation } from "next-intl/navigation";

import { LOCALES, DEFAULT_LOCALE } from "./locales";

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "always",
  // The cookie is still set/read by middleware (for legacy URL redirects +
  // cross-device continuity) but is NOT the primary locale source.
  localeCookie: { name: "adslab-locale", maxAge: 60 * 60 * 24 * 365 },
});

/**
 * Localized navigation primitives. All internal code should import these
 * instead of `next/link` / `next/navigation` so the active locale is
 * auto-prefixed on every navigation.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
