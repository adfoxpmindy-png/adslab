import { NextResponse } from "next/server";

import { runBillingTick } from "@/lib/billing/tick";

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appUrl = process.env.APP_URL ?? "https://ads-lab.xyz";
  const stats = await runBillingTick({ appUrl });
  return NextResponse.json({ ok: true, stats });
}

export const GET = POST;
