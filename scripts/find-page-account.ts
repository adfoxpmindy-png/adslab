/**
 * Across all of user's ad accounts, find which one can promote
 * the EV Plaza Page (110409746982988).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

const TARGET_PAGE_ID = "110409746982988"; // EV Plaza

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } });
  const conn = await prisma.metaConnection.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  const token = decrypt(conn.accessTokenEncrypted);

  // List all ad accounts in our DB
  const accounts = await prisma.metaAdAccount.findMany({
    where: { metaConnectionId: conn.id },
    select: { metaAccountId: true, name: true },
    orderBy: { name: "asc" },
  });
  console.log(`Checking ${accounts.length} ad accounts for EV Plaza access...\n`);

  const matches: Array<{ id: string; name: string; pages: string[] }> = [];
  for (const acc of accounts) {
    const url = new URL(`https://graph.facebook.com/v23.0/${acc.metaAccountId}/promote_pages`);
    url.searchParams.set("fields", "id,name");
    url.searchParams.set("limit", "100");
    url.searchParams.set("access_token", token);
    const res = await fetch(url.toString());
    const body = (await res.json()) as {
      data?: Array<{ id: string; name: string }>;
      error?: { message: string };
    };
    if (body.error) {
      console.log(`  ✗ ${acc.name} (${acc.metaAccountId}): ${body.error.message}`);
      continue;
    }
    const pages = body.data ?? [];
    const found = pages.find((p) => p.id === TARGET_PAGE_ID);
    if (found) {
      console.log(`  ✓ ${acc.name} (${acc.metaAccountId}): ${pages.length} pages, EV Plaza FOUND`);
      matches.push({ id: acc.metaAccountId, name: acc.name, pages: pages.map((p) => p.name) });
    }
  }

  console.log(`\n━━━ RESULT ━━━`);
  console.log(`Accounts that can boost EV Plaza: ${matches.length}`);
  for (const m of matches) {
    console.log(`  → ${m.name} (${m.id})`);
  }

  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
