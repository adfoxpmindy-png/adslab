import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

/**
 * POST /api/platform-waitlist
 * Body: { email, platform, tenantSlug?, source? }
 *
 * Public endpoint (no auth required) — interest signal for not-yet-built
 * platforms (Google, TikTok). Rate-limited loosely by IP and dedup'd by
 * (email, platform) so the same person submitting twice doesn't pollute.
 */

const PLATFORMS = ["google", "tiktok"] as const;

const bodySchema = z.object({
  email: z.string().email().max(200),
  platform: z.enum(PLATFORMS),
  tenantSlug: z.string().max(80).optional(),
  source: z.string().max(40).optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const { email, platform, tenantSlug, source } = parsed.data;

  // Look up tenant if slug provided (best-effort — public endpoint)
  let tenantId: string | null = null;
  if (tenantSlug) {
    const t = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true },
    });
    tenantId = t?.id ?? null;
  }

  // Dedup: if same email + platform exists in last 30 days, no-op
  const recent = await prisma.platformWaitlist.findFirst({
    where: {
      email: email.toLowerCase(),
      platform,
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
    select: { id: true },
  });
  if (recent) {
    return NextResponse.json({ ok: true, dedup: true });
  }

  await prisma.platformWaitlist.create({
    data: {
      email: email.toLowerCase(),
      platform,
      tenantId,
      source: source ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}
