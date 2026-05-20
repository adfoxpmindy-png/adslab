import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session";
import { resolveUniqueSlug } from "@/lib/utils/slug";
import { resolveActiveLocale } from "@/lib/i18n/server";

/**
 * POST /api/tenants — create an additional workspace for the authenticated
 * user. Mirrors the tenant-creation half of /api/auth/signup but skips
 * user/password/email-verification because we already have a session.
 *
 * No subscription is created here. The new workspace's first page load
 * will hit `requireActiveSubscription` and redirect the user to
 * `/setup-billing?tenant=<new-slug>` where they pick a plan + add a card,
 * which kicks off a fresh 7-day trial via `startTrial`.
 */
export async function POST(request: NextRequest) {
  const session = await requireSession();
  const locale = await resolveActiveLocale();
  const t = await getTranslations({ locale, namespace: "api.tenants.create" });

  const schema = z.object({
    name: z.string().min(2, t("nameTooShort")).max(64, t("nameTooLong")),
  });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return NextResponse.json(
      { error: t("invalidPayload"), fieldErrors },
      { status: 400 },
    );
  }

  const { name } = parsed.data;

  const slug = await resolveUniqueSlug(name, async (candidate) => {
    const exists = await prisma.tenant.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    return !exists;
  });

  const tenant = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: { name, slug },
    });
    await tx.tenantMember.create({
      data: { userId: session.userId, tenantId: tenant.id, role: "OWNER" },
    });
    return tenant;
  });

  return NextResponse.json(
    {
      ok: true,
      tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
    },
    { status: 201 },
  );
}
