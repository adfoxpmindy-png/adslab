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
    console.log("\n--- Campaign", camp);
    const cd = await get(
      `/${camp}?fields=name,objective,effective_status,lifetime_budget,start_time,stop_time`,
      tok,
    );
    console.log("name:  ", cd.name);
    console.log("obj:   ", cd.objective);
    console.log("status:", cd.effective_status);
    console.log("budget:", `THB ${(Number(cd.lifetime_budget ?? 0) / 100).toLocaleString()}`);
    const ads = (await get(
      `/${camp}/adsets?fields=name,effective_status,optimization_goal&limit=10`,
      tok,
    )) as { data?: Array<{ name: string; effective_status: string; optimization_goal: string }> };
    for (const a of ads.data ?? []) {
      console.log(`  - ${a.name}  goal=${a.optimization_goal}  status=${a.effective_status}`);
    }
  }
  await prisma.$disconnect();
}
main().catch(console.error);
