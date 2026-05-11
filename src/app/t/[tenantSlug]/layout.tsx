import { requireTenantMember } from "@/lib/auth/tenant";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

import { Sidebar } from "@/components/tenant/sidebar";
import { Topbar } from "@/components/tenant/topbar";
import { UnverifiedBanner } from "@/components/tenant/unverified-banner";

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;

  // Layer 2 auth: session + tenant membership. Cached so pages can re-call.
  await requireTenantMember(tenantSlug);
  const session = await requireSession();

  // Fetch shell data — user info + all tenants the user belongs to.
  const [user, memberships] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, name: true, email: true, emailVerifiedAt: true },
    }),
    prisma.tenantMember.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "asc" },
      select: { tenant: { select: { slug: true, name: true } } },
    }),
  ]);

  if (!user) {
    // Shouldn't happen — requireSession would have redirected.
    throw new Error("User not found");
  }

  const tenants = memberships.map((m) => m.tenant);
  const isVerified = Boolean(user.emailVerifiedAt);

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar tenantSlug={tenantSlug} />
      <div className="flex flex-1 flex-col">
        <Topbar
          currentTenantSlug={tenantSlug}
          tenants={tenants}
          user={{ name: user.name, email: user.email }}
        />
        {!isVerified && <UnverifiedBanner />}
        <main className="flex-1 bg-muted/20">{children}</main>
      </div>
    </div>
  );
}
