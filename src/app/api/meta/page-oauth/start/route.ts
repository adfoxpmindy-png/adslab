import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { buildPageOAuthUrl, signPageOAuthState } from "@/lib/meta/page-oauth";

/**
 * GET /api/meta/page-oauth/start?tenantSlug=<slug>
 *
 * Mirrors /api/meta/oauth/start but uses the separate "AdsLab Page" Meta
 * app for page-management scopes (pages_manage_posts etc).
 */
export async function GET(request: Request) {
  const session = await requireSession();
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");

  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug query param required" }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: {
      id: true,
      members: {
        where: { userId: session.userId },
        select: { role: true },
        take: 1,
      },
    },
  });

  if (!tenant || tenant.members.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (tenant.members[0].role !== "OWNER") {
    return NextResponse.json({ error: "เฉพาะ OWNER เชื่อมต่อ Page Management ได้" }, { status: 403 });
  }

  const state = signPageOAuthState({ tenantId: tenant.id, userId: session.userId });
  const oauthUrl = buildPageOAuthUrl(state);
  return NextResponse.redirect(oauthUrl, 307);
}
