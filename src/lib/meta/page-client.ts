/**
 * Page-management Meta connection helpers — mirrors src/lib/meta/client.ts
 * but for MetaPageConnection (separate Meta app, page-only scopes).
 */
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto/aes";
import { graphFetch } from "./graph-api";
import { exchangeForLongLivedPageToken } from "./page-oauth";
import type { MetaPagedResponse } from "./types";

const TOKEN_REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

type PageConnectionRow = {
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

export async function getPageConnection(tenantId: string): Promise<PageConnectionRow | null> {
  return prisma.metaPageConnection.findUnique({
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

export async function getFreshPageAccessToken(connection: PageConnectionRow): Promise<string> {
  const token = decrypt(connection.accessTokenEncrypted);
  const needsRefresh =
    connection.tokenExpiresAt !== null &&
    connection.tokenExpiresAt.getTime() - Date.now() < TOKEN_REFRESH_WINDOW_MS;
  if (!needsRefresh) return token;
  try {
    const refreshed = await exchangeForLongLivedPageToken(token);
    const newExpiresAt = refreshed.expires_in
      ? new Date(Date.now() + refreshed.expires_in * 1000)
      : null;
    await prisma.metaPageConnection.update({
      where: { id: connection.id },
      data: {
        accessTokenEncrypted: encrypt(refreshed.access_token),
        tokenExpiresAt: newExpiresAt,
      },
    });
    return refreshed.access_token;
  } catch (err) {
    console.warn("[meta/page-client] page token refresh failed:", (err as Error).message);
    await prisma.metaPageConnection.update({
      where: { id: connection.id },
      data: { status: "EXPIRED" },
    });
    return token;
  }
}

/**
 * Refresh the list of pages reachable via this connection. Stores
 * page-scoped tokens encrypted on each MetaManagedPage row.
 */
export async function syncManagedPages(tenantId: string): Promise<{ count: number }> {
  const connection = await getPageConnection(tenantId);
  if (!connection) throw new Error("No page-management connection for this tenant");
  if (connection.status !== "ACTIVE") throw new Error(`Connection ${connection.status}`);

  const userToken = await getFreshPageAccessToken(connection);

  type RawPage = {
    id: string;
    name: string;
    category?: string;
    access_token?: string;
    picture?: { data?: { url?: string } };
  };

  const pages: RawPage[] = [];
  let page = await graphFetch<MetaPagedResponse<RawPage>>("/me/accounts", {
    accessToken: userToken,
    searchParams: {
      fields: "id,name,category,access_token,picture.type(square)",
      limit: 100,
    },
  });
  pages.push(...page.data);
  while (page.paging?.next) {
    const res = await fetch(page.paging.next);
    if (!res.ok) break;
    page = (await res.json()) as MetaPagedResponse<RawPage>;
    pages.push(...page.data);
  }

  for (const p of pages) {
    // Fallback: if /me/accounts omitted the page token (happens for
    // some BM configurations), fetch it directly per-page.
    let pageToken = p.access_token;
    if (!pageToken) {
      try {
        const r = await graphFetch<{ access_token?: string }>(`/${p.id}`, {
          accessToken: userToken,
          searchParams: { fields: "access_token" },
        });
        pageToken = r.access_token;
      } catch {
        // Skip pages we can't get a token for — they'll fail later anyway.
        continue;
      }
    }
    if (!pageToken) continue;

    await prisma.metaManagedPage.upsert({
      where: {
        metaPageConnectionId_metaPageId: {
          metaPageConnectionId: connection.id,
          metaPageId: p.id,
        },
      },
      update: {
        name: p.name,
        category: p.category ?? null,
        pictureUrl: p.picture?.data?.url ?? null,
        pageAccessTokenEncrypted: encrypt(pageToken),
        lastFetchedAt: new Date(),
      },
      create: {
        metaPageConnectionId: connection.id,
        metaPageId: p.id,
        name: p.name,
        category: p.category ?? null,
        pictureUrl: p.picture?.data?.url ?? null,
        pageAccessTokenEncrypted: encrypt(pageToken),
      },
    });
  }

  await prisma.metaPageConnection.update({
    where: { id: connection.id },
    data: { lastSyncedAt: new Date() },
  });

  return { count: pages.length };
}

export async function getManagedPageAccessToken(
  tenantId: string,
  metaPageId: string,
): Promise<string> {
  const row = await prisma.metaManagedPage.findFirst({
    where: {
      metaPageId,
      connection: { tenantId },
    },
    select: { pageAccessTokenEncrypted: true },
  });
  if (!row) throw new Error(`Managed page ${metaPageId} not found for tenant`);
  return decrypt(row.pageAccessTokenEncrypted);
}
