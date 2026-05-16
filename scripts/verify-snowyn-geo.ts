import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

async function get(p: string, tok: string) {
  const u = new URL(`https://graph.facebook.com/v23.0${p}`);
  u.searchParams.set("access_token", tok);
  return (await (await fetch(u.toString())).json()) as Record<string, unknown>;
}

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const t = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } });
  const c = await prisma.metaConnection.findUniqueOrThrow({ where: { tenantId: t.id } });
  const tok = decrypt(c.accessTokenEncrypted);

  for (const camp of ["120243957988980714", "120243958001750714"]) {
    console.log("\n---", camp);
    const cd = await get(`/${camp}?fields=name,effective_status`, tok) as Record<string, unknown>;
    console.log("Camp:", cd.name, "status:", cd.effective_status);
    const r = await get(`/${camp}/adsets?fields=name,effective_status,targeting{geo_locations}&limit=10`, tok) as { data?: Array<Record<string, unknown>> };
    for (const a of r.data ?? []) {
      const tgt = a.targeting as { geo_locations?: { regions?: Array<{ key: string; name?: string }>; cities?: unknown[] } } | undefined;
      const geo = tgt?.geo_locations;
      console.log("  ", a.name, "| status:", a.effective_status);
      console.log("    geo:", JSON.stringify(geo));
    }
  }
  await prisma.$disconnect();
}
main().catch(console.error);
