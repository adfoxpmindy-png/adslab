import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { uploadMediaToBlob } from "@/lib/meta/page-posts";

/**
 * POST /api/posts/upload?tenantSlug=<slug>
 * multipart/form-data with `file` field.
 *
 * Returns: { url, pathname, contentType, sizeBytes }
 */
export async function POST(request: Request) {
  const session = await requireSession();
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
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
  if (role !== "OWNER" && role !== "MEDIA_BUYER") {
    return NextResponse.json({ error: "ไม่มีสิทธิ์" }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file field is required" }, { status: 400 });
  }

  const result = await uploadMediaToBlob({ tenantId: tenant.id, file });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
