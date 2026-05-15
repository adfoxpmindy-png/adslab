/**
 * Activate the 4 boost campaigns + their adsets + ads.
 *
 * Real money flows starting now — total budget ฿5,000 (1,250×4)
 * lifetime, ends 2026-05-15 10:00 BKK per user's original prompt.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

const CAMPAIGNS = [
  "120248170751790166",
  "120248170752940166",
  "120248170753020166",
  "120248170753080166",
];

async function activate(id: string, level: string, token: string) {
  const url = new URL(`https://graph.facebook.com/v23.0/${id}`);
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "ACTIVE" }),
  });
  const body = (await res.json()) as { success?: boolean; error?: { message: string } };
  return { ok: res.ok && body.success, error: body.error?.message };
}

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } });
  const conn = await prisma.metaConnection.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  const token = decrypt(conn.accessTokenEncrypted);

  for (const campId of CAMPAIGNS) {
    console.log(`\n━━━ Campaign ${campId} ━━━`);

    // Get adset + ad ids
    const adsetRes = await fetch(
      `https://graph.facebook.com/v23.0/${campId}/adsets?fields=id&access_token=${token}`,
    );
    const adsetBody = (await adsetRes.json()) as { data?: Array<{ id: string }> };
    const adset = adsetBody.data?.[0];
    if (!adset) {
      console.log("  ✗ no adset");
      continue;
    }
    const adRes = await fetch(
      `https://graph.facebook.com/v23.0/${adset.id}/ads?fields=id&access_token=${token}`,
    );
    const adBody = (await adRes.json()) as { data?: Array<{ id: string }> };
    const ad = adBody.data?.[0];
    if (!ad) {
      console.log("  ✗ no ad");
      continue;
    }

    // Activate all three levels
    const campResult = await activate(campId, "Campaign", token);
    console.log(`  Campaign:  ${campResult.ok ? "✓ ACTIVE" : "✗ " + campResult.error}`);

    const adsetResult = await activate(adset.id, "AdSet", token);
    console.log(`  AdSet:     ${adsetResult.ok ? "✓ ACTIVE" : "✗ " + adsetResult.error}`);

    const adResult = await activate(ad.id, "Ad", token);
    console.log(`  Ad:        ${adResult.ok ? "✓ ACTIVE" : "✗ " + adResult.error}`);
  }

  console.log("\n━━━ Final state ━━━");
  for (const id of CAMPAIGNS) {
    const url = new URL(`https://graph.facebook.com/v23.0/${id}`);
    url.searchParams.set("fields", "id,name,effective_status");
    url.searchParams.set("access_token", token);
    const res = await fetch(url.toString());
    const body = (await res.json()) as Record<string, unknown>;
    console.log(`  ${id}: ${body.effective_status}`);
  }

  await prisma.$disconnect();
}
main().catch(console.error);
