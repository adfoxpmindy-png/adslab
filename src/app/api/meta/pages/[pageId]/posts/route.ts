import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { getPageAccessToken } from "@/lib/meta/pages";
import { graphFetch } from "@/lib/meta/graph-api";
import { resolveUserLocale } from "@/lib/i18n/server";

type RawPost = {
  id: string;
  message?: string;
  created_time: string;
  full_picture?: string;
  permalink_url?: string;
};

/**
 * GET /api/meta/pages/[pageId]/posts?tenantSlug=<slug>
 *
 * Returns posts on this Page that can be promoted as ads (Meta's
 * /promotable_posts endpoint). Uses the PAGE access token (not user
 * token) which is what Meta expects for page-scoped reads.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ pageId: string }> },
) {
  const { pageId } = await params;
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug);

  const pageToken = await getPageAccessToken(tenant.id, pageId);
  const fields = "id,message,created_time,full_picture,permalink_url";

  // Try /promotable_posts first — preferred but not all Pages support it
  // (requires ads-enabled Page). Fall back to /posts (published_posts on
  // legacy versions) if it errors with nonexisting-field.
  for (const endpoint of [`/${pageId}/promotable_posts`, `/${pageId}/posts`]) {
    try {
      const res = await graphFetch<{ data: RawPost[] }>(endpoint, {
        accessToken: pageToken,
        searchParams: { fields, limit: 50 },
      });
      const posts = res.data.map((p) => ({
        id: p.id,
        message: p.message ?? "",
        createdTime: p.created_time,
        thumbnailUrl: p.full_picture ?? null,
        permalinkUrl: p.permalink_url ?? null,
      }));
      return NextResponse.json({ posts, source: endpoint });
    } catch (err) {
      const e = err as Error & { userMessage?: string; code?: number };
      // Only fall through to next endpoint on the "nonexisting field" error.
      // Other errors (auth, rate limit) should bubble up immediately.
      if (e.message?.includes("nonexisting field") || e.message?.includes("nonexistent")) {
        continue;
      }
      return NextResponse.json(
        { error: e.userMessage ?? e.message },
        { status: 502 },
      );
    }
  }

  const locale = await resolveUserLocale(session.userId);
  const t = await getTranslations({ locale, namespace: "api.pagePosts" });
  return NextResponse.json(
    { error: t("adsNotEnabled") },
    { status: 502 },
  );
}
