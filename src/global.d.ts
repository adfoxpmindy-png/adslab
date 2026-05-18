// Type-safe i18n: this declaration makes `t("nonexistent.key")` a TypeScript
// error at compile-time instead of a runtime `MISSING_MESSAGE` crash. The
// canonical message tree is `messages/th.json`; en/lo are kept in lockstep
// (verified by scripts/audit-missing-keys-v3.py).
//
// Catches the exact class of bug that slipped past us on the events page
// migration: code referencing `pages.events.logPageTitle` while the key only
// existed under `pages.audiences.events.*`. tsc + build can't catch missing
// translation keys without this declaration — only render-time can.
import type messages from "../messages/th.json";
import type { LOCALES } from "@/i18n/locales";

declare module "next-intl" {
  interface AppConfig {
    Messages: typeof messages;
    Locale: (typeof LOCALES)[number];
  }
}

export {};
