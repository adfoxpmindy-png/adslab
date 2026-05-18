import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { resolveUserLocale } from "@/lib/i18n/server";
import { prisma } from "@/lib/prisma";
import { schedulePagePost } from "@/lib/meta/page-posts";

const bodySchema = z.object({
  tenantSlug: z.string(),
  metaPageId: z.string().min(1),
  caption: z.string().min(1),
  mediaUrls: z.array(z.string().url()).min(1),
  scheduledAt: z.string().refine((s) => !Number.isNaN(new Date(s).getTime()), {
    message: "scheduledAt must be a valid ISO datetime",
  }),
});

/**
 * POST /api/posts/schedule
 * Body: { tenantSlug, metaPageId, caption, mediaUrls[], scheduledAt }
 */
export async function POST(request: Request) {
  const session = await requireSession();
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: body.tenantSlug },
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
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const role = tenant.members[0].role;
  const locale = await resolveUserLocale(session.userId);
  if (role !== "OWNER" && role !== "MEDIA_BUYER") {
    const t = await getTranslations({ locale, namespace: "api.common" });
    return NextResponse.json({ error: t("forbidden") }, { status: 403 });
  }

  const result = await schedulePagePost({
    tenantId: tenant.id,
    metaPageId: body.metaPageId,
    caption: body.caption,
    mediaUrls: body.mediaUrls,
    scheduledAt: new Date(body.scheduledAt),
    createdByUserId: session.userId,
    locale,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, pagePostId: result.pagePostId }, { status: 400 });
  }
  return NextResponse.json(result);
}
