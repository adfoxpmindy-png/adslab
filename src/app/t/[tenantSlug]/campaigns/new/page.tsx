import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";

import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { CampaignBuilderForm } from "@/components/tenant/campaign-builder-form";
import { getTenantScope } from "@/lib/tenant-scope";

export default async function NewCampaignPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant, role } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);

  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId: tenant.id },
    select: { id: true, status: true },
  });
  if (!connection || connection.status !== "ACTIVE") {
    redirect(`/t/${tenantSlug}/campaigns`);
  }

  // Apply tenant scope to the accounts list — Campaign Builder is for
  // the tenant's managed accounts only. Use TenantScope directly (not
  // effective scope) because the builder is OWNER/MEDIA_BUYER work,
  // not the user's personal filter view.
  const tenantScope = await getTenantScope(tenant.id);
  // NOTE: We don't auto-sync Pages here — it slowed page load by ~3s.
  // The form's "Refresh Pages" button calls the API on demand, and the
  // first user who visits any page-related feature triggers the sync.
  const [adAccounts, pages] = await Promise.all([
    prisma.metaAdAccount.findMany({
      where: {
        metaConnectionId: connection!.id,
        accountStatus: 1,
        ...(tenantScope.accountIds !== null
          ? { metaAccountId: { in: tenantScope.accountIds } }
          : {}),
      },
      orderBy: { name: "asc" },
      select: { metaAccountId: true, name: true, currency: true, businessName: true },
    }),
    prisma.metaPage.findMany({
      where: { metaConnectionId: connection!.id },
      orderBy: { name: "asc" },
      select: { metaPageId: true, name: true, category: true, pictureUrl: true },
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-6 py-8">
      <header>
        <Link
          href={`/t/${tenantSlug}/campaigns`}
          className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          กลับไปหน้า Campaigns
        </Link>
        <div className="flex items-start gap-3">
          <div className="flex size-9 items-center justify-center rounded-md bg-primary/10">
            <Plus className="size-5 text-primary" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Stage 3 — Campaign Builder
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">สร้าง Campaign ใหม่</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              สร้าง Campaign → Ad Set → Ad ใน Meta ครั้งเดียวจบ. ทุกตัวจะเริ่มต้นที่ PAUSED ปลอดภัย
            </p>
          </div>
        </div>
      </header>

      {pages.length === 0 ? (
        <Card className="space-y-2 border-amber-300 bg-amber-50 p-5 text-sm dark:bg-amber-950/30">
          <p className="font-medium">ไม่พบ Facebook Page ที่จัดการ</p>
          <p className="text-muted-foreground">
            ทุกโฆษณาต้อง publish &ldquo;in name of&rdquo; Page Facebook. ตรวจสอบว่า user ที่เชื่อม Meta
            เป็น admin/editor ของ Page อย่างน้อย 1 หน้า แล้ว reconnect Meta ใหม่
          </p>
          <Link
            href={`/t/${tenantSlug}/settings/integrations`}
            className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
          >
            ไปที่ Settings
          </Link>
        </Card>
      ) : adAccounts.length === 0 ? (
        <Card className="border-amber-300 bg-amber-50 p-5 text-sm dark:bg-amber-950/30">
          <p>ไม่พบ ad account ที่ active. ตรวจสอบ Meta Business Manager</p>
        </Card>
      ) : (
        <CampaignBuilderForm
          tenantSlug={tenantSlug}
          adAccounts={adAccounts.map((a) => ({
            id: a.metaAccountId,
            name: a.name,
            currency: a.currency,
            business: a.businessName,
          }))}
          pages={pages.map((p) => ({
            id: p.metaPageId,
            name: p.name,
            category: p.category,
            pictureUrl: p.pictureUrl,
          }))}
          canEdit={role === "OWNER" || role === "MEDIA_BUYER"}
        />
      )}
    </div>
  );
}
