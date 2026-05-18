/**
 * Server-side locale helpers. Use these in server components, route
 * handlers, and cron tasks that need to know the active user's locale.
 *
 *   resolveUserLocale(userId) — DB-stored preference for the user
 *   resolveActiveLocale()    — locale derived from current request cookie
 */
import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import {
  DEFAULT_LOCALE,
  type Locale,
  isLocale,
  resolveLocaleFromString,
} from "@/i18n/locales";
import { COOKIE_NAME } from "@/i18n/request";

/** Read the active locale from the current request cookie (server only). */
export async function resolveActiveLocale(): Promise<Locale> {
  const c = await cookies();
  const raw = c.get(COOKIE_NAME)?.value;
  return resolveLocaleFromString(raw);
}

/**
 * DB-stored preferred locale for a user. Falls back to default when the
 * row is missing or the value is invalid (defensive — column has DB
 * default "th" but legacy rows pre-migration could be null in theory).
 */
export async function resolveUserLocale(userId: string): Promise<Locale> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferredLocale: true },
  });
  if (!row) return DEFAULT_LOCALE;
  return isLocale(row.preferredLocale) ? row.preferredLocale : DEFAULT_LOCALE;
}
