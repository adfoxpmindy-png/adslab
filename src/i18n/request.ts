/**
 * next-intl request config — reads the active locale from the URL via
 * `routing.requestLocale` (set by the middleware) instead of the
 * `adslab-locale` cookie. The cookie still exists but is now only used by
 * the middleware to choose a locale for legacy non-prefixed URL redirects.
 *
 * Imported by next-intl's automatic request handler — must export default
 * from `src/i18n/request.ts` per next-intl convention.
 */
import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";

import { routing } from "./routing";
import { DEFAULT_LOCALE, FALLBACK_LOCALE } from "./locales";

export const COOKIE_NAME = "adslab-locale";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : DEFAULT_LOCALE;

  let messages;
  try {
    messages = (await import(`../../messages/${locale}.json`)).default;
  } catch {
    messages = (await import(`../../messages/${FALLBACK_LOCALE}.json`)).default;
  }

  return { locale, messages };
});
