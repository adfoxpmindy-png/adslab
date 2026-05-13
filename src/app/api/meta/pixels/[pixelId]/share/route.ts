import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { getFreshAccessToken } from "@/lib/meta/client";
import { graphFetch } from "@/lib/meta/graph-api";

const bodySchema = z.object({
  targetAdAccountId: z.string().regex(/^act_/),
});

/**
 * POST /api/meta/pixels/[pixelId]/share?tenantSlug=<slug>
 * Body: { targetAdAccountId: "act_xxx" }
 *
 * Shares an existing Pixel to another ad account in the same Business
 * Manager. This is the workflow that lets one Pixel power many ad
 * accounts — much more useful than Meta's "1 Pixel per ad account
 * direct attachment" because unverified BMs cap at 5 total Pixels.
 *
 * Both source Pixel and target ad account MUST be in the same BM —
 * Meta rejects cross-BM sharing.
 *
 * OWNER + MEDIA_BUYER only.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ pixelId: string }> },
) {
  const { pixelId } = await params;
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const { targetAdAccountId } = parsed.data;

  const targetAccount = await prisma.metaAdAccount.findFirst({
    where: { metaAccountId: targetAdAccountId, connection: { tenantId: tenant.id } },
    select: { id: true, businessId: true, businessName: true, name: true },
  });
  if (!targetAccount) {
    return NextResponse.json({ error: "Target ad account not found" }, { status: 404 });
  }
  if (!targetAccount.businessId) {
    return NextResponse.json(
      { error: "Target ad account ไม่ได้อยู่ใน Business Manager — Pixel share ใช้ได้กับ BM accounts เท่านั้น" },
      { status: 400 },
    );
  }

  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId: tenant.id },
    select: {
      id: true, tenantId: true, accessTokenEncrypted: true, tokenExpiresAt: true,
      metaUserId: true, metaUserName: true, status: true, connectedAt: true, lastSyncedAt: true,
    },
  });
  if (!connection) return NextResponse.json({ error: "No connection" }, { status: 502 });
  const accessToken = await getFreshAccessToken(connection);

  // Meta expects account_id WITHOUT the "act_" prefix (just the numeric).
  const numericAccountId = targetAdAccountId.replace(/^act_/, "");

  try {
    await graphFetch(`/${pixelId}/shared_accounts`, {
      method: "POST",
      accessToken,
      body: {
        account_id: numericAccountId,
        business: targetAccount.businessId,
      },
    });
    return NextResponse.json({
      ok: true,
      sharedTo: { id: targetAdAccountId, name: targetAccount.name },
    });
  } catch (err) {
    const e = err as Error & { userMessage?: string };
    return NextResponse.json(
      { error: e.userMessage ?? e.message },
      { status: 502 },
    );
  }
}
