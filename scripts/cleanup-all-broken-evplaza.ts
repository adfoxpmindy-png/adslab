/**
 * Delete all broken EV Plaza campaigns from today's test runs.
 * "Broken" = no ads in Meta + name uses video_id (not real post_id).
 *
 * Keeps:
 * - 4 healthy campaigns with real post_ids in name (1526512..., 1530628...,
 *   1530726..., 1529991...)
 * - 2 older legit campaigns (โพสต์: ..., test madgicx 1)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

const VIDEO_IDS_IN_BROKEN_NAMES = [
  "1015360974392298",
  "2046794962859921",
  "1002568998876934",
  "994832796325634",
];

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const conn = await prisma.metaConnection.findFirstOrThrow({ where: { tenant: { slug: "demo" } } });
  const token = decrypt(conn.accessTokenEncrypted);

  // Find all campaigns whose name contains any of the broken video_ids
  const toDelete = await prisma.metaCampaign.findMany({
    where: {
      metaConnectionId: conn.id,
      OR: VIDEO_IDS_IN_BROKEN_NAMES.map((vid) => ({ name: { contains: vid } })),
    },
    select: { metaCampaignId: true, name: true },
  });
  console.log(`Will delete ${toDelete.length} broken campaigns:\n`);
  for (const c of toDelete) {
    console.log(`  ${c.metaCampaignId} | ${c.name}`);
  }
  console.log();

  let ok = 0;
  let fail = 0;
  for (const c of toDelete) {
    const r = await fetch(
      `https://graph.facebook.com/v23.0/${c.metaCampaignId}?access_token=${token}`,
      { method: "DELETE" },
    );
    const b = (await r.json()) as { success?: boolean; error?: { message: string } };
    if (b.success) {
      ok++;
    } else {
      // Try anyway — might already be deleted
      console.log(`  ${c.metaCampaignId}: ${b.error?.message ?? "?"}`);
      fail++;
    }
    await prisma.metaCampaign.deleteMany({
      where: { metaConnectionId: conn.id, metaCampaignId: c.metaCampaignId },
    });
  }
  console.log(`\nDeleted from Meta: ${ok}/${toDelete.length}`);
  console.log(`(Failed/already gone: ${fail})`);
  console.log(`DB rows removed: ${toDelete.length}`);

  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
