import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";

/**
 * /api/event-rules — tenant-scoped CRUD for SDK event rules.
 *
 * Authenticated endpoints (separate from the public SDK config endpoint).
 * Used by the rule builder UI in /audiences → Events tab.
 */

const STANDARD_EVENTS = [
  "PageView", "ViewContent", "Search", "AddToCart", "AddToWishlist",
  "InitiateCheckout", "AddPaymentInfo", "Purchase", "Lead",
  "CompleteRegistration", "Contact", "CustomizeProduct", "Donate",
  "FindLocation", "Schedule", "StartTrial", "SubmitApplication",
  "Subscribe",
] as const;

// Discriminated union — each trigger type has different condition shape.
const urlCond = z.object({
  op: z.enum(["contains", "equals", "not_contains", "starts_with", "regex"]),
  value: z.string().min(1).max(500),
  fireOnce: z.boolean().optional(),
});
const clickCond = z.object({ selector: z.string().min(1).max(500) });
const formCond = z.object({ selector: z.string().max(500).optional() });
const scrollCond = z.object({ percent: z.number().int().min(1).max(100) });
const timeCond = z.object({ seconds: z.number().int().min(1).max(3600) });
const customCond = z.object({ eventName: z.string().min(1).max(60) });

const triggerSchema = z.discriminatedUnion("triggerType", [
  z.object({ triggerType: z.literal("url"), conditions: urlCond }),
  z.object({ triggerType: z.literal("click"), conditions: clickCond }),
  z.object({ triggerType: z.literal("form_submit"), conditions: formCond }),
  z.object({ triggerType: z.literal("scroll"), conditions: scrollCond }),
  z.object({ triggerType: z.literal("time_on_page"), conditions: timeCond }),
  z.object({ triggerType: z.literal("custom_js"), conditions: customCond }),
]);

const paramExtractor = z.record(
  z.string(),
  z.union([
    z.string(),
    z.number(),
    z.object({
      type: z.enum(["literal", "data_attr", "attr", "text", "form_field", "url_param"]),
      selector: z.string().optional(),
      attr: z.string().optional(),
      name: z.string().optional(),
      value: z.union([z.string(), z.number()]).optional(),
      numeric: z.boolean().optional(),
    }),
  ]),
);

const createSchema = z
  .object({
    name: z.string().min(1).max(120),
    pixelId: z.string().min(1),
    eventName: z.enum(STANDARD_EVENTS),
    paramsExtractor: paramExtractor.optional(),
    enabled: z.boolean().optional().default(true),
  })
  .and(triggerSchema);

/**
 * GET /api/event-rules?tenantSlug=<slug>
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  const { tenant } = await requireTenantMember(tenantSlug);

  const rules = await prisma.eventRule.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ rules });
}

/**
 * POST /api/event-rules?tenantSlug=<slug>
 * OWNER + MEDIA_BUYER only.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);

  const body = await request.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const data = parsed.data;

  const rule = await prisma.eventRule.create({
    data: {
      tenantId: tenant.id,
      createdByUserId: session.userId,
      name: data.name,
      pixelId: data.pixelId,
      triggerType: data.triggerType,
      conditions: data.conditions as never,
      eventName: data.eventName,
      paramsExtractor: (data.paramsExtractor ?? null) as never,
      enabled: data.enabled,
    },
  });
  return NextResponse.json({ rule });
}
