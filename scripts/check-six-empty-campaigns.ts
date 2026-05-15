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
    const url = `https://graph.facebook.com/v23.0/${id}?fields=id,name,effective_status,account_id,adsets{id,name,effective_status,ads{id,effective_status}}&access_token=${token}`;
    const r = await fetch(url);
    const b = (await r.json()) as Record<string, unknown> & { adsets?: { data?: Array<{ id: string; name: string; effective_status: string; ads?: { data?: Array<{ id: string }> } }> }; error?: { message: string } };
    if (b.error) {
      console.log(`${id}: ERR ${b.error.message}`);
      continue;
    }
    const adsets = b.adsets?.data ?? [];
    const totalAds = adsets.reduce((s, a) => s + (a.ads?.data?.length ?? 0), 0);
    console.log(`${id} | acct=${b.account_id} | status=${b.effective_status} | adsets=${adsets.length} ads=${totalAds}`);
    console.log(`  ${b.name}`);
  }

  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
