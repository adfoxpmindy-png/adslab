import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
  });

  // Show every tenant + its OWNER (the email used to log in)
  const tenants = await prisma.tenant.findMany({
    select: {
      slug: true,
      name: true,
      createdAt: true,
      members: {
        where: { role: "OWNER" },
        select: { user: { select: { email: true, emailVerifiedAt: true, createdAt: true } } },
      },
      metaConnection: { select: { status: true } },
      _count: { select: { campaignGoals: true, eventLogs: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log("\nTenants + OWNER emails (rows = login accounts):");
  console.log("─".repeat(110));
  console.log(
    "slug".padEnd(20),
    "name".padEnd(28),
    "owner email".padEnd(32),
    "verified".padEnd(8),
    "meta".padEnd(8),
  );
  console.log("─".repeat(110));
  for (const t of tenants) {
    const owner = t.members[0]?.user;
    console.log(
      t.slug.padEnd(20),
      t.name.slice(0, 27).padEnd(28),
      (owner?.email ?? "—").padEnd(32),
      (owner?.emailVerifiedAt ? "✓" : "✗").padEnd(8),
      (t.metaConnection?.status ?? "—").padEnd(8),
    );
  }
  console.log("─".repeat(110));

  await prisma.$disconnect();
}
main();
