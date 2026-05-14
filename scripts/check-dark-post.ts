import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

const POSTS = [
  { label: "Original reel user provided", id: "110409746982988_1015360974392298" },
  { label: "Dark post Meta auto-created (Ad creative)", id: "110409746982988_1532781748639175" },
  { label: "Video id from ad creative (new, not user's reel)", id: "963138726450217" },
];

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } });
  const conn = await prisma.metaConnection.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  const userToken = decrypt(conn.accessTokenEncrypted);

  // Get EV Plaza Page token
  let pageToken = "";
  let cursor = "";
  for (let i = 0; i < 5; i++) {
    const url = new URL("https://graph.facebook.com/v23.0/me/accounts");
    url.searchParams.set("fields", "id,access_token");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("after", cursor);
    url.searchParams.set("access_token", userToken);
    const res = await fetch(url.toString());
    const body = (await res.json()) as {
      data?: Array<{ id: string; access_token?: string }>;
      paging?: { cursors?: { after?: string } };
    };
    const f = body.data?.find((p) => p.id === "110409746982988");
    if (f?.access_token) {
      pageToken = f.access_token;
      break;
    }
    if (!body.paging?.cursors?.after) break;
    cursor = body.paging.cursors.after;
  }

  for (const p of POSTS) {
    console.log(`\n━━━ ${p.label}`);
    console.log(`    id: ${p.id}`);
    const url = new URL(`https://graph.facebook.com/v23.0/${p.id}`);
    url.searchParams.set(
      "fields",
      "id,created_time,permalink_url,is_published,is_hidden,from{id,name}",
    );
    url.searchParams.set("access_token", pageToken || userToken);
    const res = await fetch(url.toString());
    console.log(`    HTTP: ${res.status}`);
    const body = await res.json();
    console.log(`    ${JSON.stringify(body, null, 2).slice(0, 600)}`);
  }

  await prisma.$disconnect();
}
main().catch(console.error);
