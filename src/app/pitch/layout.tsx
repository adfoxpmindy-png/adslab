/**
 * Layout for public pitch pages (/pitch/*).
 *
 * Owns <html><body> because /pitch/* lives OUTSIDE [locale]/ and the root
 * layout (src/app/layout.tsx) is a passthrough that the [locale] tree relies on.
 * Without this file, Next.js 16 errors "Missing <html> and <body> tags".
 *
 * These are static sales pages served to prospective clients — no auth,
 * no i18n resolution, no DB access. Copy is hardcoded per-page in Thai.
 */
import type { Metadata } from "next";
import { Inter, IBM_Plex_Sans_Thai } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";

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
  title: "AdsLab — วิเคราะห์บัญชีโฆษณา Meta",
  icons: {
    icon: [{ url: "/adslab-logo.png", type: "image/png" }],
  },
  // Pitch pages are shared privately with prospects — no need to index.
  robots: { index: false, follow: false },
};

export default function PitchLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="th"
      suppressHydrationWarning
      className={`${inter.variable} ${ibmPlexSansThai.variable} h-full bg-background text-foreground antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
