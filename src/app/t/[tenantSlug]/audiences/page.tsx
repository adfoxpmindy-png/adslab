import Link from "next/link";

import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { requireTenantMember } from "@/lib/auth/tenant";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { listAudiences } from "@/lib/meta/audiences";
import { cn } from "@/lib/utils";
import { AudiencesClient } from "@/components/tenant/audiences-client";
import { SetPageTitle } from "@/components/tenant/topbar-page-title";
import { getEffectiveScope } from "@/lib/tenant-scope";

const AUDIENCES_SUBTITLE =
  "สร้าง Custom Audience จาก customer list, Pixel, หรือ Lookalike — audiences ที่สร้างจะปรากฏใน Campaign Builder ทันที";

export default async function AudiencesPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const session = await requireSession();
  const { tenant, role } = await requireTenantMember(tenantSlug);
  const scope = await getEffectiveScope(session.userId, tenant.id);
  const selectedIds = scope.accountIds;

  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId: tenant.id },
    select: { id: true, status: true },
  });
  const isConnected = connection !== null && connection.status === "ACTIVE";
  const canEdit = role === "OWNER" || role === "MEDIA_BUYER";

  if (!isConnected) {
    return (
      <>
        <SetPageTitle title="จัดการกลุ่มเป้าหมาย" subtitle={AUDIENCES_SUBTITLE} />
        <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-6">
          <Card className="flex flex-col items-center justify-center gap-3 border-dashed py-12 text-center">
            <p className="text-sm font-medium">ต้องเชื่อมต่อ Meta ก่อนใช้งาน</p>
            <Link
              href={`/t/${tenantSlug}/settings/integrations`}
              className={cn(buttonVariants({ size: "sm" }), "gap-2")}
            >
              ไปที่ Settings
            </Link>
          </Card>
        </div>
      </>
    );
  }

  // Fetch audiences across all active ad accounts (server-side for SSR).
  const accounts = await prisma.metaAdAccount.findMany({
    where: {
      metaConnectionId: connection!.id,
      accountStatus: 1,
      ...(selectedIds !== null ? { metaAccountId: { in: selectedIds } } : {}),
    },
    orderBy: { name: "asc" },
    select: { metaAccountId: true, name: true, businessName: true, businessId: true },
  });

  type AudienceRow = {
    id: string;
    name: string;
    subtype: string;
    approximateCount: number | null;
    description: string | null;
    accountId: string;
    accountName: string;
  };
  const allAudiences: AudienceRow[] = [];
  for (const acc of accounts) {
    try {
      const audiences = await listAudiences(tenant.id, acc.metaAccountId);
      for (const a of audiences) {
        allAudiences.push({
          ...a,
          accountId: acc.metaAccountId,
          accountName: acc.name,
        });
      }
    } catch {
      // skip account on error
    }
  }

  return (
    <>
      <SetPageTitle title="จัดการกลุ่มเป้าหมาย" subtitle={AUDIENCES_SUBTITLE} />
      <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-6">
        <AudiencesClient
          tenantSlug={tenantSlug}
          canEdit={canEdit}
          accounts={accounts.map((a) => ({
            id: a.metaAccountId,
            name: a.name,
            business: a.businessName,
            businessId: a.businessId,
          }))}
          audiences={allAudiences}
        />
      </div>
    </>
  );
}
