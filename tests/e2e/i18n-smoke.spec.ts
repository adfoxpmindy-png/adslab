/**
 * i18n smoke tests across th / en / lo.
 *
 * Catches the class of bug that broke us 5 rounds: translation keys referenced
 * in code but missing from the locale dictionary → render-time
 * `MISSING_MESSAGE` crash. tsc + the missing-key audit catch static cases;
 * this catches dynamic-key interpolations that only fail at runtime.
 *
 * Run: `npm run test:smoke` (after `npm run dev` is up, or let webServer spawn it).
 */
import { test, expect, type Page } from "@playwright/test";

type Locale = "th" | "en" | "lo";

const LOCALES: Locale[] = ["th", "en", "lo"];

// Public routes only — no DB/auth needed. These are the ones whose i18n
// migration we want to lock down.
const PUBLIC_ROUTES = [
  { path: "/", name: "landing" },
  { path: "/login", name: "login" },
  { path: "/signup", name: "signup" },
  { path: "/refund-policy", name: "refund-policy" },
  { path: "/terms", name: "terms" },
  { path: "/privacy", name: "privacy" },
  { path: "/data-deletion", name: "data-deletion" },
  { path: "/verify-email", name: "verify-email" },
] as const;

// Locale-specific text fragments. If the page renders in the correct locale,
// at least one of these MUST be present (catches "rendered but in wrong locale"
// failures). One per locale per route is fine — we just want a signal.
const LOCALE_HOOKS: Record<Locale, string[]> = {
  th: ["ไทย", "เริ่มต้น", "ยอด", "เข้าสู่ระบบ", "นโยบาย", "ข้อกำหนด", "ยืนยัน"],
  en: ["English", "Start", "Sign", "Log in", "Policy", "Terms", "Verify"],
  lo: ["ລາວ", "ເລີ່ມ", "ສະໝັກ", "ເຂົ້າສູ່", "ນະໂຍບາຍ", "ຂໍ້ກຳນົດ", "ຢືນຢັນ"],
};

async function setLocale(page: Page, locale: Locale) {
  // Force the locale via an explicit Cookie header on every request. The
  // context-level addCookies approach was inconsistent on localhost — this
  // guarantees the dev server sees `adslab-locale=<value>` on the request.
  await page.setExtraHTTPHeaders({
    Cookie: `adslab-locale=${locale}`,
  });
}

for (const locale of LOCALES) {
  test.describe(`locale = ${locale}`, () => {
    for (const route of PUBLIC_ROUTES) {
      test(`${route.name} renders with no missing-message error`, async ({ page }) => {
        await setLocale(page, locale);

        const response = await page.goto(route.path, { waitUntil: "domcontentloaded" });

        // Page must respond 2xx or a navigable redirect chain ending OK.
        expect(response, `${route.path} must return a response`).not.toBeNull();
        const status = response!.status();
        expect(status, `${route.path} status code`).toBeLessThan(400);

        const html = await page.content();

        // No next-intl MISSING_MESSAGE errors in rendered output. THIS is the
        // primary smoke-test purpose (catch render-time t() key gaps).
        expect(html).not.toContain("MISSING_MESSAGE");
        expect(html).not.toContain("MISSING_VALUE");

        // <html lang="..."> attribute must match the requested locale. If it
        // doesn't, the middleware/getLocale isn't reading the cookie.
        const langMatch = html.match(/<html\s+lang="([^"]+)"/);
        expect(langMatch, `<html lang> attribute missing on ${route.path}`).not.toBeNull();
        expect(langMatch![1]).toBe(locale);

        // Locale signal: at least one locale-specific text fragment appears
        // somewhere on the page body. Catches "rendered the wrong dict".
        // We grep the bodyText (visible text only) — avoids matching Turbopack
        // chunk URL paths in script srcs.
        const bodyText = await page.locator("body").innerText();
        const hits = LOCALE_HOOKS[locale].some((s) => bodyText.includes(s));
        expect(hits, `expected at least one ${locale} fragment in visible text of ${route.path}`).toBe(true);

        // Console errors check — any uncaught browser error during render is a fail.
        const consoleErrors: string[] = [];
        page.on("console", (msg) => {
          if (msg.type() === "error") consoleErrors.push(msg.text());
        });
        // Give the page a moment to flush any client-side errors.
        await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
        if (consoleErrors.length > 0) {
          // Don't hard-fail on every console error — only on MISSING_MESSAGE-shaped ones.
          const i18nErrors = consoleErrors.filter((e) =>
            /MISSING_MESSAGE|MISSING_VALUE|next-intl/i.test(e),
          );
          expect(i18nErrors, `i18n errors in console for ${route.path}`).toEqual([]);
        }
      });
    }
  });
}
