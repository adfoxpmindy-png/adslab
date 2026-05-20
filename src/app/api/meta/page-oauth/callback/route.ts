import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto/aes";
import {
  exchangeCodeForPageToken,
  exchangeForLongLivedPageToken,
  fetchPageMetaUser,
  verifyPageOAuthState,
} from "@/lib/meta/page-oauth";
import { syncManagedPages } from "@/lib/meta/page-client";

/**
 * GET /api/meta/page-oauth/callback?code=...&state=...
 *
 * Meta redirects here after the user authorizes the "AdsLab Page" app.
 * Mirrors /api/meta/oauth/callback but writes to MetaPageConnection.
 */
export async function GET(request: Request) {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const url = new URL(request.url);

  const error = url.searchParams.get("error");
  if (error) {
    const reason = url.searchParams.get("error_description") ?? error;
    console.warn("[meta/page-oauth/callback] user denied:", reason);
    return NextResponse.redirect(`${appUrl}/login?error=${encodeURIComponent("meta_page_denied")}`, 307);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/login?error=oauth_invalid`, 307);
  }

  let statePayload;
  try {
    statePayload = verifyPageOAuthState(state);
  } catch (err) {
    console.warn("[meta/page-oauth/callback] state verification failed:", (err as Error).message);
    return NextResponse.redirect(`${appUrl}/login?error=oauth_state`, 307);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: statePayload.tenantId },
    select: {
      slug: true,
      members: {
        where: { userId: statePayload.userId },
        select: { role: true },
        take: 1,
      },
    },
  });
  if (!tenant || tenant.members.length === 0 || tenant.members[0].role !== "OWNER") {
    return NextResponse.redirect(`${appUrl}/login?error=oauth_unauthorized`, 307);
  }

  try {
    const shortLived = await exchangeCodeForPageToken(code);
    const longLived = await exchangeForLongLivedPageToken(shortLived.access_token);
    const metaUser = await fetchPageMetaUser(longLived.access_token);

    const expiresAt = longLived.expires_in
      ? new Date(Date.now() + longLived.expires_in * 1000)
      : null;

    await prisma.$transaction(async (tx) => {
      await tx.metaPageConnection.deleteMany({ where: { tenantId: statePayload.tenantId } });
      await tx.metaPageConnection.create({
        data: {
          tenantId: statePayload.tenantId,
          accessTokenEncrypted: encrypt(longLived.access_token),
          tokenExpiresAt: expiresAt,
          metaUserId: metaUser.id,
          metaUserName: metaUser.name,
          connectedByUserId: statePayload.userId,
          status: "ACTIVE",
        },
      });
    });

    let syncFailed = false;
    try {
      await syncManagedPages(statePayload.tenantId);
    } catch (err) {
      syncFailed = true;
      console.warn("[meta/page-oauth/callback] initial page sync failed:", (err as Error).message);
    }

    const params = new URLSearchParams({ page_connected: "1" });
    if (syncFailed) params.set("sync_failed", "1");
    return NextResponse.redirect(
      `${appUrl}/t/${tenant.slug}/settings/integrations?${params.toString()}`,
      307,
    );
  } catch (err) {
    console.error("[meta/page-oauth/callback] token exchange failed:", err);
    return NextResponse.redirect(
      `${appUrl}/t/${tenant.slug}/settings/integrations?error=page_oauth_exchange`,
      307,
    );
  }
}
