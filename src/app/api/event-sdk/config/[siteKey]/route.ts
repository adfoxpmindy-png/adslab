import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { verifySiteKey } from "@/lib/event-sdk/site-key";
import { checkFeature } from "@/lib/billing/gate";

/**
 * GET /api/event-sdk/config/[siteKey]
 *
 * Public endpoint hit by every page load of every customer-installed
 * site. Hot path — must be fast + cacheable.
 *
 * Returns the Pixel ID + enabled rules for the (tenant, pixel) the
 * siteKey represents. The siteKey is HMAC-signed; we verify before
 * any DB lookup to keep forged-key traffic from hitting Postgres.
 *
 * Caching strategy:
 *   - CDN cache 60s (Vercel edge): rule edits propagate within a min
 *   - No auth required — siteKey itself is the credential
 *   - CORS open: SDK runs on customer domains we don't control
 */

const CACHE_SECONDS = 60;

type ConfigResponse = {
  pixelId: string;
  rules: Array<{
    id: string;
    triggerType: string;
    conditions: unknown;
    eventName: string;
    paramsExtractor: unknown;
  }>;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ siteKey: string }> },
) {
  const { siteKey } = await params;
  const decoded = verifySiteKey(siteKey);
  if (!decoded) {
    return NextResponse.json(
      { error: "Invalid site key" },
      { status: 404, headers: corsHeaders() },
    );
  }

  // Phase 9 gate: Event SDK is a paid add-on. If inactive, return an
  // empty rule set so the SDK loads gracefully on customer sites but
  // fires nothing. Logging this anywhere costly would be noisy — silent.
  const gate = await checkFeature(decoded.tenantId, "event-sdk");
  if (!gate.ok) {
    return NextResponse.json(
      { pixelId: decoded.pixelId, rules: [] },
      {
        headers: {
          ...corsHeaders(),
          "Cache-Control": `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
        },
      },
    );
  }

  const rules = await prisma.eventRule.findMany({
    where: {
      tenantId: decoded.tenantId,
      pixelId: decoded.pixelId,
      enabled: true,
    },
    select: {
      id: true,
      triggerType: true,
      conditions: true,
      eventName: true,
      paramsExtractor: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const body: ConfigResponse = {
    pixelId: decoded.pixelId,
    rules: rules.map((r) => ({
      id: r.id,
      triggerType: r.triggerType,
      conditions: r.conditions,
      eventName: r.eventName,
      paramsExtractor: r.paramsExtractor,
    })),
  };

  return NextResponse.json(body, {
    headers: {
      ...corsHeaders(),
      "Cache-Control": `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
    },
  });
}

// OPTIONS for CORS preflight — browsers send this on cross-origin GET
// with non-trivial headers. Cheap to handle.
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}
