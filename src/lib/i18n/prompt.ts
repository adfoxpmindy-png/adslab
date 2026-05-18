/**
 * Locale-aware AI prompt fragments. Every AI surface that emits
 * user-facing text imports `localeDirective(locale)` and prepends it to
 * the system prompt so the model responds in the user's language.
 *
 * Per design.md D4: locale instruction is short and deterministic; no
 * extra LLM round-trip for translation.
 */
import type { Locale } from "@/i18n/locales";

export function localeDirective(locale: Locale): string {
  switch (locale) {
    case "th":
      return "ตอบเป็นภาษาไทย ใช้คำศัพท์ media buyer ไทย ทับศัพท์ภาษาอังกฤษ (ROAS, CTA, Reels) ใช้ได้เลย";
    case "en":
      return "Respond in English. Use industry terms (ROAS, CTA, Reels) verbatim.";
    case "lo":
      return "ຕອບເປັນພາສາລາວ ສະຫງວນຄຳສັບອຸດສາຫະກຳພາສາອັງກິດ (ROAS, CTA, Reels). When you don't know the Lao term, switch to Thai for that word rather than English — the Lao audience reads Thai better than English.";
  }
}
