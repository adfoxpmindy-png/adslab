/**
 * Layout for public viewer routes (/v/[token]).
 *
 * Owns <html><body> because /v/* lives OUTSIDE [locale]/ and the root layout
 * (src/app/layout.tsx) is a passthrough that the [locale] tree relies on.
 * Without this file, Next.js 16 errors "Missing <html> and <body> tags".
 *
 * Locale is resolved per-request from the recipient's Accept-Language header
 * (or ?lang= override on the page) — clients of an operator don't carry an
 * AdsLab cookie. Messages are loaded directly for that locale so the page
 * doesn't depend on next-intl's request config (which is wired to the
 * URL-segment locale used by /[locale]/...).
 */
import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, IBM_Plex_Sans_Thai } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";

import { ThemeProvider } from "@/components/theme-provider";
import { DEFAULT_LOCALE, resolveLocaleFromString, type Locale } from "@/i18n/locales";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const ibmPlexSansThai = IBM_Plex_Sans_Thai({
  variable: "--font-thai",
  subsets: ["thai"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "AdsLab — Campaign performance",
  icons: {
    icon: [{ url: "/adslab-logo.png", type: "image/png" }],
  },
  // Don't index public viewer pages — they contain spend data that should not
  // surface in search results, and the token in the URL is the only access gate.
  robots: { index: false, follow: false },
};

async function loadMessages(locale: Locale) {
  try {
    return (await import(`../../../messages/${locale}.json`)).default;
  } catch {
    return (await import(`../../../messages/${DEFAULT_LOCALE}.json`)).default;
  }
}

export default async function ViewerLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const acceptLang = h.get("accept-language");
  // Viewer recipients are external clients — default to English when there's
  // no explicit signal, not Thai. They can still override with ?lang=th.
  const locale: Locale = acceptLang ? resolveLocaleFromString(acceptLang) : "en";
  const messages = await loadMessages(locale);

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${inter.variable} ${ibmPlexSansThai.variable} h-full bg-background text-foreground antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider>{children}</ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
