/**
 * For a list of Page IDs, find which ad account can promote each Page.
 *
 * Why this exists: Meta doesn't expose a direct "Page → Ad Accounts"
 * lookup. The only reliable signal is calling /act_xxx/promote_pages
 * for each ad account and seeing if the Page appears.
 *
 * We run all account lookups in parallel and take the first match
 * (which is typically the dedicated ad account in the Page's BM).
 * If a Page has no match across any active ad account, the page is
 * absent from the returned map and the UI must prompt the user to
 * pick manually (or surface a "not connected" warning).
 */
import { prisma } from "@/lib/prisma";

type AccountInfo = { metaAccountId: string; name: string };

export async function resolvePageToAccount(args: {
  metaConnectionId: string;
  pageIds: string[];
  accessToken: string;
}): Promise<Map<string, AccountInfo>> {
  const { metaConnectionId, pageIds, accessToken } = args;
  const wanted = new Set(pageIds);
  if (wanted.size === 0) return new Map();

  // Only consider ACTIVE accounts — Meta rejects ad creation on disabled ones
  // with "เฉพาะบัญชีที่ใช้งานได้เท่านั้นที่จะสามารถสร้างหรือแก้ไขโฆษณาได้"
  const accounts = await prisma.metaAdAccount.findMany({
    where: { metaConnectionId, accountStatus: 1 },
    select: { metaAccountId: true, name: true },
    orderBy: { name: "asc" },
  });

  const result = new Map<string, AccountInfo>();

  // Query all accounts in parallel
  await Promise.all(
    accounts.map(async (acct) => {
      try {
        const url = new URL(
          `https://graph.facebook.com/v23.0/${acct.metaAccountId}/promote_pages`,
        );
        url.searchParams.set("fields", "id");
        url.searchParams.set("limit", "100");
        url.searchParams.set("access_token", accessToken);
        const res = await fetch(url.toString());
        if (!res.ok) return;
        const body = (await res.json()) as { data?: Array<{ id: string }> };
        const pages = body.data ?? [];
        for (const p of pages) {
          if (wanted.has(p.id) && !result.has(p.id)) {
            result.set(p.id, { metaAccountId: acct.metaAccountId, name: acct.name });
          }
        }
      } catch {
        // ignore per-account failures — other accounts may still match
      }
    }),
  );

  return result;
}
