import { NextResponse } from "next/server";

import {
  handleOmiseEvent,
  verifyOmiseSignature,
} from "@/lib/billing/omise/webhook";

export async function POST(req: Request) {
  const secret = process.env.OMISE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "OMISE_WEBHOOK_SECRET not configured" },
      { status: 500 },
    );
  }

  const rawBody = await req.text();
  const sigHeader = req.headers.get("omise-signature");
  const tsHeader = req.headers.get("omise-signature-timestamp");

  if (
    !verifyOmiseSignature({
      rawBody,
      signatureHeader: sigHeader,
      timestampHeader: tsHeader,
      secret,
    })
  ) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    await handleOmiseEvent(event);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[omise webhook]", err);
    // Return 200 anyway — Omise retries on non-2xx, and the error is
    // already logged. We don't want infinite retries on bad events.
    return NextResponse.json({ ok: false, error: (err as Error).message });
  }
}
