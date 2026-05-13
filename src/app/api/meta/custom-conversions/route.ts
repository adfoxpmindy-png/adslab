import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { getFreshAccessToken } from "@/lib/meta/client";
import { graphFetch } from "@/lib/meta/graph-api";

type RawCustomConversion = {
  id: string;
  name: string;
  description?: string;
  pixel?: { id: string; name: string };
  custom_event_type?: string;
  rule?: string;
  default_conversion_value?: number;
  creation_time?: string;
};

/**
 * GET /api/meta/custom-conversions?tenantSlug=<slug>&metaAccountId=<act_xxx>
 *
 * Custom Conversions are Meta's URL-rule-based conversion definitions.
 * They sit on top of a Pixel: the Pixel fires PageView on every page,
 * then Meta server-side matches URLs against the rules to count
 * conversions. No event code on the website needed beyond basic Pixel.
 *
 * Read-only listing. Used by:
 *   - Custom Conversions tab in /audiences
 *   - Campaign Builder conversion picker
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  const metaAccountId = url.searchParams.get("metaAccountId");
  if (!tenantSlug || !metaAccountId) {
    return NextResponse.json(
      { error: "tenantSlug + metaAccountId required" },
      { status: 400 },
    );
  }
  const { tenant } = await requireTenantMember(tenantSlug);

  const owned = await prisma.metaAdAccount.findFirst({
    where: { metaAccountId, connection: { tenantId: tenant.id } },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ conversions: [] });

  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId: tenant.id },
    select: {
      id: true, tenantId: true, accessTokenEncrypted: true, tokenExpiresAt: true,
      metaUserId: true, metaUserName: true, status: true, connectedAt: true, lastSyncedAt: true,
    },
  });
  if (!connection) return NextResponse.json({ conversions: [] });
  const accessToken = await getFreshAccessToken(connection);

  try {
    const res = await graphFetch<{ data: RawCustomConversion[] }>(
      `/${metaAccountId}/customconversions`,
      {
        accessToken,
        searchParams: {
          fields:
            "id,name,description,pixel{id,name},custom_event_type,rule,default_conversion_value,creation_time",
          limit: 100,
        },
      },
    );
    return NextResponse.json({
      conversions: res.data.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description ?? null,
        pixelId: c.pixel?.id ?? null,
        pixelName: c.pixel?.name ?? null,
        customEventType: c.custom_event_type ?? null,
        rule: c.rule ?? null,
        defaultConversionValue: c.default_conversion_value ?? null,
        creationTime: c.creation_time ?? null,
      })),
    });
  } catch (err) {
    const e = err as Error & { userMessage?: string };
    return NextResponse.json(
      { error: e.userMessage ?? e.message, conversions: [] },
      { status: 502 },
    );
  }
}

// Standard event categories Meta accepts for Custom Conversion mapping.
// Custom Conversion uses these as the "category" for campaign optimization.
const STANDARD_EVENTS = [
  "PURCHASE", "ADD_TO_CART", "INITIATE_CHECKOUT", "LEAD",
  "COMPLETE_REGISTRATION", "ADD_PAYMENT_INFO", "VIEW_CONTENT",
  "SEARCH", "SUBSCRIBE", "CONTACT", "ADD_TO_WISHLIST",
  "FIND_LOCATION", "DONATE", "SCHEDULE", "START_TRIAL",
  "SUBMIT_APPLICATION", "CUSTOMIZE_PRODUCT", "OTHER",
] as const;

const createSchema = z.object({
  metaAccountId: z.string().regex(/^act_/),
  pixelId: z.string().min(1),
  name: z.string().min(1).max(120),
  customEventType: z.enum(STANDARD_EVENTS),
  ruleKind: z.enum(["url-contains", "url-equals", "url-not-contains"]),
  ruleValue: z.string().min(1).max(500),
  description: z.string().max(300).optional(),
  defaultConversionValue: z.number().nonnegative().optional(),
});

/**
 * POST /api/meta/custom-conversions?tenantSlug=<slug>
 * Body: { metaAccountId, pixelId, name, customEventType, ruleKind,
 *         ruleValue, description?, defaultConversionValue? }
 *
 * Creates a Custom Conversion mapping URL pattern → standard event
 * category. Once created, the conversion can be used in campaigns as
 * an alternative to standard pixel events.
 *
 * OWNER + MEDIA_BUYER only.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);

  const body = await request.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const {
    metaAccountId, pixelId, name, customEventType,
    ruleKind, ruleValue, description, defaultConversionValue,
  } = parsed.data;

  const owned = await prisma.metaAdAccount.findFirst({
    where: { metaAccountId, connection: { tenantId: tenant.id } },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId: tenant.id },
    select: {
      id: true, tenantId: true, accessTokenEncrypted: true, tokenExpiresAt: true,
      metaUserId: true, metaUserName: true, status: true, connectedAt: true, lastSyncedAt: true,
    },
  });
  if (!connection) return NextResponse.json({ error: "No connection" }, { status: 502 });
  const accessToken = await getFreshAccessToken(connection);

  // Build Meta's URL rule JSON. Operators map:
  //   url-contains      → "i_contains" (case-insensitive contains)
  //   url-equals        → "eq" (exact)
  //   url-not-contains  → "i_not_contains"
  const operator =
    ruleKind === "url-contains" ? "i_contains"
      : ruleKind === "url-equals" ? "eq"
        : "i_not_contains";
  const rule = JSON.stringify({
    url: [{ [operator]: ruleValue.trim() }],
  });

  try {
    const res = await graphFetch<{ id: string }>(
      `/${metaAccountId}/customconversions`,
      {
        method: "POST",
        accessToken,
        body: {
          name,
          pixel_id: pixelId,
          custom_event_type: customEventType,
          rule,
          ...(description ? { description } : {}),
          ...(defaultConversionValue !== undefined
            ? { default_conversion_value: defaultConversionValue }
            : {}),
        },
      },
    );

    // Fetch the new conversion's full record to return
    const detail = await graphFetch<RawCustomConversion>(`/${res.id}`, {
      accessToken,
      searchParams: {
        fields: "id,name,pixel{id,name},custom_event_type,rule",
      },
    });

    return NextResponse.json({
      conversion: {
        id: detail.id,
        name: detail.name,
        pixelId: detail.pixel?.id ?? pixelId,
        pixelName: detail.pixel?.name ?? null,
        customEventType: detail.custom_event_type ?? customEventType,
        rule: detail.rule ?? rule,
      },
    });
  } catch (err) {
    const e = err as Error & { userMessage?: string };
    return NextResponse.json(
      { error: e.userMessage ?? e.message },
      { status: 502 },
    );
  }
}
