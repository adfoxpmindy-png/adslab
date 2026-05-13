import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/**
 * Root landing. Most visitors here are either:
 *   1. Logged-in users who typed the bare domain → send them to
 *      their tenant dashboard.
 *   2. Logged-out users following a share link / search result →
 *      send them to /login (which redirects to dashboard on success).
 *
 * A proper marketing landing page can replace this later. For now,
 * a smart redirect is much better than the default Next.js
 * boilerplate that was here before.
 */
export default async function Home() {
  const session = await getSession();
  if (session.userId) {
    const membership = await prisma.tenantMember.findFirst({
      where: { userId: session.userId },
      orderBy: { createdAt: "asc" },
      select: { tenant: { select: { slug: true } } },
    });
    if (membership) {
      redirect(`/t/${membership.tenant.slug}/dashboard`);
    }
  }
  redirect("/login");
}
