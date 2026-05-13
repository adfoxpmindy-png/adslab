// One-time setup: enable pgvector extension on the Neon DB so we can
// store 1536-dim embeddings in KnowledgeChunk.embedding.
//
// Run: npx dotenv -e .env.local -- npx tsx scripts/enable-pgvector.ts
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

async function main() {
  const cs = process.env.DATABASE_URL;
  if (!cs) throw new Error("DATABASE_URL not set");
  const adapter = new PrismaNeon({ connectionString: cs });
  const prisma = new PrismaClient({ adapter });

  console.log("Enabling pgvector extension...");
  await prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS vector;");

  // Verify — cast `name` type to text so Prisma can deserialize.
  const rows = await prisma.$queryRawUnsafe<{ extname: string }[]>(
    "SELECT extname::text FROM pg_extension WHERE extname = 'vector';",
  );
  if (rows.length > 0) {
    console.log("✓ pgvector enabled");
  } else {
    console.error("✗ pgvector not found after CREATE — check Neon plan");
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
