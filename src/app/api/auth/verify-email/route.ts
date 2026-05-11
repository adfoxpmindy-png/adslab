import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { verifyEmailToken } from "@/lib/auth/email-verification";

const schema = z.object({
  token: z.string().min(8),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ status: "invalid" }, { status: 400 });
  }

  const result = await verifyEmailToken(parsed.data.token);
  const status =
    result.status === "success"
      ? 200
      : result.status === "expired" || result.status === "used"
        ? 410
        : 404;
  return NextResponse.json(result, { status });
}
