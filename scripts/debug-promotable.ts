import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

const POSTS = [
  { url: "share/v/1AtdSLKovS", postId: "110409746982988_1015360974392298" },
  { url: "reel/2046794962859921", postId: "110409746982988_2046794962859921" },
  { url: "reel/1002568998876934", postId: "110409746982988_1002568998876934" },
  { url: "reel/994832796325634", postId: "110409746982988_994832796325634" },
];

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } });
  const conn = await prisma.metaConnection.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  // Use stored token directly — refresh only if expired
  const token = decrypt(conn.accessTokenEncrypted);

  for (const p of POSTS) {
    console.log(`\n━━━ ${p.url} (${p.postId}) ━━━`);
    const url = new URL(`https://graph.facebook.com/v23.0/${p.postId}`);
    url.searchParams.set(
      "fields",
      "id,created_time,is_eligible_for_promotion,ineligible_promotion_reasons,is_published,is_expired,is_hidden,promotable_id,type,status_type,from{id,name}",
    );
    url.searchParams.set("access_token", token);
    const res = await fetch(url.toString());
    const body = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      console.log("  ✗ Meta error:", JSON.stringify(body, null, 2));
      continue;
    }
    console.log(`  created: ${body.created_time}`);
    console.log(`  type: ${body.type} / status_type: ${body.status_type}`);
    console.log(`  is_published: ${body.is_published}`);
    console.log(`  is_expired: ${body.is_expired}`);
    console.log(`  is_eligible_for_promotion: ${body.is_eligible_for_promotion}`);
    if (body.ineligible_promotion_reasons) {
      console.log(`  ❗ REASONS: ${JSON.stringify(body.ineligible_promotion_reasons)}`);
    }
    if (body.promotable_id && body.promotable_id !== body.id) {
      console.log(`  ⚠ promotable_id is DIFFERENT: ${body.promotable_id}`);
    }
  }

  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
