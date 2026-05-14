import { requireTenantMember } from "@/lib/auth/tenant";
import { AIPageClient } from "@/components/tenant/ai-page-client";
import { SetPageTitle } from "@/components/tenant/topbar-page-title";

export default async function AIPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { tenantSlug } = await params;
  const { c } = await searchParams;
  await requireTenantMember(tenantSlug);

  return (
    <>
      <SetPageTitle title="AI Master" subtitle="ผู้ช่วย AI สำหรับวิเคราะห์ + จัดการแคมเปญ" />
      <div className="mx-auto flex h-[calc(100vh-9rem)] w-full max-w-screen-2xl flex-col px-6 py-6">
        <div className="min-h-0 flex-1">
          <AIPageClient
            tenantSlug={tenantSlug}
            initialConversationId={c ?? null}
          />
        </div>
      </div>
    </>
  );
}
