/**
 * Locale-aware layout. Owns <html><body> + all providers because the root
 * layout (src/app/layout.tsx) is a passthrough — see next-intl docs for the
 * `[locale]` pattern.
 *
 * The `locale` param comes from the URL's first segment (validated by the
 * routing config + middleware). NextIntlClientProvider reads `messages`
 * from the request config (`src/i18n/request.ts`).
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Script from "next/script";
import { Inter, IBM_Plex_Sans_Thai } from "next/font/google";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { routing } from "@/i18n/routing";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const ibmPlexSansThai = IBM_Plex_Sans_Thai({
  variable: "--font-thai",
  subsets: ["thai"],
  weight: ["300", "400", "500", "600", "700"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("rootMetadata");
  return {
    title: "AdsLab",
    description: t("description"),
    icons: {
      icon: [{ url: "/adslab-logo.png", type: "image/png" }],
      apple: "/adslab-logo.png",
    },
    openGraph: {
      title: "AdsLab",
      description: t("ogDescription"),
      images: ["/adslab-logo.png"],
      type: "website",
    },
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  // Enable static rendering for this layout (per-locale ISR).
  setRequestLocale(locale);

  const adsLabSiteKey = process.env.NEXT_PUBLIC_ADSLAB_SITE_KEY;
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${inter.variable} ${ibmPlexSansThai.variable} h-full bg-background text-foreground antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider>
            {children}
            <Toaster richColors position="top-right" />
          </ThemeProvider>
        </NextIntlClientProvider>
        {adsLabSiteKey && (
          <Script
            id="adslab-sdk-bootstrap"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `(function(w,k){w._adslab=k;var s=document.createElement('script');s.async=1;s.src='/sdk.js?k='+k;document.head.appendChild(s);})(window,'${adsLabSiteKey}');`,
            }}
          />
        )}
        {/* FastShip Pixel Hub */}
        <Script
          id="fastship-pixel-hub"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `!function(f,s,h){if(f.fsq)return;var q=f.fsq=function(){q.q.push(arguments)};q.q=[];var t=s.createElement('script');t.async=!0;t.src=h+'/px/fs-pixel.js';var x=s.getElementsByTagName('script')[0];x?x.parentNode.insertBefore(t,x):s.head.appendChild(t);}(window,document,'https://fastship-pixel-hub.vercel.app');fsq('init','fs_ws_0bf8e20b4f8ba7388e3ffac8');fsq('track','PageView');`,
          }}
        />
      </body>
    </html>
  );
}
