/**
 * The user's AdsLab Campaigns view shows "Ad Set นี้ยังไม่มีโฆษณา" for
 * a freshly-created active boost campaign. Compare what Meta returns
 * directly vs what our structure endpoint returns.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { sealData } from "iron-session";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { slug: "demo" },
    include: { members: { where: { role: "OWNER" }, take: 1, include: { user: true } } },
  });
  const conn = await prisma.metaConnection.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  const token = decrypt(conn.accessTokenEncrypted);

  // Find recent "AdsLab Boost · 2026-05-15 · EV Plaza" campaigns
  const recentCamps = await prisma.metaCampaign.findMany({
    where: {
      metaConnectionId: conn.id,
      name: { contains: "AdsLab Boost · 2026-05-15 · EV Plaza" },
    },
    orderBy: { lastFetchedAt: "desc" },
    take: 6,
    select: { id: true, metaCampaignId: true, name: true, effectiveStatus: true },
  });
  console.log(`Found ${recentCamps.length} matching campaigns in DB:\n`);
  for (const c of recentCamps) {
    console.log(`  ${c.metaCampaignId} | ${c.effectiveStatus} | ${c.name}`);
  }

  // Pick first one, inspect via Meta directly + via structure endpoint
  const target = recentCamps[0];
  if (!target) { await prisma.$disconnect(); return; }

  console.log(`\n━━━ DIRECT META: campaign ${target.metaCampaignId} ━━━`);
  const directRes = await fetch(
    `https://graph.facebook.com/v23.0/${target.metaCampaignId}/adsets?fields=id,name,effective_status,ads{id,name,effective_status,configured_status}&access_token=${token}`,
  );
  const directBody = await directRes.json();
  console.log(JSON.stringify(directBody, null, 2).slice(0, 1200));

  console.log(`\n━━━ STRUCTURE ENDPOINT (what AdsLab UI uses) ━━━`);
  const owner = tenant.members[0].user;
  const sealed = await sealData(
    { userId: owner.id, email: owner.email, name: owner.name },
    { password: process.env.SESSION_SECRET! },
  );
  const cookie = `adslab_session=${sealed}`;
  const structRes = await fetch(
    `https://ads-lab.xyz/api/meta/campaigns/${target.metaCampaignId}/structure?tenantSlug=demo`,
    { headers: { cookie } },
  );
  const structBody = await structRes.json();
  console.log(JSON.stringify(structBody, null, 2).slice(0, 1500));

  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
