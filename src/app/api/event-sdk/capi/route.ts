import { NextResponse } from "next/server";
import { createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { verifySiteKey } from "@/lib/event-sdk/site-key";
import { getFreshAccessToken } from "@/lib/meta/client";
import { graphFetch } from "@/lib/meta/graph-api";
import { checkFeature } from "@/lib/billing/gate";

/**
 * POST /api/event-sdk/capi
 *
 * Server-side relay to Meta Conversions API. Mirrors the browser-side
 * Pixel fire so events are counted even when the Pixel is blocked
 * (ad blockers, iOS 14 ATT, etc.). Dedup with the Pixel side via
 * the `eventID` field — same value passed in both calls.
 *
 * Public endpoint (siteKey is the credential). Fire-and-forget from
 * the SDK side via sendBeacon — we return 204 quickly and don't surface
 * errors back. Server-side logging captures failures for the user's
 * debug view.
 */

type Incoming = {
  siteKey?: string;
  ruleId?: string;
  eventName?: string;
  eventId?: string;
  params?: Record<string, unknown>;
  sourceUrl?: string;
  referrer?: string | null;
  userAgent?: string;
  fbp?: string | null;
  fbc?: string | null;
};

const ALLOWED_EVENT_NAMES = new Set([
  "PageView", "ViewContent", "Search", "AddToCart", "AddToWishlist",
  "InitiateCheckout", "AddPaymentInfo", "Purchase", "Lead", "CompleteRegistration",
  "Contact", "CustomizeProduct", "Donate", "FindLocation", "Schedule",
  "StartTrial", "SubmitApplication", "Subscribe",
]);

export async function POST(request: Request) {
  // SDK sends application/json blob via sendBeacon. Parse defensively.
  let body: Incoming = {};
  try {
    body = (await request.json()) as Incoming;
  } catch {
    // Beacon sometimes mangles content-type; try text fallback
    try {
      body = JSON.parse(await request.text()) as Incoming;
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400, headers: cors() });
    }
  }

  // Client IP for Meta CAPI user_data. Vercel populates x-forwarded-for
  // with the original client; we take the leftmost (which is the user).
  const xff = request.headers.get("x-forwarded-for");
  const clientIp =
    (xff ? xff.split(",")[0].trim() : null) ??
    request.headers.get("x-real-ip") ??
    null;

  if (!body.siteKey || !body.eventName || !body.eventId) {
    return NextResponse.json({ error: "siteKey, eventName, eventId required" }, { status: 400, headers: cors() });
  }
  const decoded = verifySiteKey(body.siteKey);
  if (!decoded) {
    return NextResponse.json({ error: "Invalid site key" }, { status: 404, headers: cors() });
  }

  // Phase 9 gate: Event SDK is a paid add-on. When inactive, return 204
  // silently — SDK is fire-and-forget so we don't want to break customer
  // sites. The browser pixel still doesn't fire (config endpoint already
  // returns empty rules) — this is purely a server-side safety net.
  const gate = await checkFeature(decoded.tenantId, "event-sdk");
  if (!gate.ok) {
    return new Response(null, { status: 204, headers: cors() });
  }

  // Only allow Meta standard events for now. Custom names need a different
  // CAPI shape (custom_data.event_name override) — defer until we surface it.
  const eventName = ALLOWED_EVENT_NAMES.has(body.eventName) ? body.eventName : "CustomEvent";

  // Log row first so even if Meta call fails we have an audit trail.
  const log = await prisma.eventLog.create({
    data: {
      tenantId: decoded.tenantId,
      ruleId: body.ruleId ?? null,
      eventName,
      payload: (body.params ?? {}) as never,
      dedupKey: body.eventId,
      capiStatus: "pending",
      browserContext: {
        userAgent: body.userAgent ?? null,
        sourceUrl: body.sourceUrl ?? null,
        referrer: body.referrer ?? null,
        fbp: body.fbp ?? null,
        fbc: body.fbc ?? null,
      } as never,
    },
  });

  // Fire to Meta — best-effort, don't block response longer than ~500ms.
  // Use waitUntil pattern would be nicer, but Vercel handles short async
  // tails fine for now.
  try {
    await sendToMeta(decoded.tenantId, decoded.pixelId, {
      eventName,
      eventId: body.eventId,
      params: body.params ?? {},
      sourceUrl: body.sourceUrl ?? "",
      userAgent: body.userAgent ?? "",
      fbp: body.fbp ?? null,
      fbc: body.fbc ?? null,
      clientIp,
    });
    await prisma.eventLog.update({
      where: { id: log.id },
      data: { capiStatus: "success" },
    });
    if (body.ruleId) {
      await prisma.eventRule.update({
        where: { id: body.ruleId },
        data: { lastFiredAt: new Date(), totalFires: { increment: 1 } },
      }).catch(() => {});
    }
  } catch (err) {
    const e = err as Error & { userMessage?: string };
    await prisma.eventLog.update({
      where: { id: log.id },
      data: {
        capiStatus: "failed",
        capiResponse: { error: e.userMessage ?? e.message } as never,
      },
    });
  }

  return new Response(null, { status: 204, headers: cors() });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: cors() });
}

function cors(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

// ---- Meta CAPI send ------------------------------------------------

async function sendToMeta(
  tenantId: string,
  pixelId: string,
  evt: {
    eventName: string;
    eventId: string;
    params: Record<string, unknown>;
    sourceUrl: string;
    userAgent: string;
    fbp: string | null;
    fbc: string | null;
    clientIp: string | null;
  },
): Promise<void> {
  // Strategy for access token:
  //   1. Prefer a dedicated CapiAccessToken row (System User token) if set
  //   2. Fall back to the user-OAuth token from MetaConnection
  // Long-term we want #1 for stability; #2 works for MVP.
  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId },
    select: {
      id: true,
      tenantId: true,
      accessTokenEncrypted: true,
      tokenExpiresAt: true,
      metaUserId: true,
      metaUserName: true,
      status: true,
      connectedAt: true,
      lastSyncedAt: true,
    },
  });
  if (!connection || connection.status !== "ACTIVE") {
    throw new Error("No active Meta connection for tenant");
  }
  const accessToken = await getFreshAccessToken(connection);

  // Build CAPI event. Spec: https://developers.facebook.com/docs/marketing-api/conversions-api
  // user_data: PII must be hashed (we don't collect raw email/phone in SDK
  // for MVP — _fbp / _fbc cookies + client IP + UA are the identifiers
  // Meta needs for match quality. Without these, Meta rejects with
  // "no customer data parameters".
  const userData: Record<string, unknown> = {};
  if (evt.fbp) userData.fbp = evt.fbp;
  if (evt.fbc) userData.fbc = evt.fbc;
  if (evt.userAgent) userData.client_user_agent = evt.userAgent;
  if (evt.clientIp) userData.client_ip_address = evt.clientIp;

  // Optional value/currency from params — common case for Purchase/Lead
  const customData: Record<string, unknown> = { ...evt.params };

  const payload = {
    data: [
      {
        event_name: evt.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: evt.eventId,
        event_source_url: evt.sourceUrl,
        action_source: "website",
        user_data: userData,
        custom_data: customData,
      },
    ],
  };

  await graphFetch(`/${pixelId}/events`, {
    method: "POST",
    accessToken,
    body: payload,
  });
}

// Currently unused but kept for future PII hashing once we collect
// emails/phones from form fields (Phase 5b enhancement).
export function sha256Hex(s: string): string {
  return createHash("sha256").update(s.trim().toLowerCase()).digest("hex");
}
