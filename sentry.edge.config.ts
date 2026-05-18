// Sentry edge-runtime init. Opt-in via SENTRY_DSN env var.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    sendDefaultPii: process.env.NEXT_PUBLIC_SENTRY_PII === "1",
    enableLogs: true,
    beforeSend(event, hint) {
      const err = hint?.originalException;
      const msg = err instanceof Error ? err.message : String(err ?? "");
      if (/MISSING_MESSAGE|MISSING_VALUE|next-intl/i.test(msg)) {
        event.tags = { ...event.tags, kind: "i18n-missing-key" };
        event.fingerprint = ["i18n-missing-key", msg];
      }
      return event;
    },
  });
}
