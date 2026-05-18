import Link from "next/link";
import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { SetPageTitle } from "@/components/tenant/topbar-page-title";
import { PostsList, type PostRow } from "@/components/posts/posts-list";
import { listPagePosts } from "@/lib/meta/page-posts";

export default async function PostsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant, role } = await requireTenantMember(tenantSlug);
  const canEdit = role === "OWNER" || role === "MEDIA_BUYER";

  const pageConnection = await prisma.metaPageConnection.findUnique({
    where: { tenantId: tenant.id },
    select: { id: true, status: true, metaUserName: true },
  });
  const isConnected = pageConnection !== null && pageConnection.status === "ACTIVE";
  const tPages = await getTranslations("pages.posts");

  if (!isConnected) {
    return (
      <>
        <SetPageTitle title={tPages("title")} subtitle={tPages("subtitle")} />
        <div className="mx-auto w-full max-w-screen-2xl px-6 py-6">
          <Card className="flex flex-col items-center justify-center gap-3 border-dashed py-12 text-center">
            <p className="text-sm font-medium">ยังไม่ได้เชื่อม Page Management</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              ฟีเจอร์นี้ใช้แอป Meta แยกจากการเชื่อมโฆษณา ต้อง authorize ก่อนใช้งาน
            </p>
            <Link
              href={`/t/${tenantSlug}/settings/integrations`}
              className={cn(buttonVariants({ size: "sm" }), "gap-2")}
            >
              ไปที่ Settings → เชื่อม Page Management
            </Link>
          </Card>
        </div>
      </>
    );
  }

  const posts = await listPagePosts({ tenantId: tenant.id, limit: 50 });
  const rows: PostRow[] = posts.map((p) => ({
    id: p.id,
    metaPageId: p.metaPageId,
    pageName: p.managedPage.name,
    pagePictureUrl: p.managedPage.pictureUrl,
    caption: p.caption,
    mediaUrls: (p.mediaUrls as unknown as string[]) ?? [],
    postKind: p.postKind,
    scheduledAt: p.scheduledAt.toISOString(),
    status: p.status,
    metaPostId: p.metaPostId,
    errorMessage: p.errorMessage,
  }));

  return (
    <>
      <SetPageTitle title={tPages("title")} subtitle={tPages("subtitle")} />
      <div className="mx-auto w-full max-w-screen-2xl space-y-4 px-6 py-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            เชื่อมเป็น {pageConnection.metaUserName}
          </p>
          {canEdit && (
            <Link
              href={`/t/${tenantSlug}/posts/new`}
              className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
            >
              <Plus className="size-3.5" />
              เขียนโพสต์ใหม่
            </Link>
          )}
        </div>
        <PostsList tenantSlug={tenantSlug} rows={rows} canEdit={canEdit} />
      </div>
    </>
  );
}
