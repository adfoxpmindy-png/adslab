import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { getFreshAccessToken } from "@/lib/meta/client";
import { graphFetch } from "@/lib/meta/graph-api";

const ruleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all-visitors") }),
  z.object({ kind: z.literal("url-contains"), value: z.string().min(1).max(200) }),
  z.object({
    kind: z.literal("event"),
    eventName: z.string().min(1).max(60),
  }),
]);

const bodySchema = z.object({
  metaAccountId: z.string().regex(/^act_/),
  name: z.string().min(1).max(200),
  pixelId: z.string().min(1),
  retentionDays: z.number().int().min(1).max(180),
  rule: ruleSchema,
});

/**
 * POST /api/meta/audiences/website?tenantSlug=<slug>
 *
 * Creates a Website Custom Audience tied to a Meta Pixel. Meta starts
 * matching past + future events immediately; size grows over the
 * retention window.
 *
 * Rule shapes Meta accepts (subset; we expose 3 simple ones):
 *   - all-visitors      → match any pageview
 *   - url-contains:VAL  → match pageviews whose URL contains VAL
 *   - event:EVT         → match pixel events with event_name=EVT
 *
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
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const { metaAccountId, name, pixelId, retentionDays, rule } = parsed.data;

  const accountOwned = await prisma.metaAdAccount.findFirst({
    where: { metaAccountId, connection: { tenantId: tenant.id } },
    select: { id: true },
  });
  if (!accountOwned) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId: tenant.id },
    select: {
      id: true, tenantId: true, accessTokenEncrypted: true, tokenExpiresAt: true,
      metaUserId: true, metaUserName: true, status: true, connectedAt: true, lastSyncedAt: true,
    },
  });
  if (!connection || connection.status !== "ACTIVE") {
    return NextResponse.json({ error: "Connection not active" }, { status: 502 });
  }
  const accessToken = await getFreshAccessToken(connection);

  // Build the Meta rule JSON. The shape is intentionally minimal — Meta's
  // rule schema is huge; we just expose the 3 common cases.
  const filters: Array<Record<string, unknown>> = [];
  if (rule.kind === "url-contains") {
    filters.push({ field: "url", operator: "i_contains", value: rule.value });
  }
  if (rule.kind === "event") {
    filters.push({ field: "event", operator: "eq", value: rule.eventName });
  }
  const retentionSeconds = retentionDays * 86_400;
  const metaRule = {
    inclusions: {
      operator: "or",
      rules: [
        {
          event_sources: [{ id: pixelId, type: "pixel" }],
          retention_seconds: retentionSeconds,
          ...(filters.length > 0 && {
            filter: { operator: "and", filters },
          }),
        },
      ],
    },
  };

  try {
    const res = await graphFetch<{ id: string }>(
      `/${metaAccountId}/customaudiences`,
      {
        method: "POST",
        accessToken,
        body: {
          name,
          subtype: "WEBSITE",
          retention_days: retentionDays,
          rule: JSON.stringify(metaRule),
          pixel_id: pixelId,
        },
      },
    );

    await prisma.audienceCreationLog.create({
      data: {
        tenantId: tenant.id,
        userId: session.userId,
        metaAccountId,
        audienceId: res.id,
        name,
        subtype: "WEBSITE",
        sourceType: "PIXEL_RULE",
        details: { pixelId, retentionDays, rule } as never,
      },
    });

    await prisma.metaInsightCache.deleteMany({
      where: { tenantId: tenant.id, scope: `audiences:${metaAccountId}` },
    });

    return NextResponse.json({ audience: { id: res.id, name } });
  } catch (err) {
    const e = err as Error & { userMessage?: string };
    await prisma.audienceCreationLog.create({
      data: {
        tenantId: tenant.id,
        userId: session.userId,
        metaAccountId,
        name,
        subtype: "WEBSITE",
        sourceType: "PIXEL_RULE",
        errorMessage: e.userMessage ?? e.message,
      },
    });
    return NextResponse.json(
      { error: e.userMessage ?? e.message },
      { status: 502 },
    );
  }
}
