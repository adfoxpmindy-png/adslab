import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto/aes";
import { getFreshAccessToken } from "./client";
import { graphFetch } from "./graph-api";
import type { MetaPagedResponse } from "./types";

/**
 * Facebook Pages the user manages. Every ad needs a Page to publish "as"
 * — without one, we can't create creatives. /me/accounts returns each
 * Page along with a page-scoped access token (encrypted on store).
 */

type RawPage = {
  id: string;
  name: string;
  category?: string;
  access_token: string;
  picture?: { data?: { url?: string } };
};

/**
 * Refresh the tenant's Page list from Meta. Stores page tokens encrypted.
 * Idempotent — safe to call repeatedly.
 */
export async function syncPages(tenantId: string): Promise<{ count: number }> {
  const connection = await prisma.metaConnection.findUnique({
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
  if (!connection) throw new Error("No Meta connection");
  if (connection.status !== "ACTIVE") throw new Error(`Connection ${connection.status}`);

  const accessToken = await getFreshAccessToken(connection);
  const pages: RawPage[] = [];
  let page = await graphFetch<MetaPagedResponse<RawPage>>("/me/accounts", {
    accessToken,
    searchParams: {
      // picture.type(square) returns a square crop URL — best for avatars.
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

  // Upsert each — keeps existing rows fresh, removes nothing (a page
  // disappearing from /me/accounts usually means the user lost admin
  // access; we keep the row for audit but it will fail at create time).
  for (const p of pages) {
    const pictureUrl = p.picture?.data?.url ?? null;
    await prisma.metaPage.upsert({
      where: {
        metaConnectionId_metaPageId: {
          metaConnectionId: connection.id,
          metaPageId: p.id,
        },
      },
      update: {
        name: p.name,
        category: p.category ?? null,
        pictureUrl,
        pageAccessTokenEncrypted: encrypt(p.access_token),
        lastFetchedAt: new Date(),
      },
      create: {
        metaConnectionId: connection.id,
        metaPageId: p.id,
        name: p.name,
        category: p.category ?? null,
        pictureUrl,
        pageAccessTokenEncrypted: encrypt(p.access_token),
      },
    });
  }

  return { count: pages.length };
}

/**
 * Decrypt and return a page-scoped access token. Used when calling
 * page-specific endpoints (e.g. /<page_id>/promotable_posts) which
 * require a page token, not a user token.
 */
export async function getPageAccessToken(
  tenantId: string,
  metaPageId: string,
): Promise<string> {
  const row = await prisma.metaPage.findFirst({
    where: { metaPageId, connection: { tenantId } },
    select: { pageAccessTokenEncrypted: true },
  });
  if (!row) throw new Error("Page not found for this tenant");
  return decrypt(row.pageAccessTokenEncrypted);
}
