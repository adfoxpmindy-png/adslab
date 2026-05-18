import { prisma } from "@/lib/prisma";

/**
 * Per-user, per-tenant ad-account filter. Pages call
 * `getSelectedAccountIds(userId, tenantId)` to scope queries down to
 * the accounts the user has chosen to see.
 *
 * Returns:
 *   - `null` if the user has never set a preference, OR explicitly
 *     selected "all" — meaning "include every account this tenant has"
 *   - `string[]` of metaAccountIds otherwise (may be empty array, which
 *     means "show nothing" — UI should treat this as an empty-state cue)
 *
 * Convention: the caller passes `null` through to Prisma `where` so
 * "no filter" stays simple — see `applyAccountFilter` helper below.
 */
export async function getSelectedAccountIds(
  userId: string,
  tenantId: string,
): Promise<string[] | null> {
  const pref = await prisma.userAccountPreference.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { selectedAccountIds: true },
  });
  if (!pref || pref.selectedAccountIds === null) return null;
  // Stored as JSON; assert shape defensively
  const ids = pref.selectedAccountIds as unknown;
  if (!Array.isArray(ids)) return null;
  const stringIds = ids.filter((x): x is string => typeof x === "string");
  // Treat empty array as "no override" (= follow tenant default). Legacy
  // rows from before Phase 6c persisted [] when the user clicked
  // "clear all"; that produced the dead-end "0 effective accounts"
  // state. New writes set null instead, but normalize on read so
  // existing rows behave consistently with the new picker semantics.
  if (stringIds.length === 0) return null;
  return stringIds;
}

export async function setSelectedAccountIds(
  userId: string,
  tenantId: string,
  ids: string[] | null,
): Promise<void> {
  await prisma.userAccountPreference.upsert({
    where: { userId_tenantId: { userId, tenantId } },
    update: { selectedAccountIds: (ids as unknown) as never },
    create: {
      userId,
      tenantId,
      selectedAccountIds: (ids as unknown) as never,
    },
  });
}

/**
 * Build a Prisma `where` fragment for `metaAccountId`. Use like:
 *
 *   const where = {
 *     ...applyAccountFilter(selectedIds),
 *     tenantId,
 *   };
 *
 * When `selectedIds` is null → no filter applied (= all accounts).
 */
export function applyAccountFilter(
  selectedIds: string[] | null,
): { metaAccountId?: { in: string[] } } {
  if (selectedIds === null) return {};
  return { metaAccountId: { in: selectedIds } };
}
