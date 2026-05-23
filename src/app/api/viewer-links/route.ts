import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { generateViewerToken } from "@/lib/viewer-link";

const createSchema = z.object({
  tenantSlug: z.string().min(1),
  scope: z.enum(["ACCOUNT", "CAMPAIGN"]),
  targetId: z.string().min(1),
  dateRange: z.enum(["7d", "14d", "30d"]).optional().default("7d"),
});

function viewerUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ??
    "http://localhost:3000";
  return `${base}/v/${token}`;
}

/**
 * POST /api/viewer-links — create a token-protected share link.
 * Gated to OWNER + MEDIA_BUYER (READ/VIEWER role cannot share).
 */
export async function POST(request: NextRequest) {
  const session = await requireSession();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return NextResponse.json(
      { error: "Invalid payload", fieldErrors },
      { status: 400 },
    );
  }

  const { tenantSlug, scope, targetId, dateRange } = parsed.data;
  const { tenant } = await requireTenantMember(tenantSlug, [
    "OWNER",
    "MEDIA_BUYER",
  ]);

  const token = generateViewerToken();
  const link = await prisma.viewerLink.create({
    data: {
      token,
      tenantId: tenant.id,
      scope,
      targetId,
      dateRange,
      createdById: session.userId,
    },
    select: {
      id: true,
      token: true,
      scope: true,
      targetId: true,
      dateRange: true,
      createdAt: true,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      link,
      url: viewerUrl(link.token),
    },
    { status: 201 },
  );
}

/**
 * GET /api/viewer-links?tenantSlug=<slug> — list links for a tenant.
 * Any member role can list (read-only operation, no PII beyond what
 * the operator chose to share).
 */
export async function GET(request: NextRequest) {
  await requireSession();
  const tenantSlug = request.nextUrl.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json(
      { error: "tenantSlug query param required" },
      { status: 400 },
    );
  }

  const { tenant } = await requireTenantMember(tenantSlug);

  const links = await prisma.viewerLink.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      token: true,
      scope: true,
      targetId: true,
      dateRange: true,
      isActive: true,
      viewCount: true,
      lastViewedAt: true,
      createdAt: true,
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    links: links.map((l) => ({ ...l, url: viewerUrl(l.token) })),
  });
}
