/**
 * Smoke test the URL resolver against the founder's real client message.
 * Uses the demo tenant's Meta connection.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";
import { resolveAllUrls, extractUrls } from "../src/lib/meta/url-resolver";

const PROMPT = `บูสต์วีดีโอให้หน่อยครัย เป็น Views โพสละ 1250 บาท ให้จบพรุ่งนี้ 10.00 น.

https://www.facebook.com/share/v/1AtdSLKovS/
https://www.facebook.com/reel/2046794962859921
https://www.facebook.com/reel/1002568998876934
https://www.facebook.com/reel/994832796325634`;

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { slug: "demo" },
    include: { metaConnection: true },
  });
  if (!tenant.metaConnection) {
    console.log("✗ demo tenant has no Meta connection");
    await prisma.$disconnect();
    return;
  }
  const accessToken = decrypt(tenant.metaConnection.accessTokenEncrypted);

  // Step 1: URL extraction
  const urls = extractUrls(PROMPT);
  console.log(`Extracted ${urls.length} URLs:`);
  urls.forEach((u) => console.log(`  - ${u}`));

  // Step 2: Resolve each
  console.log("\n→ Resolving via Meta Graph API...\n");
  const { resolved, errors } = await resolveAllUrls({ urls, accessToken });

  for (const r of resolved) {
    console.log(`✓ ${r.originalUrl}`);
    console.log(`  Page: ${r.pageName} (${r.pageId})`);
    console.log(`  Post ID (boostable): ${r.postId}`);
    console.log(`  Media: ${r.mediaType}`);
    console.log(`  Permalink: ${r.permalinkUrl}`);
    console.log("");
  }
  for (const e of errors) {
    console.log(`✗ ${e.originalUrl}`);
    console.log(`  Error: ${e.error}`);
    console.log("");
  }

  console.log(`Resolved: ${resolved.length}/${urls.length}`);

  // Step 3: For each resolved post, find the matching ad account
  if (resolved.length > 0) {
    console.log("\n→ Mapping Pages to Ad Accounts...\n");
    const pageIds = Array.from(new Set(resolved.map((r) => r.pageId)));
    const pages = await prisma.metaPage.findMany({
      where: {
        metaConnectionId: tenant.metaConnection.id,
        metaPageId: { in: pageIds },
      },
      select: { metaPageId: true, name: true },
    });
    const knownPageIds = new Set(pages.map((p) => p.metaPageId));
    const accounts = await prisma.metaAdAccount.findMany({
      where: { metaConnectionId: tenant.metaConnection.id, accountStatus: 1 },
      select: { metaAccountId: true, name: true, businessId: true, businessName: true },
    });

    for (const r of resolved) {
      const knownPage = knownPageIds.has(r.pageId);
      console.log(`Post for Page "${r.pageName}" (${r.pageId})`);
      console.log(`  Page is in our MetaPage cache: ${knownPage ? "✓" : "✗ — need page sync"}`);
      if (accounts.length > 0) {
        // First-account fallback: pick the first active account.
        // Real product will let user pick; this just confirms wiring.
        console.log(`  Default account: ${accounts[0].name} (${accounts[0].metaAccountId})`);
      }
      console.log("");
    }
  }

  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
