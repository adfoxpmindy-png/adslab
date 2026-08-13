/**
 * Shared helpers for Hook Lab API routes.
 *
 * - `resolveTenant(request)` — reads tenantSlug from ?query or JSON body,
 *   asserts session + tenant membership, and returns { session, tenant }.
 * - `guardRateLimit(...)` — one-liner acquire + JSON 429 on cap-hit.
 * - `sseStream(...)` — wrap an async generator of SSE events into a
 *   Response. We don't have the Vercel AI SDK, so this is the manual
 *   text/event-stream fallback described in the spec.
 * - `sseEvent(...)` — JSON-encode a single event with an explicit type.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import {
  acquireHookRateLimit,
  type HookRateLimitEndpoint,
  type RateLimitResult,
} from "./rate-limit";

export interface ResolvedTenant {
  session: { userId: string; email: string };
  tenant: { id: string; name: string; slug: string };
}

async function readTenantSlug(request: Request): Promise<string | null> {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("tenantSlug");
  if (fromQuery) return fromQuery;

  // Some POST bodies carry tenantSlug in the JSON payload. Peek without
  // consuming — clone the request so downstream can still .json().
  if (request.method !== "GET" && request.method !== "HEAD") {
    try {
      const cloned = request.clone();
      const body = (await cloned.json().catch(() => null)) as
        | { tenantSlug?: string }
        | null;
      if (body && typeof body.tenantSlug === "string") return body.tenantSlug;
    } catch {
      // ignore — body may not be JSON
    }
  }
  return null;
}

export async function resolveTenant(
  request: NextRequest | Request,
): Promise<
  | { ok: true; ctx: ResolvedTenant }
  | { ok: false; response: Response }
> {
  const tenantSlug = await readTenantSlug(request);
  if (!tenantSlug) {
    return {
      ok: false,
      response: NextResponse.json({ error: "tenantSlug required" }, { status: 400 }),
    };
  }
  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug);
  return {
    ok: true,
    ctx: {
      session: { userId: session.userId, email: session.email },
      tenant,
    },
  };
}

export function guardRateLimit(
  tenantId: string,
  endpoint: HookRateLimitEndpoint,
): { ok: true; result: RateLimitResult } | { ok: false; response: Response } {
  const result = acquireHookRateLimit(tenantId, endpoint);
  if (!result.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "rate_limited",
          message: result.errorMessage,
          used: result.used,
          limit: result.limit,
          resetsAt: result.resetsAt,
        },
        { status: 429 },
      ),
    };
  }
  return { ok: true, result };
}

// ------------------------------------------------------------
// SSE helpers
// ------------------------------------------------------------

export interface SseEvent {
  type: "start" | "progress" | "result" | "error" | "done";
  [key: string]: unknown;
}

/**
 * Encode a single SSE frame. We use only `data:` frames (no `event:` since
 * the browser EventSource default handler is what the UI listens on).
 */
export function encodeSseFrame(event: SseEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Wrap an async generator of SseEvent objects into a streaming Response.
 *
 * Contract:
 *   - Emits at least a start + done frame around the generator's frames.
 *   - Any thrown error becomes a final `error` frame followed by `done`.
 *   - Never throws to the caller; errors serialize into the stream.
 */
export function sseStream(
  producer: () => AsyncIterable<SseEvent>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const push = (ev: SseEvent) => controller.enqueue(encoder.encode(encodeSseFrame(ev)));
      try {
        push({ type: "start", ts: Date.now() });
        for await (const ev of producer()) {
          push(ev);
        }
        push({ type: "done", ts: Date.now() });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        push({ type: "error", message });
        push({ type: "done", ts: Date.now() });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
