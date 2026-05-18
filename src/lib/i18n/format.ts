/**
 * Locale-aware date / currency formatters. Component code SHOULD use
 * these instead of hardcoded `toLocaleString("th-TH", …)` calls.
 *
 * Pass the active locale (from `getLocale()` server-side or `useLocale()`
 * client-side); the helpers map our app locales ("th"|"en"|"lo") to the
 * matching IETF tags ("th-TH"|"en-US"|"lo-LA").
 */
import type { Locale } from "@/i18n/locales";

const LOCALE_TO_INTL_TAG: Record<Locale, string> = {
  th: "th-TH",
  en: "en-US",
  lo: "lo-LA",
};

function tag(locale: Locale | string): string {
  return LOCALE_TO_INTL_TAG[locale as Locale] ?? "th-TH";
}

export function formatDate(
  date: Date | string,
  locale: Locale | string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(tag(locale), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...options,
  }).format(d);
}

export function formatDateTime(
  date: Date | string,
  locale: Locale | string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(tag(locale), {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  }).format(d);
}

export function formatCurrency(
  amount: number,
  locale: Locale | string,
  currency: string = "THB",
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(tag(locale), {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    ...options,
  }).format(amount);
}

export function formatNumber(
  amount: number,
  locale: Locale | string,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(tag(locale), options).format(amount);
}
