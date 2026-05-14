/**
 * Probe what `fbadcode-Q_...` represents in Meta's API.
 * These look like boost codes from Meta Ads Composer.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

const CODES = [
  "fbadcode-Q_GkBQxe-o0pUU1XMzgu5tDJmMzwEsmB9I2IR5BxJ2XhhPOOoeUO_-yNnGE_FjgiEQ",
  "fbadcode-Q_GkBQyBZA42CITalji3hfvAUvw8uL4MJHzEEcgmfcQuIRG6MieSM3M_qkuMvA6Y4g",
  "fbadcode-Q_GkBQxzubLI6rAbqMJLQXm1wcZziZwE1M_nH0hXJhb_hgHC5f38_KluaPrn3-zbXg",
  "fbadcode-Q_GkBQyMMOQkvpag6gVGtCcRpzcaLZcutvNOBQNSvtuZgBpffv0IDw-iSgDfKeQhAw",
  "fbadcode-Q_GkBQyjNhnG0FFVeEFkCG2ujdR2Tofa-W82CZq-H2HNBjDZyxxnxNUaSYxbHeZ80Q",
];
const ACCOUNT = "act_1006870751067315"; // Digittribe — active + has EV Plaza access

async function probe(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`https://graph.facebook.com/v23.0${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString());
  return { status: res.status, body: await res.json() };
}

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } });
  const conn = await prisma.metaConnection.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  const token = decrypt(conn.accessTokenEncrypted);

  const code = CODES[0];
  console.log(`Probing: ${code}\n`);

  // 1. Try as direct Graph node
  console.log("1. GET /CODE (as direct object)");
  const r1 = await probe(`/${code}`, token);
  console.log(`   status: ${r1.status}`);
  console.log(`   body: ${JSON.stringify(r1.body).slice(0, 400)}\n`);

  // 2. Try with adcode_id field on the ad account
  console.log("2. POST /act_xxx/ads with adcode_id");
  const url = new URL(`https://graph.facebook.com/v23.0/${ACCOUNT}/ads`);
  url.searchParams.set("access_token", token);
  const r2 = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Test boost via adcode",
      status: "PAUSED",
      adcode_id: code,
    }),
  });
  console.log(`   status: ${r2.status}`);
  console.log(`   body: ${JSON.stringify(await r2.json()).slice(0, 500)}\n`);

  // 3. Try POST /act_xxx/ads with boosted_component_id
  console.log("3. POST /act_xxx/ads with boosted_component_id");
  const r3 = await fetch(`https://graph.facebook.com/v23.0/${ACCOUNT}/ads?access_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Test via boosted_component_id",
      status: "PAUSED",
      boosted_component_id: code,
    }),
  });
  console.log(`   status: ${r3.status}`);
  console.log(`   body: ${JSON.stringify(await r3.json()).slice(0, 500)}\n`);

  // 4. Try special boost endpoints
  console.log("4. POST /act_xxx/ads_codes (debug endpoint)");
  const r4 = await fetch(
    `https://graph.facebook.com/v23.0/${ACCOUNT}/ads_codes?ads_codes=${code}&access_token=${token}`,
  );
  console.log(`   status: ${r4.status}`);
  console.log(`   body: ${JSON.stringify(await r4.json()).slice(0, 500)}\n`);

  // 5. Try as boosted_object_id on creative
  console.log("5. POST /act_xxx/adcreatives with boosted_component_id");
  const r5 = await fetch(
    `https://graph.facebook.com/v23.0/${ACCOUNT}/adcreatives?access_token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test via fbadcode",
        boosted_component_id: code,
      }),
    },
  );
  console.log(`   status: ${r5.status}`);
  console.log(`   body: ${JSON.stringify(await r5.json()).slice(0, 500)}\n`);

  await prisma.$disconnect();
}
main().catch(console.error);
