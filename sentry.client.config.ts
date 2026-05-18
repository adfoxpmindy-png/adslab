// Sentry client-side init. Opt-in via NEXT_PUBLIC_SENTRY_DSN env var; when
// unset the SDK stays inert (no events shipped, no perf overhead).
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 1.0,
    integrations: [Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false })],
    // Surface next-intl MISSING_MESSAGE so we hear about it in prod even if
    // pre-commit and Playwright smoke missed a dynamic-key gap.
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
