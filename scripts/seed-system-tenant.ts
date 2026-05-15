/**
 * Seed the `__adslab_system` tenant — owns all platform-wide knowledge
 * documents. Every regular tenant's AI chat retrieves from this tenant
 * in addition to its own private docs (see src/lib/ai/rag.ts).
 *
 * Idempotent: safe to re-run.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

// Mirrors the constant in src/lib/ai/rag.ts. Importing from there would
// transitively load @/lib/prisma which checks DATABASE_URL at import
// time — that fails for tsx scripts before dotenv has applied. Inline.
const SYSTEM_TENANT_SLUG = "__adslab_system";

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const existing = await prisma.tenant.findUnique({
    where: { slug: SYSTEM_TENANT_SLUG },
    select: { id: true, createdAt: true },
  });
  if (existing) {
    console.log(`✓ System tenant already exists`);
    console.log(`  id:        ${existing.id}`);
    console.log(`  slug:      ${SYSTEM_TENANT_SLUG}`);
    console.log(`  createdAt: ${existing.createdAt.toISOString()}`);
    await prisma.$disconnect();
    return;
  }

  const created = await prisma.tenant.create({
    data: {
      slug: SYSTEM_TENANT_SLUG,
      name: "AdsLab System (Knowledge Base)",
    },
    select: { id: true },
  });
  console.log(`✓ Created system tenant`);
  console.log(`  id:   ${created.id}`);
  console.log(`  slug: ${SYSTEM_TENANT_SLUG}`);
  console.log(`\nNext: run scripts/ingest-youtube-channel.ts to populate it.`);

  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
