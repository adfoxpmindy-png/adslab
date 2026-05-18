import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { LOCALES, type Locale } from "@/i18n/locales";
import { COOKIE_NAME as LOCALE_COOKIE } from "@/i18n/request";

const bodySchema = z.object({
  locale: z.enum(LOCALES as readonly [Locale, ...Locale[]]),
});

/**
 * POST /api/user/locale  body: { locale: "th" | "en" | "lo" }
 *
 * Persists the user's preferred locale + sets the adslab-locale cookie
 * so the next request renders in the new language. Client should call
 * router.refresh() after a 200 to update the UI without a full reload.
 */
export async function POST(request: Request) {
  const session = await requireSession();
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid locale" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: { preferredLocale: parsed.data.locale },
  });

  const res = NextResponse.json({ ok: true, locale: parsed.data.locale });
  res.cookies.set(LOCALE_COOKIE, parsed.data.locale, {
    maxAge: 365 * 24 * 60 * 60,
    path: "/",
    sameSite: "lax",
  });
  return res;
}
