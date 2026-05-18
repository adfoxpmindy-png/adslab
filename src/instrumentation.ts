// Next.js runtime-aware instrumentation hook. Loads the matching Sentry
// config for the active runtime (nodejs / edge). The client config is loaded
// automatically via the `sentry.client.config.ts` convention.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

// Optional: surface unhandled errors to Sentry from server components / route
// handlers. The Sentry SDK wires this up automatically if it sees the export.
export { captureRequestError as onRequestError } from "@sentry/nextjs";
