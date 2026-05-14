import { ImagePlus, Image as ImageIcon, Sparkles, Video } from "lucide-react";

import { requireTenantMember } from "@/lib/auth/tenant";
import { SetPageTitle } from "@/components/tenant/topbar-page-title";
import {
  CreativesClient,
  type CreativeListItem,
} from "@/components/tenant/creatives-client";
import { KpiCard } from "@/components/ui-system";
import { countCreatives, listCreatives } from "@/lib/creatives/service";

export default async function CreativesPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant, role } = await requireTenantMember(tenantSlug);
  const canEdit = role === "OWNER" || role === "MEDIA_BUYER";

  const [initial, counts] = await Promise.all([
    listCreatives({ tenantId: tenant.id, limit: 30 }),
    countCreatives(tenant.id),
  ]);

  const items: CreativeListItem[] = initial.items.map((it) => ({
    id: it.id,
    kind: it.kind as "image" | "video",
    name: it.name,
    url: it.url,
    contentType: it.contentType,
    sizeBytes: it.sizeBytes,
    width: it.width,
    height: it.height,
    source: it.source,
    createdAt: it.createdAt.toISOString(),
  }));

  return (
    <>
      <SetPageTitle title="ครีเอทีฟ" subtitle="คลังภาพ + วิดีโอ ที่ใช้ในแคมเปญ" />
      <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard label="ภาพ" value={String(counts.image)} icon={ImageIcon} tint="brand" />
          <KpiCard label="วิดีโอ" value={String(counts.video)} icon={Video} tint="emerald" />
          <KpiCard
            label="สร้างด้วย AI"
            value={String(counts.aiGen)}
            icon={Sparkles}
            tint="amber"
          />
          <KpiCard
            label="ทั้งหมด"
            value={String(counts.image + counts.video)}
            icon={ImagePlus}
            tint="sky"
          />
        </div>

        <CreativesClient
          tenantSlug={tenantSlug}
          canEdit={canEdit}
          initialItems={items}
          initialNextCursor={initial.nextCursor}
        />
      </div>
    </>
  );
}
