import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto/aes";
import { syncAdAccounts } from "@/lib/meta/client";
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchMetaUser,
  verifyOAuthState,
} from "@/lib/meta/oauth";

/**
 * GET /api/meta/oauth/callback?code=...&state=...
 *
 * Meta redirects here after the user authorizes (or denies) the app.
 * We:
 *   1. Verify the state cookie/parameter (CSRF protection)
 *   2. Exchange code → short-lived token → long-lived token
 *   3. Fetch the Meta user identity
 *   4. Encrypt + upsert MetaConnection for the tenant
 *   5. Redirect back to the Settings page with success/error flag
 */
export async function GET(request: Request) {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const url = new URL(request.url);

  const error = url.searchParams.get("error");
  if (error) {
    // User clicked "Cancel" on the Meta consent screen, or Meta rejected.
    const reason = url.searchParams.get("error_description") ?? error;
    console.warn("[meta/oauth/callback] user denied:", reason);
    return NextResponse.redirect(`${appUrl}/login?error=${encodeURIComponent("meta_denied")}`, 307);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/login?error=oauth_invalid`, 307);
  }

  let statePayload;
  try {
    statePayload = verifyOAuthState(state);
  } catch (err) {
    console.warn("[meta/oauth/callback] state verification failed:", (err as Error).message);
    return NextResponse.redirect(`${appUrl}/login?error=oauth_state`, 307);
  }

  // Verify tenant + role one more time at callback (state can be old).
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
    const shortLived = await exchangeCodeForToken(code);
    const longLived = await exchangeForLongLivedToken(shortLived.access_token);
    const metaUser = await fetchMetaUser(longLived.access_token);

    const expiresAt = longLived.expires_in
      ? new Date(Date.now() + longLived.expires_in * 1000)
      : null;

    // Upsert: drop any existing connection for this tenant and recreate.
    await prisma.$transaction(async (tx) => {
      await tx.metaConnection.deleteMany({ where: { tenantId: statePayload.tenantId } });
      await tx.metaConnection.create({
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

    // Eagerly pull ad accounts so the settings page renders the table
    // on the first paint. Failures here are non-fatal — user can hit
    // "Sync" manually if it errors.
    let syncFailed = false;
    try {
      await syncAdAccounts(statePayload.tenantId);
    } catch (err) {
      syncFailed = true;
      console.warn("[meta/oauth/callback] initial sync failed:", (err as Error).message);
    }

    const params = new URLSearchParams({ connected: "1" });
    if (syncFailed) params.set("sync_failed", "1");
    return NextResponse.redirect(
      `${appUrl}/t/${tenant.slug}/settings/integrations?${params.toString()}`,
      307,
    );
  } catch (err) {
    console.error("[meta/oauth/callback] token exchange failed:", err);
    return NextResponse.redirect(
      `${appUrl}/t/${tenant.slug}/settings/integrations?error=oauth_exchange`,
      307,
    );
  }
}
