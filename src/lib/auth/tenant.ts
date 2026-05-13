import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session";
import type { Role } from "@/generated/prisma/enums";

export type TenantContext = {
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  role: Role;
};

/**
 * Server component helper.
 * - Requires the user to be signed in (redirects to /login otherwise).
 * - Requires the user to be a member of the tenant identified by `slug`.
 * - If `allowedRoles` is provided, also requires the member's role to be in that list.
 *
 * Returns the tenant and the user's role for that tenant.
 * Calls `notFound()` if the tenant does not exist OR the user is not a member.
 */
// `cache()` dedupes calls within a single render — layout + page can both
// call `requireTenantMember(slug)` but only one DB query is performed.
export const requireTenantMember = cache(
  async (slug: string, allowedRoles?: Role[]): Promise<TenantContext> => {
    const session = await requireSession();

    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        members: {
          where: { userId: session.userId },
          select: { role: true },
          take: 1,
        },
      },
    });

    if (!tenant || tenant.members.length === 0) {
      // Signed-in but not a member of this tenant — common when a user
      // follows a share link to someone else's workspace. Instead of
      // a confusing 404, bounce them to a tenant they ARE in. Falls
      // back to /signup if they somehow have no memberships at all
      // (shouldn't happen via normal signup flow).
      const ownMembership = await prisma.tenantMember.findFirst({
        where: { userId: session.userId },
        orderBy: { createdAt: "asc" },
        select: { tenant: { select: { slug: true } } },
      });
      if (ownMembership) {
        redirect(`/t/${ownMembership.tenant.slug}/dashboard`);
      }
      // Last resort — we don't leak whether the tenant exists.
      notFound();
    }

    const role = tenant.members[0].role;

    if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(role)) {
      // Member but lacks the required role — keep them on the tenant
      // but bounce to the dashboard rather than 404.
      redirect(`/t/${tenant.slug}/dashboard`);
    }

    return {
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      role,
    };
  },
);
