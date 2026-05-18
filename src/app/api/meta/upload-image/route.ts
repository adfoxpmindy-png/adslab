import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { uploadAdImage } from "@/lib/meta/images";
import { resolveUserLocale } from "@/lib/i18n/server";

/**
 * POST /api/meta/upload-image?tenantSlug=<slug>&metaAccountId=act_xxx
 * Body: multipart/form-data with field `file`
 *
 * Returns { hash, width, height } — pass `hash` into creative `image_hash`.
 *
 * OWNER + MEDIA_BUYER only.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  const metaAccountId = url.searchParams.get("metaAccountId");
  if (!tenantSlug || !metaAccountId) {
    return NextResponse.json(
      { error: "tenantSlug + metaAccountId required" },
      { status: 400 },
    );
  }

  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);
  const locale = await resolveUserLocale(session.userId);

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required (multipart)" }, { status: 400 });
  }

  try {
    const result = await uploadAdImage({
      tenantId: tenant.id,
      metaAccountId,
      file,
      locale,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 },
    );
  }
}
