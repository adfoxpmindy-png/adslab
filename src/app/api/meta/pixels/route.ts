import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { resolveUserLocale } from "@/lib/i18n/server";
import { getFreshAccessToken } from "@/lib/meta/client";
import { graphFetch } from "@/lib/meta/graph-api";

type RawPixel = {
  id: string;
  name: string;
  code?: string;
  is_unavailable?: boolean;
  last_fired_time?: string;
  creation_time?: string;
  owner_business?: { id: string; name: string };
  owner_ad_account?: { id: string; name: string };
};

/**
 * GET /api/meta/pixels?tenantSlug=<slug>&metaAccountId=<act_xxx>
 *
 * Returns Meta Pixels for an ad account. The `code` field is the
 * JavaScript snippet to install — useful for "copy code" UX.
 *
 * Read-only; no caching (pixels list rarely changes per session).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  const metaAccountId = url.searchParams.get("metaAccountId");
  if (!tenantSlug || !metaAccountId) {
    return NextResponse.json(
      { error: "tenantSlug + metaAccountId required" },
      { status: 400 },
    );
  }
  const { tenant } = await requireTenantMember(tenantSlug);

  const accountOwned = await prisma.metaAdAccount.findFirst({
    where: { metaAccountId, connection: { tenantId: tenant.id } },
    select: { id: true },
  });
  if (!accountOwned) return NextResponse.json({ pixels: [] });

  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId: tenant.id },
    select: {
      id: true, tenantId: true, accessTokenEncrypted: true, tokenExpiresAt: true,
      metaUserId: true, metaUserName: true, status: true, connectedAt: true, lastSyncedAt: true,
    },
  });
  if (!connection) return NextResponse.json({ pixels: [] });
  const accessToken = await getFreshAccessToken(connection);

  try {
    const res = await graphFetch<{ data: RawPixel[] }>(
      `/${metaAccountId}/adspixels`,
      {
        accessToken,
        searchParams: {
          fields:
            "id,name,code,is_unavailable,last_fired_time,creation_time,owner_business{id,name},owner_ad_account{id,name}",
          limit: 50,
        },
      },
    );
    return NextResponse.json({
      pixels: res.data.map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code ?? null,
        isUnavailable: !!p.is_unavailable,
        lastFiredTime: p.last_fired_time ?? null,
        creationTime: p.creation_time ?? null,
        ownerBusiness: p.owner_business
          ? { id: p.owner_business.id, name: p.owner_business.name }
          : null,
        ownerAdAccount: p.owner_ad_account
          ? { id: p.owner_ad_account.id, name: p.owner_ad_account.name }
          : null,
      })),
    });
  } catch (err) {
    const e = err as Error & { userMessage?: string };
    return NextResponse.json(
      { error: e.userMessage ?? e.message, pixels: [] },
      { status: 502 },
    );
  }
}

const createPixelSchema = z.object({
  metaAccountId: z.string().regex(/^act_/),
  name: z.string().min(1).max(120),
});

/**
 * POST /api/meta/pixels?tenantSlug=<slug>
 * Body: { metaAccountId, name }
 *
 * Creates a new Meta Pixel on the ad account. Returns the pixel id +
 * its install code. OWNER + MEDIA_BUYER only.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);

  const body = await request.json().catch(() => ({}));
  const parsed = createPixelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const { metaAccountId, name } = parsed.data;

  const accountOwned = await prisma.metaAdAccount.findFirst({
    where: { metaAccountId, connection: { tenantId: tenant.id } },
    select: { id: true },
  });
  if (!accountOwned) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId: tenant.id },
    select: {
      id: true, tenantId: true, accessTokenEncrypted: true, tokenExpiresAt: true,
      metaUserId: true, metaUserName: true, status: true, connectedAt: true, lastSyncedAt: true,
    },
  });
  if (!connection) return NextResponse.json({ error: "No connection" }, { status: 502 });
  const accessToken = await getFreshAccessToken(connection);

  try {
    // Meta allows only 1 Pixel per ad account. If one already exists,
    // POST /adspixels silently renames it — confusing. Detect first and
    // return a clear error so user can use the existing one instead.
    const existing = await graphFetch<{ data: RawPixel[] }>(
      `/${metaAccountId}/adspixels`,
      {
        accessToken,
        searchParams: { fields: "id,name", limit: 5 },
      },
    );
    if (existing.data.length > 0) {
      const e = existing.data[0];
      const locale = await resolveUserLocale(session.userId);
      const t = await getTranslations({ locale, namespace: "api.meta.pixels" });
      return NextResponse.json(
        {
          error: t("alreadyExists", { name: e.name, id: e.id }),
          existingPixelId: e.id,
        },
        { status: 409 },
      );
    }

    const res = await graphFetch<{ id: string }>(
      `/${metaAccountId}/adspixels`,
      { method: "POST", accessToken, body: { name } },
    );
    // Fetch full detail including owner_business so UI can show user
    // exactly which Business Manager the Pixel landed in.
    const detail = await graphFetch<RawPixel>(`/${res.id}`, {
      accessToken,
      searchParams: {
        fields: "id,name,code,owner_business{id,name},owner_ad_account{id,name}",
      },
    });
    return NextResponse.json({
      pixel: {
        id: detail.id,
        name: detail.name,
        code: detail.code ?? null,
        ownerBusiness: detail.owner_business
          ? { id: detail.owner_business.id, name: detail.owner_business.name }
          : null,
        ownerAdAccount: detail.owner_ad_account
          ? { id: detail.owner_ad_account.id, name: detail.owner_ad_account.name }
          : null,
      },
    });
  } catch (err) {
    const e = err as Error & { userMessage?: string };
    return NextResponse.json(
      { error: e.userMessage ?? e.message },
      { status: 502 },
    );
  }
}
