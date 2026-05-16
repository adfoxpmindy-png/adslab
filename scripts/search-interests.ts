/**
 * Search Meta's adinterest taxonomy for valid IDs we can use in targeting.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

const QUERIES = [
  // Audience 1 — families
  "Parenting",
  "Family",
  "Theme parks",
  "Children",
  // Audience 2 — couples / Insta
  "Photography",
  "Instagram",
  "Fashion",
  "Cafe",
  // Audience 3 — travelers
  "Travel",
  "Tourism",
  "Bangkok",
  "Vacations",
];

async function get(p: string, token: string) {
  const url = new URL(`https://graph.facebook.com/v23.0${p}`);
  url.searchParams.set("access_token", token);
  const r = await fetch(url.toString());
  return (await r.json()) as { data?: Array<{ id: string; name: string; audience_size_lower_bound?: number }>; error?: { message: string } };
}

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } });
  const conn = await prisma.metaConnection.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  const token = decrypt(conn.accessTokenEncrypted);

  for (const q of QUERIES) {
    console.log(`\n=== ${q} ===`);
    const res = await get(
      `/search?type=adinterest&q=${encodeURIComponent(q)}&limit=5&locale=th_TH`,
      token,
    );
    if (res.error) {
      console.log("  err:", res.error.message);
      continue;
    }
    const top = (res.data ?? []).slice(0, 3);
    for (const item of top) {
      const size = item.audience_size_lower_bound
        ? `(~${(item.audience_size_lower_bound / 1_000_000).toFixed(1)}M+)`
        : "";
      console.log(`  ${item.id.padEnd(20)} ${item.name} ${size}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
