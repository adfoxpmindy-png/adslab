import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } });

  const jobs = await prisma.boostJob.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      status: true,
      createdAt: true,
      executedAt: true,
      executionResults: true,
    },
  });

  console.log(`Last ${jobs.length} boost jobs:\n`);
  for (const j of jobs) {
    const results = j.executionResults as null | Array<{ status: string; campaignMetaId?: string; error?: string }>;
    const successful = results?.filter((r) => r.status === "success") ?? [];
    const failed = results?.filter((r) => r.status === "failed") ?? [];
    console.log(`${j.id}`);
    console.log(`  status: ${j.status} | created: ${j.createdAt.toISOString()}`);
    console.log(`  results: ${successful.length} success, ${failed.length} failed`);
    if (successful.length > 0) {
      console.log(`  campaign IDs: ${successful.map((s) => s.campaignMetaId).join(", ")}`);
    }
  }

  await prisma.$disconnect();
}
main().catch(console.error);
