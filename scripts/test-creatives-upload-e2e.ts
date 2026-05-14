/**
 * Full E2E test of the creatives library:
 *   1. Generate a small PNG file (no external deps)
 *   2. POST it to /api/creatives/upload
 *   3. GET /api/creatives — verify it appears
 *   4. POST /api/creatives/{id}/meta-hash with a real metaAccountId —
 *      verify Meta hash is returned
 *   5. DELETE /api/creatives/{id} — verify it's gone
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { sealData } from "iron-session";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const PROD = "https://ads-lab.xyz";

// Minimal 1x1 red PNG (smallest possible)
const RED_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAwH/E1pZSwAAAABJRU5ErkJggg==";

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  // Get the demo tenant owner for session cookie
  const tenant = await prisma.tenant.findUnique({
    where: { slug: "demo" },
    include: {
      members: { where: { role: "OWNER" }, take: 1, include: { user: true } },
      metaConnection: { include: { adAccounts: { where: { accountStatus: 1 }, take: 1 } } },
    },
  });
  const owner = tenant!.members[0].user;
  const metaAccount = tenant!.metaConnection?.adAccounts[0];
  if (!metaAccount) {
    console.log("✗ No active Meta ad account on demo tenant");
    await prisma.$disconnect();
    return;
  }
  console.log(`Using metaAccount: ${metaAccount.metaAccountId} (${metaAccount.name})`);

  const sealed = await sealData(
    { userId: owner.id, email: owner.email, name: owner.name },
    { password: process.env.SESSION_SECRET! },
  );
  const cookieHeader = `adslab_session=${sealed}`;

  // 1) Upload via API
  console.log("\n→ 1. Uploading 1x1 PNG via /api/creatives/upload...");
  const pngBytes = Buffer.from(RED_PNG_BASE64, "base64");
  const blob = new Blob([new Uint8Array(pngBytes)], { type: "image/png" });
  const form = new FormData();
  form.append("file", blob, "test-e2e.png");

  const uploadRes = await fetch(
    `${PROD}/api/creatives/upload?tenantSlug=demo`,
    { method: "POST", body: form, headers: { cookie: cookieHeader } },
  );
  const uploadJson = (await uploadRes.json()) as { creativeId?: string; url?: string; error?: string };
  if (!uploadRes.ok || !uploadJson.creativeId) {
    console.log(`✗ Upload failed (${uploadRes.status}): ${uploadJson.error ?? "unknown"}`);
    await prisma.$disconnect();
    return;
  }
  console.log(`✓ Uploaded → id=${uploadJson.creativeId}`);
  console.log(`  URL: ${uploadJson.url}`);
  const creativeId = uploadJson.creativeId;

  // 2) List
  console.log("\n→ 2. GET /api/creatives — verifying it appears...");
  const listRes = await fetch(`${PROD}/api/creatives?tenantSlug=demo`, {
    headers: { cookie: cookieHeader },
  });
  const listJson = (await listRes.json()) as { items: Array<{ id: string; name: string }> };
  const found = listJson.items.find((it) => it.id === creativeId);
  console.log(`  Total in library: ${listJson.items.length}`);
  console.log(`  Found uploaded: ${found ? "✓ " + found.name : "✗"}`);

  // 3) Meta hash
  console.log("\n→ 3. POST /meta-hash — converting to Meta image_hash...");
  const hashRes = await fetch(
    `${PROD}/api/creatives/${creativeId}/meta-hash?tenantSlug=demo&metaAccountId=${encodeURIComponent(metaAccount.metaAccountId)}`,
    { method: "POST", headers: { cookie: cookieHeader } },
  );
  const hashJson = (await hashRes.json()) as { hash?: string; cached?: boolean; error?: string };
  if (!hashRes.ok || !hashJson.hash) {
    console.log(`✗ Meta hash failed (${hashRes.status}): ${hashJson.error ?? "unknown"}`);
  } else {
    console.log(`✓ Meta hash: ${hashJson.hash.slice(0, 16)}... (cached=${hashJson.cached})`);

    // Re-call to verify caching
    const cachedRes = await fetch(
      `${PROD}/api/creatives/${creativeId}/meta-hash?tenantSlug=demo&metaAccountId=${encodeURIComponent(metaAccount.metaAccountId)}`,
      { method: "POST", headers: { cookie: cookieHeader } },
    );
    const cachedJson = (await cachedRes.json()) as { hash?: string; cached?: boolean };
    console.log(`  2nd call cached: ${cachedJson.cached === true ? "✓" : "✗"}`);
  }

  // 4) Delete
  console.log("\n→ 4. DELETE creative...");
  const delRes = await fetch(
    `${PROD}/api/creatives/${creativeId}?tenantSlug=demo`,
    { method: "DELETE", headers: { cookie: cookieHeader } },
  );
  const delJson = (await delRes.json()) as { ok?: boolean; error?: string };
  console.log(`  Delete: ${delRes.ok ? "✓" : "✗ " + (delJson.error ?? "")}`);

  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
