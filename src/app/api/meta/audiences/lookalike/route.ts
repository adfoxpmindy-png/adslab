import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { getFreshAccessToken } from "@/lib/meta/client";
import { graphFetch } from "@/lib/meta/graph-api";

const bodySchema = z.object({
  metaAccountId: z.string().regex(/^act_/),
  name: z.string().min(1).max(200),
  /** Source = existing custom audience id (Meta digit string). */
  sourceAudienceId: z.string().min(1),
  /** ISO country code (Thailand default: "TH"). */
  country: z.string().length(2),
  /** Similarity 0.01-0.20 — 0.01=most similar, 0.20=broadest. */
  ratio: z.number().min(0.01).max(0.2),
});

/**
 * POST /api/meta/audiences/lookalike?tenantSlug=<slug>
 *
 * Creates a Lookalike audience from an existing custom audience.
 * Meta computes the lookalike asynchronously — initial size will be 0,
 * Meta will populate it within ~6 hours.
 *
 * For Page-based lookalikes (lookalike from people who engaged a Page),
 * the lookalike_spec shape is different — defer to v2.
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
  const { metaAccountId, name, sourceAudienceId, country, ratio } = parsed.data;

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

  try {
    const res = await graphFetch<{ id: string }>(
      `/${metaAccountId}/customaudiences`,
      {
        method: "POST",
        accessToken,
        body: {
          name,
          subtype: "LOOKALIKE",
          origin_audience_id: sourceAudienceId,
          // Stringified JSON per Meta's expectation
          lookalike_spec: JSON.stringify({
            type: "similarity",
            country: country.toUpperCase(),
            ratio,
          }),
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
        subtype: "LOOKALIKE",
        sourceType: "LOOKALIKE_FROM_AUDIENCE",
        details: {
          sourceAudienceId,
          country: country.toUpperCase(),
          ratio,
        } as never,
      },
    });

    await prisma.metaInsightCache.deleteMany({
      where: { tenantId: tenant.id, scope: `audiences:${metaAccountId}` },
    });

    return NextResponse.json({
      audience: { id: res.id, name },
      note: "Meta จะคำนวณ Lookalike ภายใน ~6 ชั่วโมง — size จะเริ่มจาก 0 แล้วเพิ่มขึ้น",
    });
  } catch (err) {
    const e = err as Error & { userMessage?: string };
    await prisma.audienceCreationLog.create({
      data: {
        tenantId: tenant.id,
        userId: session.userId,
        metaAccountId,
        name,
        subtype: "LOOKALIKE",
        sourceType: "LOOKALIKE_FROM_AUDIENCE",
        errorMessage: e.userMessage ?? e.message,
      },
    });
    return NextResponse.json(
      { error: e.userMessage ?? e.message },
      { status: 502 },
    );
  }
}
