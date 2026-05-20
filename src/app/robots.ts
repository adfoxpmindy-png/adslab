import type { MetadataRoute } from "next";

/**
 * robots.txt — block crawl of authenticated tenant routes and API/admin
 * surfaces; allow public marketing + legal pages.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? "https://ads-lab.xyz";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Each locale's authenticated tenant tree is private. Disallow
        // patterns work across all locale prefixes via the wildcard.
        disallow: ["/*/t/", "/api/", "/setup-billing"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
