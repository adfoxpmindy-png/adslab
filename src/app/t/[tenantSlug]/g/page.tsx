import { ComingSoonCard } from "@/components/tenant/coming-soon-card";

export default async function GoogleAdsComingSoonPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-6 py-12">
      <header className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Google Ads</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          เร็วๆ นี้ — Google Ads ใน AdsLab พร้อม dashboard, AI optimization และ
          custom audiences เหมือนที่ Meta มี
        </p>
      </header>
      <ComingSoonCard
        platform="google"
        tenantSlug={tenantSlug}
        title="Google Ads"
        description="ใส่ email เพื่อให้เราแจ้งเมื่อ Google Ads เปิดให้ใช้ — ตอนนี้ทำเฟส Meta ให้แน่นก่อน"
      />
    </div>
  );
}
