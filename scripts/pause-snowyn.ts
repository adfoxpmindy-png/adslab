/**
 * EMERGENCY: pause both Snowyn campaigns immediately.
 * Wrong geo (region 3793 = Ukraine?), stop bleed.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

const CAMPS = ["120243957988980714", "120243958001750714"];

async function pause(id: string, token: string) {
  const url = new URL(`https://graph.facebook.com/v23.0/${id}`);
  url.searchParams.set("access_token", token);
  const r = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "PAUSED" }),
  });
  return await r.json();
}

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const t = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } });
  const c = await prisma.metaConnection.findUniqueOrThrow({ where: { tenantId: t.id } });
  const tok = decrypt(c.accessTokenEncrypted);

  // Pause both campaigns in parallel
  const results = await Promise.all(CAMPS.map((id) => pause(id, tok).then((r) => ({ id, r }))));
  for (const { id, r } of results) {
    console.log(`Campaign ${id}: ${JSON.stringify(r)}`);
  }

  await prisma.$disconnect();
}
main().catch(console.error);
