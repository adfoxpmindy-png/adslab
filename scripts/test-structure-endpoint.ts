import { config } from "dotenv";
config({ path: ".env.local" });

import { sealData } from "iron-session";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const CAMPAIGN_ID = "120248165236170166";

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { slug: "demo" },
    include: { members: { where: { role: "OWNER" }, take: 1, include: { user: true } } },
  });
  const owner = tenant.members[0].user;
  const sealed = await sealData(
    { userId: owner.id, email: owner.email, name: owner.name },
    { password: process.env.SESSION_SECRET! },
  );
  const cookie = `adslab_session=${sealed}`;

  const res = await fetch(
    `https://ads-lab.xyz/api/meta/campaigns/${CAMPAIGN_ID}/structure?tenantSlug=demo`,
    { headers: { cookie } },
  );
  console.log("status:", res.status);
  const body = await res.json();
  console.log("body:", JSON.stringify(body, null, 2).slice(0, 2000));

  await prisma.$disconnect();
}
main().catch(console.error);
