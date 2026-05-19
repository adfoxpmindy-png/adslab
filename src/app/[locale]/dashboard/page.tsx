import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/**
 * `/dashboard` is a common URL users type or get shared even though
 * the real route is `/t/<slug>/dashboard`. Rather than 404, look up
 * the user's first tenant and redirect there. Logged-out users go
 * to /login with a `next` param so they bounce back after auth.
 */
export default async function DashboardRedirect() {
  const session = await getSession();
  if (!session.userId) {
    redirect("/login?next=/dashboard");
  }

  const membership = await prisma.tenantMember.findFirst({
    where: { userId: session.userId },
    orderBy: { createdAt: "asc" },
    select: { tenant: { select: { slug: true } } },
  });
  if (!membership) {
    // Session valid but no tenant yet — drop them at signup to create one.
    // This shouldn't happen via the normal signup flow (we auto-create a
    // tenant), but handles edge cases like a manually-created user row.
    redirect("/signup");
  }

  redirect(`/t/${membership.tenant.slug}/dashboard`);
}
