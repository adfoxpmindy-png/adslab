import type { Metadata } from "next";
import Script from "next/script";
import { Inter, IBM_Plex_Sans_Thai } from "next/font/google";

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

export const metadata: Metadata = {
  title: "AdsLab",
  description: "ยิงแอดให้เร็ว แม่น scale ได้ — Thai-first SaaS สำหรับ media buyer",
  icons: {
    icon: [
      { url: "/adslab-logo.png", type: "image/png" },
    ],
    apple: "/adslab-logo.png",
  },
  openGraph: {
    title: "AdsLab",
    description: "ยิงแอดให้เร็ว แม่น scale ได้",
    images: ["/adslab-logo.png"],
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Dogfood our own SDK on AdsLab itself so we have real tracking data +
  // can verify Phase 5 end-to-end in prod. Only loads when the env var
  // is set, so local dev / preview deployments stay quiet by default.
  const adsLabSiteKey = process.env.NEXT_PUBLIC_ADSLAB_SITE_KEY;
  return (
    <html
      lang="th"
      suppressHydrationWarning
      className={`${inter.variable} ${ibmPlexSansThai.variable} h-full bg-background text-foreground antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider>
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
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
