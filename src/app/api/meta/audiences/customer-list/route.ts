import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { getFreshAccessToken } from "@/lib/meta/client";
import { graphFetch } from "@/lib/meta/graph-api";

const bodySchema = z.object({
  metaAccountId: z.string().regex(/^act_/),
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  // SHA-256 hex strings: 64 chars each
  hashedEmails: z.array(z.string().regex(/^[a-f0-9]{64}$/)).default([]),
  hashedPhones: z.array(z.string().regex(/^[a-f0-9]{64}$/)).default([]),
});

const BATCH_SIZE = 10_000; // Meta /users endpoint max per request
const MIN_TOTAL = 100;

/**
 * POST /api/meta/audiences/customer-list?tenantSlug=<slug>
 *
 * Creates a Custom Audience (subtype=CUSTOM) from a customer list and
 * uploads SHA-256-hashed identifiers. Raw PII NEVER touches our server —
 * client hashes before POSTing.
 *
 * Steps:
 *  1. POST /act_<id>/customaudiences  → creates empty audience
 *  2. POST /<audience_id>/users       → uploads hashed data in batches
 *
 * If step 2 partially fails, the audience still exists in Meta with
 * whatever made it through. We return both audience id and uploaded count.
 *
 * OWNER + MEDIA_BUYER only.
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
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const { metaAccountId, name, description, hashedEmails, hashedPhones } = parsed.data;

  const total = hashedEmails.length + hashedPhones.length;
  if (total < MIN_TOTAL) {
    return NextResponse.json(
      { error: `ต้องมีอย่างน้อย ${MIN_TOTAL} แถว (Meta minimum). ตอนนี้มี ${total}` },
      { status: 400 },
    );
  }

  // Verify ad account ownership.
  const accountOwned = await prisma.metaAdAccount.findFirst({
    where: { metaAccountId, connection: { tenantId: tenant.id } },
    select: { id: true },
  });
  if (!accountOwned) {
    return NextResponse.json({ error: "Ad account not found" }, { status: 404 });
  }

  // Fetch token from the connection.
  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId: tenant.id },
    select: {
      id: true,
      tenantId: true,
      accessTokenEncrypted: true,
      tokenExpiresAt: true,
      metaUserId: true,
      metaUserName: true,
      status: true,
      connectedAt: true,
      lastSyncedAt: true,
    },
  });
  if (!connection || connection.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "Meta connection ไม่พร้อมใช้งาน" },
      { status: 502 },
    );
  }
  const accessToken = await getFreshAccessToken(connection);

  // ---- Step 1: Create empty audience ----
  let audienceId: string;
  try {
    const res = await graphFetch<{ id: string; name: string }>(
      `/${metaAccountId}/customaudiences`,
      {
        method: "POST",
        accessToken,
        body: {
          name,
          description: description ?? "Uploaded via AdsLab",
          subtype: "CUSTOM",
          customer_file_source: "USER_PROVIDED_ONLY",
        },
      },
    );
    audienceId = res.id;
  } catch (err) {
    const e = err as Error & { userMessage?: string };
    await prisma.audienceCreationLog.create({
      data: {
        tenantId: tenant.id,
        userId: session.userId,
        metaAccountId,
        name,
        subtype: "CUSTOM",
        sourceType: "CUSTOMER_LIST",
        errorMessage: e.userMessage ?? e.message,
        details: { totalRows: total } as never,
      },
    });
    return NextResponse.json(
      { error: e.userMessage ?? e.message },
      { status: 502 },
    );
  }

  // ---- Step 2: Upload hashed users in batches ----
  let uploaded = 0;
  let uploadError: string | null = null;
  try {
    // Meta accepts data with `schema` indicating the column types + `data`
    // being a 2D array of values. We do one call per field type.
    if (hashedEmails.length > 0) {
      for (let i = 0; i < hashedEmails.length; i += BATCH_SIZE) {
        const batch = hashedEmails.slice(i, i + BATCH_SIZE);
        await graphFetch(`/${audienceId}/users`, {
          method: "POST",
          accessToken,
          body: {
            payload: {
              schema: "EMAIL_SHA256",
              data: batch.map((h) => [h]),
            },
          },
        });
        uploaded += batch.length;
      }
    }
    if (hashedPhones.length > 0) {
      for (let i = 0; i < hashedPhones.length; i += BATCH_SIZE) {
        const batch = hashedPhones.slice(i, i + BATCH_SIZE);
        await graphFetch(`/${audienceId}/users`, {
          method: "POST",
          accessToken,
          body: {
            payload: {
              schema: "PHONE_SHA256",
              data: batch.map((h) => [h]),
            },
          },
        });
        uploaded += batch.length;
      }
    }
  } catch (err) {
    const e = err as Error & { userMessage?: string };
    uploadError = e.userMessage ?? e.message;
  }

  // ---- Audit log ----
  await prisma.audienceCreationLog.create({
    data: {
      tenantId: tenant.id,
      userId: session.userId,
      metaAccountId,
      audienceId,
      name,
      subtype: "CUSTOM",
      sourceType: "CUSTOMER_LIST",
      sizeAtCreation: uploaded,
      errorMessage: uploadError,
      details: {
        totalRows: total,
        emailRows: hashedEmails.length,
        phoneRows: hashedPhones.length,
      } as never,
    },
  });

  // Invalidate audience cache so the new audience shows up immediately
  await prisma.metaInsightCache.deleteMany({
    where: { tenantId: tenant.id, scope: `audiences:${metaAccountId}` },
  });

  return NextResponse.json({
    audience: { id: audienceId, name },
    usersUploaded: uploaded,
    uploadError,
  });
}
