/**
 * Verify the system knowledge base is queryable.
 * Tries 5 typical questions (mix of Thai + English) and prints top-3 results.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import OpenAI from "openai";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const QUERIES = [
  "How do I scale a Facebook ad campaign?",
  "ตั้ง budget แบบไหนดีกว่า CBO หรือ ABO?",
  "What makes a winning Facebook ad creative?",
  "วิธี test creative ใหม่ ๆ ใน Facebook Ads",
  "How much should I spend on testing new ads?",
];

async function embed(text: string): Promise<number[]> {
  const client = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY!,
    baseURL: "https://openrouter.ai/api/v1",
  });
  // Fall back to OpenAI direct if OPENAI_API_KEY is set
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.OPENROUTER_API_KEY!;
  const openai = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : client;
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
  const demo = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } });

  for (const q of QUERIES) {
    console.log(`\n━━━ "${q}" ━━━`);
    const vec = await embed(q);
    const vectorLit = `[${vec.join(",")}]`;
    const rows = await prisma.$queryRawUnsafe<
      Array<{ content: string; ordinal: number; documentTitle: string; distance: number }>
    >(
      `SELECT kc.content, kc.ordinal, kd.title AS "documentTitle",
              (kc.embedding <=> $1::vector) AS distance
       FROM "KnowledgeChunk" kc
       JOIN "KnowledgeDocument" kd ON kd.id = kc."documentId"
       WHERE kd."tenantId" = ANY($2::text[]) AND kd.status = 'ready'
       ORDER BY kc.embedding <=> $1::vector ASC
       LIMIT 3`,
      vectorLit,
      [demo.id, sys.id],
    );
    if (rows.length === 0) {
      console.log("  (no matches)");
      continue;
    }
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      console.log(
        `  ${i + 1}. [${((1 - r.distance) * 100).toFixed(1)}%] ${r.documentTitle.slice(0, 60)}`,
      );
      console.log(`     "${r.content.slice(0, 180).replace(/\s+/g, " ")}..."`);
    }
  }

  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
