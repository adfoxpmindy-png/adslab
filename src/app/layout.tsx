// Passthrough root layout. The real layout lives at `src/app/[locale]/layout.tsx`
// because every page URL is locale-prefixed. This file exists only to satisfy
// Next.js's "must have a root layout" requirement.
//
// Per the `add-isr-via-locale-url-prefix` change: every navigable URL passes
// through the locale middleware which redirects bare paths to `/<locale>/...`,
// so by the time React renders, the [locale]/layout.tsx is the active layout
// with the real <html><body> + providers.
import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
