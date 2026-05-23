import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

export type ViewerLinkScope = "ACCOUNT" | "CAMPAIGN";
export type ViewerLinkDateRange = "7d" | "14d" | "30d";

/**
 * Cryptographically random 128-bit token, base64url-encoded, padding stripped.
 * Result is 22 URL-safe chars (e.g. "kT3p_qX2-rN9aB8cVdEfHj").
 * Sized for LINE/SMS message friendliness while staying un-guessable.
 */
export function generateViewerToken(): string {
  return randomBytes(16).toString("base64url");
}

/**
 * Resolve a viewer token to its link + tenant. Returns null when:
 *   - the token does not exist
 *   - the link has been revoked (isActive=false)
 *
 * Per the spec, a revoked link must be indistinguishable from a never-existed
 * one — callers should `notFound()` on null without leaking that fact.
 *
 * Increments viewCount and updates lastViewedAt as a side effect, in the
 * same atomic UPDATE so concurrent views can't lose increments.
 */
export async function getViewerLinkByToken(token: string) {
  const link = await prisma.viewerLink.findUnique({
    where: { token },
    include: {
      tenant: { select: { id: true, slug: true, name: true } },
    },
  });

  if (!link || !link.isActive) return null;

  // Fire-and-forget counter bump. Not awaited — the page render must not
  // block on this, and a missed increment under load is acceptable.
  prisma.viewerLink
    .update({
      where: { id: link.id },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    })
    .catch(() => {
      // Swallow — viewCount drift is non-fatal.
    });

  return link;
}
