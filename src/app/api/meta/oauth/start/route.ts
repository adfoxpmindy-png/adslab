import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";

import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { resolveUserLocale } from "@/lib/i18n/server";
import { buildOAuthUrl, signOAuthState } from "@/lib/meta/oauth";

/**
 * GET /api/meta/oauth/start?tenantSlug=<slug>
 *
 * Redirects the user to Meta's OAuth consent screen.
 * Only the tenant OWNER may initiate the connection (Meta tokens are
 * sensitive and connect the agency's Business Manager).
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
    // Same response shape as for a missing tenant — don't leak existence.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (tenant.members[0].role !== "OWNER") {
    const locale = await resolveUserLocale(session.userId);
    const t = await getTranslations({ locale, namespace: "api.meta.oauth" });
    return NextResponse.json({ error: t("ownerOnly") }, { status: 403 });
  }

  const state = signOAuthState({ tenantId: tenant.id, userId: session.userId });
  const oauthUrl = buildOAuthUrl(state);
  return NextResponse.redirect(oauthUrl, 307);
}
