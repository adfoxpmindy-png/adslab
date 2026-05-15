/**
 * Read substantial chunks from the knowledge base covering main topics
 * — scaling, creative, testing, account structure, optimization,
 * targeting, hooks, budget. Then I can synthesize principles.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import OpenAI from "openai";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const TOPICS = [
  "campaign structure CBO ABO best practices",
  "creative testing methodology rapid testing",
  "winning ad creative formula angles hooks",
  "scaling Facebook ads horizontally vertically",
  "Facebook ad fatigue iteration frequency",
  "audience targeting broad detailed advantage",
  "budget allocation daily lifetime optimization",
  "Andromeda update Meta algorithm changes 2025 2026",
  "video ad script structure hook problem solution",
  "ad account warmup new account launch",
  "tracking attribution pixel CAPI conversions",
  "CPV CPM CTR ROAS metrics benchmarks",
];

async function embed(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.OPENROUTER_API_KEY!;
  const openai = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey })
    : new OpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1" });
  const r = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return r.data[0].embedding;
}

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const sys = await prisma.tenant.findUniqueOrThrow({ where: { slug: "__adslab_system" } });

  for (const topic of TOPICS) {
    const vec = await embed(topic);
    const vectorLit = `[${vec.join(",")}]`;
    const rows = await prisma.$queryRawUnsafe<
      Array<{ content: string; title: string; distance: number }>
    >(
      `SELECT kc.content, kd.title, (kc.embedding <=> $1::vector) AS distance
       FROM "KnowledgeChunk" kc
       JOIN "KnowledgeDocument" kd ON kd.id = kc."documentId"
       WHERE kd."tenantId" = $2 AND kd.status = 'ready'
       ORDER BY kc.embedding <=> $1::vector ASC
       LIMIT 3`,
      vectorLit,
      sys.id,
    );
    console.log(`\n━━━ TOPIC: ${topic} ━━━`);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      console.log(`\n[${i + 1}] (${((1 - r.distance) * 100).toFixed(0)}%) "${r.title}"`);
      console.log(r.content);
    }
  }

  await prisma.$disconnect();
}
main().catch(console.error);
