/**
 * Delete 6 broken EV Plaza campaigns (failed adset creation, no ads).
 * From earlier-today AdsLab boost runs before the fixes.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

const IDS = [
  "120245356762810082",
  "120245356763200082",
  "120245356763260082",
  "120245356763350082",
  "120245357423690082",
  "120245357425940082",
];

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const conn = await prisma.metaConnection.findFirstOrThrow({ where: { tenant: { slug: "demo" } } });
  const token = decrypt(conn.accessTokenEncrypted);

  for (const id of IDS) {
    const r = await fetch(`https://graph.facebook.com/v23.0/${id}?access_token=${token}`, { method: "DELETE" });
    const b = (await r.json()) as { success?: boolean; error?: { message: string } };
    console.log(`${id}: Meta ${b.success ? "DELETED" : b.error?.message ?? "?"}`);
    const dbResult = await prisma.metaCampaign.deleteMany({
      where: { metaConnectionId: conn.id, metaCampaignId: id },
    });
    console.log(`  DB removed: ${dbResult.count}`);
  }

  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
