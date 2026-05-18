import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { uploadAdImage } from "@/lib/meta/images";
import { resolveUserLocale } from "@/lib/i18n/server";

/**
 * POST /api/creatives/{id}/meta-hash?tenantSlug=<slug>&metaAccountId=act_xxx
 *
 * Turns a library creative into a Meta `image_hash` ready for ad creation.
 * Caches the hash on TenantCreative.metaImageHash so future uses skip the
 * Meta upload entirely.
 *
 * Only meaningful for `kind=image` creatives — Meta video uploads use a
 * different endpoint not supported here yet.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  const metaAccountId = url.searchParams.get("metaAccountId");
  if (!tenantSlug || !metaAccountId) {
    return NextResponse.json(
      { error: "tenantSlug + metaAccountId required" },
      { status: 400 },
    );
  }

  const { id } = await params;
  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);
  const locale = await resolveUserLocale(session.userId);

  const creative = await prisma.tenantCreative.findFirst({
    where: { id, tenantId: tenant.id, deletedAt: null },
    select: {
      id: true,
      kind: true,
      url: true,
      name: true,
      contentType: true,
      metaImageHash: true,
    },
  });
  if (!creative) {
    return NextResponse.json({ error: "creative not found" }, { status: 404 });
  }
  if (creative.kind !== "image") {
    return NextResponse.json(
      { error: "only image creatives can be uploaded as ad image" },
      { status: 400 },
    );
  }

  // Hot cache path: previously uploaded to Meta.
  if (creative.metaImageHash) {
    return NextResponse.json({
      hash: creative.metaImageHash,
      url: creative.url,
      cached: true,
    });
  }

  // Cold path: download from our blob → re-upload to Meta.
  let file: File;
  try {
    const res = await fetch(creative.url);
    if (!res.ok) throw new Error(`fetch failed ${res.status}`);
    const blob = await res.blob();
    file = new File([blob], creative.name, { type: creative.contentType });
  } catch (err) {
    return NextResponse.json(
      { error: `failed to fetch creative: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  try {
    const result = await uploadAdImage({
      tenantId: tenant.id,
      metaAccountId,
      file,
      locale,
    });
    // Persist hash for next time.
    await prisma.tenantCreative.update({
      where: { id: creative.id },
      data: { metaImageHash: result.hash },
    });
    return NextResponse.json({ hash: result.hash, url: creative.url, cached: false });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 },
    );
  }
}

export const runtime = "nodejs";
export const maxDuration = 30;
