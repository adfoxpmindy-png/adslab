import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

const ADSET = "120248165240030166";

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } });
  const conn = await prisma.metaConnection.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  const token = decrypt(conn.accessTokenEncrypted);

  const url = new URL(`https://graph.facebook.com/v23.0/${ADSET}/ads`);
  url.searchParams.set(
    "fields",
    "id,name,status,configured_status,effective_status,review_feedback,recommendations",
  );
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString());
  console.log("status:", res.status);
  console.log(JSON.stringify(await res.json(), null, 2));

  await prisma.$disconnect();
}
main().catch(console.error);
