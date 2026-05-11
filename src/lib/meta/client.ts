import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto/aes";
import { graphFetch } from "./graph-api";
import { exchangeForLongLivedToken } from "./oauth";
import type {
  MetaAdAccountFromApi,
  MetaPagedResponse,
} from "./types";

// Refresh the long-lived token if it expires within this window (24h).
const TOKEN_REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

type ConnectionRow = {
  id: string;
  tenantId: string;
  accessTokenEncrypted: string;
  tokenExpiresAt: Date | null;
  metaUserId: string;
  metaUserName: string;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
  connectedAt: Date;
  lastSyncedAt: Date | null;
};

/** Load the tenant's Meta connection (or null if none). */
export async function getConnection(tenantId: string): Promise<ConnectionRow | null> {
  return prisma.metaConnection.findUnique({
    where: { tenantId },
    select: {
      id: true,
      tenantId: true,
      accessTokenEncrypted: true,
      tokenExpiresAt: true,
      metaUserId: true,
      metaUserName: true,
      status: true,
      connectedAt: true,
      lastSyncedAt: true,
    },
  });
}

/** Decrypt and (if near expiry) refresh the access token before returning it. */
export async function getFreshAccessToken(connection: ConnectionRow): Promise<string> {
  const token = decrypt(connection.accessTokenEncrypted);

  const needsRefresh =
    connection.tokenExpiresAt !== null &&
    connection.tokenExpiresAt.getTime() - Date.now() < TOKEN_REFRESH_WINDOW_MS;

  if (!needsRefresh) return token;

  try {
    const refreshed = await exchangeForLongLivedToken(token);
    const newExpiresAt = refreshed.expires_in
      ? new Date(Date.now() + refreshed.expires_in * 1000)
      : null;
    await prisma.metaConnection.update({
      where: { id: connection.id },
      data: {
        accessTokenEncrypted: encrypt(refreshed.access_token),
        tokenExpiresAt: newExpiresAt,
      },
    });
    return refreshed.access_token;
  } catch (err) {
    // If refresh fails (e.g. user revoked), mark the connection as expired
    // so the UI can prompt for reconnect. Don't throw — let the caller
    // attempt the API call which will surface a clearer error.
    console.warn("[meta/client] token refresh failed:", (err as Error).message);
    await prisma.metaConnection.update({
      where: { id: connection.id },
      data: { status: "EXPIRED" },
    });
    return token;
  }
}

/** Fetch ALL ad accounts the user has access to (handles pagination). */
export async function fetchAdAccountsFromMeta(accessToken: string): Promise<MetaAdAccountFromApi[]> {
  const results: MetaAdAccountFromApi[] = [];
  let nextUrl: string | null = null;

  // First page via graphFetch
  let page = await graphFetch<MetaPagedResponse<MetaAdAccountFromApi>>("/me/adaccounts", {
    accessToken,
    searchParams: {
      fields: "id,account_id,name,currency,timezone_name,account_status,business{id,name}",
      limit: 100,
    },
  });
  results.push(...page.data);
  nextUrl = page.paging?.next ?? null;

  // Follow `paging.next` URLs directly (they include all query params + cursor).
  while (nextUrl) {
    const res = await fetch(nextUrl);
    if (!res.ok) {
      throw new Error(`Meta paging fetch failed: ${res.status}`);
    }
    page = (await res.json()) as MetaPagedResponse<MetaAdAccountFromApi>;
    results.push(...page.data);
    nextUrl = page.paging?.next ?? null;
  }

  return results;
}

/**
 * Refresh the cached ad accounts for a tenant's Meta connection.
 * Returns the up-to-date list as stored in our DB.
 */
export async function syncAdAccounts(tenantId: string): Promise<{
  accountCount: number;
  lastSyncedAt: Date;
}> {
  const connection = await getConnection(tenantId);
  if (!connection) throw new Error("No Meta connection for tenant");
  if (connection.status !== "ACTIVE") throw new Error(`Connection status is ${connection.status}`);

  const accessToken = await getFreshAccessToken(connection);
  const apiAccounts = await fetchAdAccountsFromMeta(accessToken);

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // Drop previous cache and replace — simpler than diff-and-merge for MVP.
    await tx.metaAdAccount.deleteMany({ where: { metaConnectionId: connection.id } });
    if (apiAccounts.length > 0) {
      await tx.metaAdAccount.createMany({
        data: apiAccounts.map((a) => ({
          metaConnectionId: connection.id,
          metaAccountId: a.id,
          name: a.name,
          currency: a.currency,
          timezoneName: a.timezone_name,
          accountStatus: a.account_status,
          businessId: a.business?.id ?? null,
          businessName: a.business?.name ?? null,
          lastFetchedAt: now,
        })),
      });
    }
    await tx.metaConnection.update({
      where: { id: connection.id },
      data: { lastSyncedAt: now },
    });
  });

  return { accountCount: apiAccounts.length, lastSyncedAt: now };
}

/** Drop the tenant's Meta connection. Cascades to MetaAdAccount via FK. */
export async function disconnectMeta(tenantId: string): Promise<void> {
  await prisma.metaConnection.deleteMany({ where: { tenantId } });
}
