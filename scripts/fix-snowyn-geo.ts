/**
 * Fix the wrong geo (3793, which is not Thailand) → Bangkok region 3586.
 * Update all 6 adsets, then resume both campaigns.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

const REACH_CAMP = "120243957988980714";
const ENGAGE_CAMP = "120243958001750714";

async function get(p: string, tok: string) {
  const u = new URL(`https://graph.facebook.com/v23.0${p}`);
  u.searchParams.set("access_token", tok);
  return (await (await fetch(u.toString())).json()) as Record<string, unknown>;
}

async function post(p: string, tok: string, body: object) {
  const u = new URL(`https://graph.facebook.com/v23.0${p}`);
  u.searchParams.set("access_token", tok);
  const r = await fetch(u.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await r.json()) as { success?: boolean; id?: string; error?: { message: string; error_user_msg?: string } };
}

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const t = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } });
  const c = await prisma.metaConnection.findUniqueOrThrow({ where: { tenantId: t.id } });
  const tok = decrypt(c.accessTokenEncrypted);

  // 1. List all adsets in both campaigns
  const adsets: Array<{ id: string; name: string; targeting: Record<string, unknown> }> = [];
  for (const camp of [REACH_CAMP, ENGAGE_CAMP]) {
    const res = (await get(
      `/${camp}/adsets?fields=id,name,targeting&limit=10`,
      tok,
    )) as { data?: Array<{ id: string; name: string; targeting: Record<string, unknown> }> };
    if (res.data) adsets.push(...res.data);
  }
  console.log(`Found ${adsets.length} adsets to fix\n`);

  // 2. For each, patch targeting.geo_locations to use Bangkok region 3586
  let okCount = 0;
  for (const a of adsets) {
    const newTargeting = {
      ...a.targeting,
      geo_locations: {
        regions: [{ key: "3586" }],
        location_types: ["home", "recent"],
      },
    };
    const res = await post(`/${a.id}`, tok, { targeting: newTargeting });
    if (res.success || res.id) {
      console.log(`  ✓ ${a.name}`);
      okCount++;
    } else {
      console.log(`  ✗ ${a.name}: ${res.error?.error_user_msg ?? res.error?.message}`);
    }
  }
  console.log(`\n${okCount}/${adsets.length} adsets updated`);

  if (okCount !== adsets.length) {
    console.log("Some failed — NOT resuming campaigns. Investigate before un-pausing.");
    await prisma.$disconnect();
    return;
  }

  // 3. Resume both campaigns
  console.log("\nResuming campaigns...");
  for (const camp of [REACH_CAMP, ENGAGE_CAMP]) {
    const r = await post(`/${camp}`, tok, { status: "ACTIVE" });
    console.log(`  ${camp}: ${r.success ? "ACTIVE" : JSON.stringify(r.error)}`);
  }

  await prisma.$disconnect();
}
main().catch(console.error);
