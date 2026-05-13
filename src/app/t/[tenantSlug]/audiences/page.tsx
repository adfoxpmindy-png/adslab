import Link from "next/link";
import { Users } from "lucide-react";

import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { requireTenantMember } from "@/lib/auth/tenant";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { listAudiences } from "@/lib/meta/audiences";
import { cn } from "@/lib/utils";
import { AudiencesClient } from "@/components/tenant/audiences-client";
import { getEffectiveScope } from "@/lib/tenant-scope";

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
      <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-8">
        <header className="flex items-start gap-3">
          <div className="flex size-9 items-center justify-center rounded-md bg-primary/10">
            <Users className="size-5 text-primary" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Audiences</p>
            <h1 className="text-2xl font-semibold tracking-tight">จัดการกลุ่มเป้าหมาย</h1>
          </div>
        </header>
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
    <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-8">
      <header className="flex items-start gap-3">
        <div className="flex size-9 items-center justify-center rounded-md bg-primary/10">
          <Users className="size-5 text-primary" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Audiences</p>
          <h1 className="text-2xl font-semibold tracking-tight">จัดการกลุ่มเป้าหมาย</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            สร้าง Custom Audience จาก customer list, Pixel, หรือ Lookalike — audiences ที่สร้าง
            จะปรากฏใน Campaign Builder ทันที
          </p>
        </div>
      </header>

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
  );
}
