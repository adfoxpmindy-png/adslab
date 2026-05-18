import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { uploadCreative } from "@/lib/creatives/service";
import { resolveUserLocale } from "@/lib/i18n/server";

/**
 * POST /api/creatives/upload?tenantSlug=<slug>
 *
 * Multipart form body:
 *   - file: the image/video to upload
 *   - name (optional): override display name
 *
 * Roles: OWNER + MEDIA_BUYER (CREATIVE can also upload).
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }

  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const name = form.get("name");
  const locale = await resolveUserLocale(session.userId);
  const result = await uploadCreative({
    tenantId: tenant.id,
    file,
    name: typeof name === "string" && name.length > 0 ? name : undefined,
    createdById: session.userId,
    locale,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}

// Vercel's default 4.5MB request body limit applies to standard routes.
// Bump it via runtime config for multipart uploads up to 10MB.
export const runtime = "nodejs";
export const maxDuration = 30;
