import { requireTenantMember } from "@/lib/auth/tenant";
import { requireSession } from "@/lib/auth/session";
import { requireActiveSubscription } from "@/lib/auth/billing-gate";
import { prisma } from "@/lib/prisma";

import { Sidebar } from "@/components/tenant/sidebar";
import { Topbar } from "@/components/tenant/topbar";
import { PlatformBar } from "@/components/tenant/platform-bar";
import { UnverifiedBanner } from "@/components/tenant/unverified-banner";
import { TierLimitBanner } from "@/components/tenant/tier-limit-banner";
import { AIChat } from "@/components/tenant/ai-chat";
import { getTenantScope } from "@/lib/tenant-scope";

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
  // Layer 3: subscription gate. Redirects to /setup-billing if none.
  const subscription = await requireActiveSubscription(tenantSlug);

  // Fetch shell data — user info + all tenants the user belongs to +
  // ad accounts for the platform bar's account picker. The picker shows
  // up on every authenticated page, so loading once here saves N round-
  // trips on subsequent page navigations.
  const [user, memberships, tenantRecord] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, name: true, email: true, emailVerifiedAt: true },
    }),
    prisma.tenantMember.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "asc" },
      select: { tenant: { select: { slug: true, name: true } } },
    }),
    prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: {
        id: true,
        metaConnection: {
          select: {
            id: true,
            adAccounts: {
              where: { accountStatus: 1 },
              orderBy: { name: "asc" },
              select: { metaAccountId: true, name: true },
            },
          },
        },
      },
    }),
  ]);
  const accounts =
    tenantRecord?.metaConnection?.adAccounts.map((a) => ({
      id: a.metaAccountId,
      name: a.name,
    })) ?? [];

  if (!user) {
    // Shouldn't happen — requireSession would have redirected.
    throw new Error("User not found");
  }

  // Tenant scope = the "universe" of accounts this tenant manages.
  // The PlatformBar account picker shows accounts WITHIN this universe
  // so users can't accidentally narrow to accounts outside tenant scope.
  const tenantScope = tenantRecord
    ? await getTenantScope(tenantRecord.id)
    : { accountIds: null, campaignIds: null };
  const inScopeAccounts =
    tenantScope.accountIds === null
      ? accounts
      : accounts.filter((a) => tenantScope.accountIds!.includes(a.id));

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
        <PlatformBar
          tenantSlug={tenantSlug}
          accounts={inScopeAccounts}
          totalAccounts={accounts.length}
          tenantScopeApplied={tenantScope.accountIds !== null}
        />
        {!isVerified && <UnverifiedBanner />}
        <TierLimitBanner
          status={subscription.status}
          planName={subscription.planName}
          trialEndsAt={subscription.trialEndsAt}
          tenantSlug={tenantSlug}
        />
        <main className="flex-1 bg-muted/20">{children}</main>
      </div>
      <AIChat tenantSlug={tenantSlug} />
    </div>
  );
}
