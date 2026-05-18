/**
 * next-intl request config. Reads the active locale from the
 * adslab-locale cookie (set on login or via the language switcher),
 * with fallback to Accept-Language, then to Thai.
 *
 * Imported by next-intl's automatic request handler — must export
 * default from `src/i18n/request.ts` per next-intl convention.
 */
import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

import { DEFAULT_LOCALE, FALLBACK_LOCALE, isLocale, resolveLocaleFromString, type Locale } from "./locales";

export const COOKIE_NAME = "adslab-locale";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(COOKIE_NAME)?.value;
  let locale: Locale | null = isLocale(cookieLocale ?? "") ? (cookieLocale as Locale) : null;

  if (!locale) {
    const headerStore = await headers();
    const acceptLang = headerStore.get("accept-language");
    locale = resolveLocaleFromString(acceptLang);
  }

  // Final safety net.
  if (!isLocale(locale)) locale = DEFAULT_LOCALE;

  // Load messages dynamically so each request only ships the needed dict.
  let messages;
  try {
    messages = (await import(`../../messages/${locale}.json`)).default;
  } catch {
    // If the active locale's dictionary is somehow missing, fall back.
    messages = (await import(`../../messages/${FALLBACK_LOCALE}.json`)).default;
  }

  return { locale, messages };
});
