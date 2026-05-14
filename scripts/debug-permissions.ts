import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } });
  const conn = await prisma.metaConnection.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  const token = decrypt(conn.accessTokenEncrypted);

  console.log("Token created:", conn.createdAt);
  console.log("Token expires:", conn.tokenExpiresAt);

  // Ask Meta: what permissions does this token actually have?
  const url = new URL(`https://graph.facebook.com/v23.0/me/permissions`);
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString());
  const body = (await res.json()) as {
    data?: Array<{ permission: string; status: "granted" | "declined" }>;
  };
  console.log("\nGranted permissions:");
  const granted = body.data?.filter((p) => p.status === "granted") ?? [];
  for (const p of granted) console.log(`  ✓ ${p.permission}`);
  const declined = body.data?.filter((p) => p.status === "declined") ?? [];
  if (declined.length > 0) {
    console.log("\nDeclined:");
    for (const p of declined) console.log(`  ✗ ${p.permission}`);
  }

  const hasPagesRead = granted.some((p) => p.permission === "pages_read_engagement");
  const hasPagesManage = granted.some((p) => p.permission === "pages_manage_ads");
  console.log(`\npages_read_engagement: ${hasPagesRead ? "✓" : "✗ MISSING"}`);
  console.log(`pages_manage_ads:      ${hasPagesManage ? "✓" : "✗ MISSING"}`);

  await prisma.$disconnect();
}
main().catch(console.error);
