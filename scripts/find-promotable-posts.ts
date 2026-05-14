import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

const PAGE_ID = "110409746982988";
const TARGET_POSTS = [
  "1015360974392298",
  "2046794962859921",
  "1002568998876934",
  "994832796325634",
];

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } });
  const conn = await prisma.metaConnection.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  const userToken = decrypt(conn.accessTokenEncrypted);

  // 1. Get the Page token for EV Plaza
  console.log("→ Get EV Plaza Page access token");
  let pageToken = "";
  let cursor = "";
  for (let i = 0; i < 5; i++) {
    const url = new URL("https://graph.facebook.com/v23.0/me/accounts");
    url.searchParams.set("fields", "id,name,access_token");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("after", cursor);
    url.searchParams.set("access_token", userToken);
    const res = await fetch(url.toString());
    const body = (await res.json()) as {
      data?: Array<{ id: string; name: string; access_token?: string }>;
      paging?: { cursors?: { after?: string }; next?: string };
    };
    const found = body.data?.find((p) => p.id === PAGE_ID);
    if (found?.access_token) {
      pageToken = found.access_token;
      console.log(`  ✓ Got page token for ${found.name}`);
      break;
    }
    if (!body.paging?.next) break;
    cursor = body.paging.cursors?.after ?? "";
  }
  if (!pageToken) {
    console.log("  ✗ Could not get Page token");
    await prisma.$disconnect();
    return;
  }

  // 2. List promotable_posts on EV Plaza
  console.log("\n→ List EV Plaza's promotable_posts (what Meta says CAN be boosted)");
  const url = new URL(`https://graph.facebook.com/v23.0/${PAGE_ID}/posts`);
  url.searchParams.set(
    "fields",
    "id,created_time,is_eligible_for_promotion,is_published,message,attachments{media_type,title}",
  );
  url.searchParams.set("limit", "30");
  url.searchParams.set("access_token", pageToken);
  const res = await fetch(url.toString());
  const body = (await res.json()) as {
    data?: Array<{
      id: string;
      created_time: string;
      is_eligible_for_promotion?: boolean;
      message?: string;
      attachments?: { data?: Array<{ media_type?: string; title?: string }> };
    }>;
    error?: { message: string };
  };
  if (body.error) {
    console.log(`  ✗ ${body.error.message}`);
    await prisma.$disconnect();
    return;
  }
  const posts = body.data ?? [];
  console.log(`  Got ${posts.length} promotable posts`);

  const promotable = posts.filter((p) => p.is_eligible_for_promotion);
  console.log(`  Eligible: ${promotable.length}/${posts.length}`);

  console.log("\n→ Check the 4 target reels:");
  for (const target of TARGET_POSTS) {
    const match = posts.find((p) => p.id.endsWith("_" + target) || p.id === target);
    if (match) {
      console.log(
        `  ${match.is_eligible_for_promotion ? "✓" : "✗"} ${target}: eligible=${match.is_eligible_for_promotion} created=${match.created_time}`,
      );
    } else {
      console.log(`  ?  ${target}: NOT in promotable_posts list at all`);
    }
  }

  console.log("\n→ First 10 ELIGIBLE posts on EV Plaza (for testing):");
  promotable.slice(0, 10).forEach((p) => {
    const media = p.attachments?.data?.[0]?.media_type ?? "?";
    const msg = (p.message ?? "").slice(0, 50);
    console.log(`  ${p.id} [${media}] ${p.created_time.slice(0, 10)} ${msg}`);
  });

  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
