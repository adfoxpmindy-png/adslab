import Link from "next/link";
import { ImagePlus, Sparkles, Video, Image as ImageIcon } from "lucide-react";

import { requireTenantMember } from "@/lib/auth/tenant";
import { SetPageTitle } from "@/components/tenant/topbar-page-title";
import { brandButton, EmptyState, KpiCard, SectionHeader } from "@/components/ui-system";

export default async function CreativesPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  await requireTenantMember(tenantSlug);

  return (
    <>
      <SetPageTitle title="ครีเอทีฟ" subtitle="คลังภาพ + วิดีโอ + AI สร้าง creative" />
      <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-6">
        <SectionHeader
          title="ครีเอทีฟทั้งหมด"
          subtitle="จัดเก็บ + สร้าง creative ที่ใช้ในแคมเปญ"
          actions={
            <>
              <Link
                href={`/t/${tenantSlug}/campaigns/ai-new`}
                className={brandButton({ variant: "outline", size: "md" })}
              >
                <Sparkles className="size-4" />
                สร้างด้วย AI
              </Link>
              <button type="button" className={brandButton({ size: "md" })}>
                <ImagePlus className="size-4" />
                อัปโหลด
              </button>
            </>
          }
        />

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard label="ภาพ" value="0" icon={ImageIcon} tint="brand" />
          <KpiCard label="วิดีโอ" value="0" icon={Video} tint="emerald" />
          <KpiCard label="AI-generated" value="0" icon={Sparkles} tint="amber" />
          <KpiCard label="กำลังใช้ใน ads" value="0" icon={ImagePlus} tint="sky" />
        </div>

        <EmptyState
          icon={ImageIcon}
          title="ยังไม่มี creative ในคลัง"
          description="อัปโหลดรูป/วิดีโอที่ใช้ในแคมเปญ หรือให้ AI สร้างให้ตามรายละเอียดสินค้าของคุณ"
          action={
            <Link
              href={`/t/${tenantSlug}/campaigns/ai-new`}
              className={brandButton({ size: "lg" })}
            >
              <Sparkles className="size-4" />
              ลองสร้างด้วย AI
            </Link>
          }
        />
      </div>
    </>
  );
}
