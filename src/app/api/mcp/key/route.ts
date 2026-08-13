import { createHash, randomBytes } from "node:crypto";

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { resolveUserLocale } from "@/lib/i18n/server";

/**
 * POST /api/mcp/key?tenantSlug=<slug>   — mint a fresh MCP API key (rotates if one exists)
 * DELETE /api/mcp/key?tenantSlug=<slug> — revoke the current MCP API key
 *
 * Auth: iron-session cookie + OWNER role on the tenant. Any other role
 * returns 403 so a MEDIA_BUYER cannot silently rotate the founder's key.
 *
 * The plaintext key is returned exactly ONCE from POST (never again by any
 * route) — we persist only SHA-256(plaintext) into `Tenant.mcpApiKey`.
 * Same generation shape as `scripts/mcp-issue-key.ts` so the CLI fallback
 * stays interchangeable with self-serve issue.
 */

// Prisma Neon adapter is Node-only and we use `node:crypto` for entropy.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY_PREFIX = "mcpk_live_";
const KEY_BYTES = 32; // 256 bits of entropy

const QuerySchema = z.object({
  tenantSlug: z.string().trim().min(1).max(80),
});

function hashKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

function generateKey(): string {
  return KEY_PREFIX + randomBytes(KEY_BYTES).toString("hex");
}

async function resolveTenantForOwner(request: Request): Promise<
  | { ok: true; tenantId: string; userId: string; locale: Awaited<ReturnType<typeof resolveUserLocale>> }
  | { ok: false; response: NextResponse }
> {
  const session = await requireSession();
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    tenantSlug: url.searchParams.get("tenantSlug") ?? undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "tenantSlug query param required" },
        { status: 400 },
      ),
    };
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: parsed.data.tenantSlug },
    select: {
      id: true,
      members: {
        where: { userId: session.userId },
        select: { role: true },
        take: 1,
      },
    },
  });

  if (!tenant || tenant.members.length === 0) {
    // Do not leak existence of tenants the user isn't in.
    return {
      ok: false,
      response: NextResponse.json({ error: "Not found" }, { status: 404 }),
    };
  }

  const locale = await resolveUserLocale(session.userId);
  if (tenant.members[0].role !== "OWNER") {
    const t = await getTranslations({ locale, namespace: "api.meta.mcp.key" });
    return {
      ok: false,
      response: NextResponse.json({ error: t("ownerOnly") }, { status: 403 }),
    };
  }

  return { ok: true, tenantId: tenant.id, userId: session.userId, locale };
}

export async function POST(request: Request): Promise<NextResponse> {
  const gate = await resolveTenantForOwner(request);
  if (!gate.ok) return gate.response;

  const plaintext = generateKey();
  const hash = hashKey(plaintext);

  await prisma.tenant.update({
    where: { id: gate.tenantId },
    data: { mcpApiKey: hash },
  });

  return NextResponse.json({ key: plaintext }, { status: 201 });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const gate = await resolveTenantForOwner(request);
  if (!gate.ok) return gate.response;

  await prisma.tenant.update({
    where: { id: gate.tenantId },
    data: { mcpApiKey: null },
  });

  return NextResponse.json({ ok: true });
}
