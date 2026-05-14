import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const t = await prisma.tenant.findUnique({
    where: { slug: "demo" },
    include: { subscription: { include: { plan: true } } },
  });
  console.log(JSON.stringify(t?.subscription, null, 2));
  await prisma.$disconnect();
}
main().catch(console.error);
