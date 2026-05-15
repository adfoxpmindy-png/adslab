import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const sys = await prisma.tenant.findUniqueOrThrow({ where: { slug: "__adslab_system" } });

  const totalDocs = await prisma.knowledgeDocument.count({ where: { tenantId: sys.id, status: "ready" } });
  const totalChunks = await prisma.knowledgeChunk.count({
    where: { document: { tenantId: sys.id, status: "ready" } },
  });

  // Breakdown by channel
  const docs = await prisma.knowledgeDocument.findMany({
    where: { tenantId: sys.id, status: "ready" },
    select: { sourceMeta: true, chunkCount: true },
  });
  const byChannel = new Map<string, { docs: number; chunks: number }>();
  for (const d of docs) {
    const meta = d.sourceMeta as { channel?: string } | null;
    const channel = meta?.channel ?? "(unknown)";
    const e = byChannel.get(channel) ?? { docs: 0, chunks: 0 };
    e.docs++;
    e.chunks += d.chunkCount;
    byChannel.set(channel, e);
  }

  console.log(`━━━ AdsLab System Knowledge Base ━━━\n`);
  console.log(`Tenant: __adslab_system`);
  console.log(`Total documents: ${totalDocs}`);
  console.log(`Total chunks:    ${totalChunks}\n`);
  console.log(`By channel:`);
  for (const [channel, stats] of byChannel) {
    console.log(`  ${channel}: ${stats.docs} docs / ${stats.chunks} chunks`);
  }

  await prisma.$disconnect();
}
main().catch(console.error);
