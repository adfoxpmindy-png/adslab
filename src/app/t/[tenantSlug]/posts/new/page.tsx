import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { SetPageTitle } from "@/components/tenant/topbar-page-title";
import { ComposeForm, type PageOption } from "@/components/posts/compose-form";

export default async function NewPostPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant } = await requireTenantMember(tenantSlug);
  const tPages = await getTranslations("pages.postsNew");

  const pageConnection = await prisma.metaPageConnection.findUnique({
    where: { tenantId: tenant.id },
    select: { id: true, status: true },
  });
  if (!pageConnection || pageConnection.status !== "ACTIVE") {
    return (
      <>
        <SetPageTitle title={tPages("title")} />
        <div className="mx-auto w-full max-w-3xl px-6 py-6">
          <Card className="border-dashed p-6 text-center">
            <p className="text-sm">ต้องเชื่อม Page Management ก่อน</p>
            <Link
              href={`/t/${tenantSlug}/settings/integrations`}
              className={cn(buttonVariants({ size: "sm" }), "mt-3")}
            >
              ไปที่ Settings
            </Link>
          </Card>
        </div>
      </>
    );
  }

  const pages = await prisma.metaManagedPage.findMany({
    where: { metaPageConnectionId: pageConnection.id },
    orderBy: { name: "asc" },
    select: { metaPageId: true, name: true, pictureUrl: true },
  });

  const options: PageOption[] = pages.map((p) => ({
    metaPageId: p.metaPageId,
    name: p.name,
    pictureUrl: p.pictureUrl,
  }));

  return (
    <>
      <SetPageTitle title="เขียนโพสต์ใหม่" />
      <div className="mx-auto w-full max-w-3xl space-y-4 px-6 py-6">
        <Link
          href={`/t/${tenantSlug}/posts`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          <ChevronLeft className="size-4" />
          กลับไปลิสต์โพสต์
        </Link>
        <ComposeForm tenantSlug={tenantSlug} pages={options} />
      </div>
    </>
  );
}
