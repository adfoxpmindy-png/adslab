import type { Metadata } from "next";
import Script from "next/script";
import { Inter, IBM_Plex_Sans_Thai } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

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
      icon: [
        { url: "/adslab-logo.png", type: "image/png" },
      ],
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const adsLabSiteKey = process.env.NEXT_PUBLIC_ADSLAB_SITE_KEY;
  // next-intl: resolve the active locale + dictionary server-side. The
  // <html lang> attribute matches so screen readers + browser hints are
  // accurate. NextIntlClientProvider hydrates client components.
  const locale = await getLocale();
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
      </body>
    </html>
  );
}
