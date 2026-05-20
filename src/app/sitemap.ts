import type { MetadataRoute } from "next";

import { LOCALES } from "@/i18n/locales";

/**
 * Public sitemap — emits one entry per (locale × public-path) so search
 * engines crawl the localized versions independently.
 *
 * Authenticated routes (/t/<slug>/...) are excluded because they require
 * a session cookie and shouldn't be indexed.
 */
const PUBLIC_PATHS = ["", "/login", "/signup", "/privacy", "/terms", "/refund-policy", "/data-deletion"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.APP_URL ?? "https://ads-lab.xyz";
  const now = new Date();

  return LOCALES.flatMap((locale) =>
    PUBLIC_PATHS.map((path) => ({
      url: `${base}/${locale}${path}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: path === "" ? 1.0 : 0.6,
      alternates: {
        languages: Object.fromEntries(
          LOCALES.map((l) => [l, `${base}/${l}${path}`]),
        ),
      },
    })),
  );
}
