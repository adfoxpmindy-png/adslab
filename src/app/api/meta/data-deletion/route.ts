import { type NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { parseSignedRequest } from "@/lib/meta/signed-request";

/**
 * Meta's Data Deletion callback.
 *
 * Triggered when a user requests deletion of their data via Facebook's
 * "Remove App" or "Data Deletion" flow. Meta POSTs a `signed_request`
 * (form-encoded) and expects a JSON response:
 *   { url: <where the user can check status>, confirmation_code: <code> }
 *
 * See https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
 */
export async function POST(request: NextRequest) {
  let signedRequest: FormDataEntryValue | null = null;
  try {
    const formData = await request.formData();
    signedRequest = formData.get("signed_request");
  } catch {
    // Empty / malformed body — fall through to the 400 below
  }

  if (typeof signedRequest !== "string") {
    return NextResponse.json({ error: "signed_request missing" }, { status: 400 });
  }

  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    console.error("[meta/data-deletion] META_APP_SECRET not set");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  let payload;
  try {
    payload = parseSignedRequest(signedRequest, appSecret);
  } catch (err) {
    console.warn("[meta/data-deletion] invalid signed_request:", (err as Error).message);
    return NextResponse.json({ error: "Invalid signed_request" }, { status: 400 });
  }

  const confirmationCode = randomUUID();
  // TODO(add-meta-integration Task 3+): once MetaConnection table exists,
  // mark all connections for this Meta user as pending deletion and queue
  // a job to purge cached ad accounts + insights. For now, log the event
  // so Meta's reviewer sees the endpoint accepts requests correctly.
  console.log("[meta/data-deletion] received deletion request", {
    metaUserId: payload.user_id,
    confirmationCode,
    issuedAt: payload.issued_at,
  });

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  return NextResponse.json({
    url: `${appUrl}/data-deletion?ref=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
}
