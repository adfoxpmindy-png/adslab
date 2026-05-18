/**
 * Locale registry. Single source of truth for what languages we support.
 */
export const LOCALES = ["th", "en", "lo"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "th";
/**
 * When a key is missing from the active locale's dictionary, fall back
 * to this locale. Thai (not English) — Thai/Lao share script roots and
 * many borrowed words; a Lao reader can decode Thai better than English.
 */
export const FALLBACK_LOCALE: Locale = "th";

export const LOCALE_LABELS: Record<Locale, string> = {
  th: "ไทย",
  en: "English",
  lo: "ລາວ (beta)",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Parse the user's preferred locale from various sources. Used by the
 * cookie middleware and the auth login route.
 */
export function resolveLocaleFromString(raw: string | null | undefined): Locale {
  if (!raw) return DEFAULT_LOCALE;
  if (isLocale(raw)) return raw;
  // Accept-Language headers may look like "th-TH,en;q=0.9" — try the
  // first language tag's primary subtag.
  const primary = raw.split(",")[0]?.split("-")[0]?.toLowerCase();
  if (isLocale(primary ?? "")) return primary as Locale;
  return DEFAULT_LOCALE;
}
