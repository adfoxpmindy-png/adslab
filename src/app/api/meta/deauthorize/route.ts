import { type NextRequest, NextResponse } from "next/server";

import { parseSignedRequest } from "@/lib/meta/signed-request";

/**
 * Meta's Deauthorize callback.
 *
 * Triggered when a user removes AdsLab from their Facebook account
 * (Settings → Apps and Websites → AdsLab → Remove). Meta POSTs a
 * `signed_request` (form-encoded) and expects HTTP 200.
 *
 * We use this to invalidate the matching MetaConnection so the user
 * is asked to reconnect before the next API call.
 *
 * See https://developers.facebook.com/docs/development/create-an-app/app-dashboard/install-and-revoke-permissions
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const signedRequest = formData.get("signed_request");

  if (typeof signedRequest !== "string") {
    return NextResponse.json({ error: "signed_request missing" }, { status: 400 });
  }

  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    console.error("[meta/deauthorize] META_APP_SECRET not set");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  let payload;
  try {
    payload = parseSignedRequest(signedRequest, appSecret);
  } catch (err) {
    console.warn("[meta/deauthorize] invalid signed_request:", (err as Error).message);
    return NextResponse.json({ error: "Invalid signed_request" }, { status: 400 });
  }

  // TODO(add-meta-integration Task 3+): when MetaConnection table exists,
  // soft-delete or mark all connections for this Meta user as revoked, so
  // the next API call triggers a reconnect flow. For now, log the event.
  console.log("[meta/deauthorize] received deauthorization", {
    metaUserId: payload.user_id,
    issuedAt: payload.issued_at,
  });

  return NextResponse.json({ ok: true });
}
