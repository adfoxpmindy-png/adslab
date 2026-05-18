/**
 * Screenshot every public route in all 3 locales. Output goes to
 * `screenshots/<route>-<locale>.png` for visual eyeball review without having
 * to click through 24 page-locale combos in a browser.
 *
 * Run: `npx playwright test screenshots.spec.ts`
 */
import { test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

type Locale = "th" | "en" | "lo";

const LOCALES: Locale[] = ["th", "en", "lo"];

const ROUTES = [
  { path: "/", name: "landing" },
  { path: "/login", name: "login" },
  { path: "/signup", name: "signup" },
  { path: "/refund-policy", name: "refund-policy" },
  { path: "/terms", name: "terms" },
  { path: "/privacy", name: "privacy" },
  { path: "/data-deletion", name: "data-deletion" },
  { path: "/verify-email", name: "verify-email" },
] as const;

const OUT_DIR = "screenshots";

test.beforeAll(() => {
  mkdirSync(OUT_DIR, { recursive: true });
});

async function setLocale(page: Page, locale: Locale) {
  await page.setExtraHTTPHeaders({ Cookie: `adslab-locale=${locale}` });
}

for (const locale of LOCALES) {
  test.describe(`screenshots — ${locale}`, () => {
    for (const route of ROUTES) {
      test(`${route.name}`, async ({ page }) => {
        await setLocale(page, locale);
        await page.goto(route.path, { waitUntil: "networkidle" });
        // Wait briefly for any client-side hydration / lazy fonts.
        await page.waitForTimeout(500);
        await page.screenshot({
          path: join(OUT_DIR, `${route.name}-${locale}.png`),
          fullPage: true,
        });
      });
    }
  });
}
