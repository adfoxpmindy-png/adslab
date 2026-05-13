import Image from "next/image";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

import { SetupBillingClient } from "./setup-billing-client";

type SearchParams = Promise<{ tenant?: string; reason?: string }>;

export default async function SetupBillingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireSession();
  const { tenant: tenantSlugParam, reason } = await searchParams;

  // Resolve tenant — either from query param (when redirected from
  // a specific tenant) or pick the user's first tenant.
  let tenantSlug = tenantSlugParam;
  if (!tenantSlug) {
    const m = await prisma.tenantMember.findFirst({
      where: { userId: session.userId },
      orderBy: { createdAt: "asc" },
      select: { tenant: { select: { slug: true } } },
    });
    if (!m) redirect("/login");
    tenantSlug = m.tenant.slug;
  }

  // Verify ownership.
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug! },
    select: {
      id: true,
      slug: true,
      name: true,
      members: {
        where: { userId: session.userId, role: "OWNER" },
        select: { id: true },
      },
    },
  });
  if (!tenant || tenant.members.length === 0) {
    redirect("/login");
  }

  // If subscription is already active, bounce back to dashboard.
  const existing = await prisma.tenantSubscription.findUnique({
    where: { tenantId: tenant.id },
  });
  if (existing && ["TRIALING", "ACTIVE"].includes(existing.status)) {
    redirect(`/t/${tenant.slug}/dashboard`);
  }

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="mb-10 flex flex-col items-center">
          <Image
            src="/adslab-logo.png"
            alt="AdsLab"
            width={400}
            height={120}
            priority
            className="h-12 w-auto dark:brightness-0 dark:invert"
          />
          <h1 className="mt-6 text-3xl font-bold tracking-tight">
            เลือกแพ็กเกจที่เหมาะกับคุณ
          </h1>
          <p className="mt-2 text-center text-muted-foreground">
            ทดลองใช้ฟรี 7 วัน • บัตรเครดิตเรียกเก็บอัตโนมัติเมื่อหมดทดลอง • ยกเลิกได้ตลอดเวลา
          </p>
          {reason === "expired" && (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-1.5 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              บัญชีของคุณหมดอายุ — กรุณาเลือกแพ็กเกจเพื่อใช้งานต่อ
            </p>
          )}
          {reason === "suspended" && (
            <p className="mt-3 rounded-md bg-red-50 px-3 py-1.5 text-sm text-red-900 dark:bg-red-950/30 dark:text-red-200">
              บัญชีถูกระงับ — กรุณาอัปเดตวิธีชำระเงิน
            </p>
          )}
        </div>

        <SetupBillingClient
          tenantSlug={tenant.slug}
          tenantName={tenant.name}
          publicKey={process.env.OMISE_PUBLIC_KEY ?? ""}
        />
      </div>
    </main>
  );
}
