/**
 * Ingest a YouTube channel's videos into AdsLab's system knowledge base.
 *
 * Usage:
 *   npx tsx scripts/ingest-youtube-channel.ts --channel @NickTheriot --limit 50
 *
 * Flags:
 *   --channel <handle>   e.g. "@NickTheriot" (required)
 *   --limit <N>          max videos to process; 0 = all (default 50)
 *   --concurrency <N>    parallel video workers (default 5)
 *   --dry-run            list candidates only, no DB writes
 *
 * Pipeline (per video):
 *   1. yt-dlp lists channel → (id, title, duration, upload_date)
 *   2. Skip if duration < 60s (Shorts) or already ingested (sourceMeta.youtubeVideoId)
 *   3. yt-dlp fetches English auto-captions as VTT
 *   4. Clean VTT → paragraph text (strip timestamps, dedupe overlaps)
 *   5. chunkText() → ~512-token chunks
 *   6. embedBatch() → 1536-dim vectors
 *   7. INSERT KnowledgeDocument + KnowledgeChunks (raw SQL for vector column)
 *
 * Idempotent: re-running skips videos already in DB.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { chunkText } from "../src/lib/ai/chunker";
import { embedBatch } from "../src/lib/ai/embeddings";

const SYSTEM_TENANT_SLUG = "__adslab_system";

type Args = {
  channel: string;
  limit: number;
  concurrency: number;
  dryRun: boolean;
};

function parseArgs(): Args {
  const a: Args = { channel: "", limit: 50, concurrency: 5, dryRun: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--channel") a.channel = argv[++i];
    else if (k === "--limit") a.limit = parseInt(argv[++i], 10);
    else if (k === "--concurrency") a.concurrency = parseInt(argv[++i], 10);
    else if (k === "--dry-run") a.dryRun = true;
  }
  if (!a.channel) {
    console.error("Missing --channel <handle>");
    process.exit(1);
  }
  return a;
}

type VideoMeta = {
  id: string;
  title: string;
  durationSec: number;
  uploadDate: string | null;
};

/** Spawn yt-dlp and collect stdout. */
function run(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { shell: false });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (b) => { stdout += b.toString(); });
    p.stderr.on("data", (b) => { stderr += b.toString(); });
    p.on("close", (code) => resolve({ stdout, stderr, code: code ?? -1 }));
  });
}

async function listChannelVideos(channel: string, limit: number): Promise<VideoMeta[]> {
  const url = `https://www.youtube.com/${channel}/videos`;
  const args = [
    "--flat-playlist",
    "--print",
    "%(id)s\t%(title)s\t%(duration)s\t%(upload_date)s",
    "--no-warnings",
    url,
  ];
  if (limit > 0) {
    args.unshift("--playlist-end", String(limit));
  }
  const { stdout, code } = await run("yt-dlp", args);
  if (code !== 0) throw new Error(`yt-dlp list failed (code ${code})`);
  return stdout
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const [id, title, durStr, dateStr] = line.split("\t");
      const durationSec = parseInt(durStr, 10) || 0;
      return {
        id,
        title: title ?? "(no title)",
        durationSec,
        uploadDate: dateStr && dateStr !== "NA" ? dateStr : null,
      };
    });
}

/** Fetch English auto-captions for a video. Returns raw VTT text or null. */
async function fetchCaptions(videoId: string): Promise<string | null> {
  const dir = await mkdtemp(join(tmpdir(), "ytcap-"));
  try {
    const args = [
      "--write-auto-sub",
      "--sub-lang",
      "en",
      "--skip-download",
      "--convert-subs",
      "vtt",
      "--no-warnings",
      "-o",
      join(dir, "%(id)s.%(ext)s"),
      `https://www.youtube.com/watch?v=${videoId}`,
    ];
    const { code } = await run("yt-dlp", args);
    if (code !== 0) return null;
    const files = await readdir(dir);
    const vtt = files.find((f) => f.endsWith(".vtt"));
    if (!vtt) return null;
    return await readFile(join(dir, vtt), "utf-8");
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Clean VTT captions: strip timestamps + tags + WEBVTT header,
 * dedupe consecutive overlapping lines (common in auto-captions),
 * and join into paragraph-form text.
 */
function cleanVtt(vtt: string): string {
  const lines = vtt.split(/\r?\n/);
  const cleaned: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("WEBVTT")) continue;
    if (/^\d{2}:\d{2}/.test(line) && line.includes("-->")) continue;
    if (line.startsWith("NOTE ")) continue;
    if (line.startsWith("Kind:") || line.startsWith("Language:")) continue;
    // Strip inline tags like <c.color>...</c> and <00:00:01.500>
    const stripped = line
      .replace(/<\/?[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&nbsp;/g, " ")
      .trim();
    if (!stripped) continue;
    cleaned.push(stripped);
  }

  // Dedupe consecutive overlapping captions: auto-captions emit
  // progressively longer prefixes ("so", "so the", "so the first")
  // before showing the final form. Collapse to the longest.
  const collapsed: string[] = [];
  for (const line of cleaned) {
    const last = collapsed[collapsed.length - 1];
    if (last && (line.startsWith(last) || last.startsWith(line))) {
      collapsed[collapsed.length - 1] = line.length > last.length ? line : last;
    } else {
      collapsed.push(line);
    }
  }
  return collapsed.join(" ").replace(/\s+/g, " ").trim();
}

/** Insert a KnowledgeChunk row with its embedding via raw SQL. */
async function insertChunk(
  prisma: PrismaClient,
  documentId: string,
  ordinal: number,
  content: string,
  tokens: number,
  embedding: number[],
) {
  const vectorLit = `[${embedding.join(",")}]`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "KnowledgeChunk" (id, "documentId", content, embedding, tokens, ordinal, "createdAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3::vector, $4, $5, NOW())`,
    documentId,
    content,
    vectorLit,
    tokens,
    ordinal,
  );
}

async function ingestVideo(
  prisma: PrismaClient,
  tenantId: string,
  systemUserId: string,
  video: VideoMeta,
  channel: string,
): Promise<{ status: "ingested" | "skipped" | "failed"; reason?: string; chunkCount?: number }> {
  // Shorts filter
  if (video.durationSec > 0 && video.durationSec < 60) {
    return { status: "skipped", reason: "shorts" };
  }

  // Idempotency check
  const existing = await prisma.knowledgeDocument.findFirst({
    where: {
      tenantId,
      sourceMeta: { path: ["youtubeVideoId"], equals: video.id },
    },
    select: { id: true },
  });
  if (existing) {
    return { status: "skipped", reason: "already_ingested" };
  }

  // Fetch captions
  const vtt = await fetchCaptions(video.id);
  if (!vtt) {
    return { status: "skipped", reason: "no_english_captions" };
  }

  const cleaned = cleanVtt(vtt);
  if (cleaned.length < 200) {
    return { status: "skipped", reason: "transcript_too_short" };
  }

  // Chunk
  const chunks = chunkText(cleaned);
  if (chunks.length === 0) {
    return { status: "skipped", reason: "no_chunks_produced" };
  }

  // Create document first so we have an id for chunks
  let documentId: string | null = null;
  try {
    const doc = await prisma.knowledgeDocument.create({
      data: {
        tenantId,
        title: video.title.slice(0, 250),
        sourceType: "url",
        sourceMeta: {
          youtubeVideoId: video.id,
          channel,
          title: video.title,
          publishedAt: video.uploadDate,
          durationSeconds: video.durationSec,
          url: `https://www.youtube.com/watch?v=${video.id}`,
        },
        status: "processing",
        createdByUserId: systemUserId,
      },
      select: { id: true },
    });
    documentId = doc.id;

    // Embed all chunks in one batch (typically 5-30 per video)
    const embedded = await embedBatch(chunks.map((c) => c.content));
    for (let i = 0; i < chunks.length; i++) {
      await insertChunk(
        prisma,
        documentId,
        chunks[i].ordinal,
        chunks[i].content,
        embedded[i].tokens,
        embedded[i].embedding,
      );
    }

    // Flip to ready
    await prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: { status: "ready", chunkCount: chunks.length },
    });

    return { status: "ingested", chunkCount: chunks.length };
  } catch (err) {
    // Best-effort cleanup of partial document
    if (documentId) {
      await prisma.knowledgeDocument.delete({ where: { id: documentId } }).catch(() => {});
    }
    return { status: "failed", reason: (err as Error).message };
  }
}

async function processConcurrent<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

async function main() {
  const args = parseArgs();
  console.log(`Channel: ${args.channel}`);
  console.log(`Limit:   ${args.limit === 0 ? "all" : args.limit}`);
  console.log(`Concurrency: ${args.concurrency}`);
  console.log(`Dry-run: ${args.dryRun}\n`);

  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  // Resolve system tenant
  const systemTenant = await prisma.tenant.findUnique({
    where: { slug: SYSTEM_TENANT_SLUG },
    select: { id: true },
  });
  if (!systemTenant) {
    console.error(`✗ System tenant not found. Run scripts/seed-system-tenant.ts first.`);
    process.exit(1);
  }

  // Need a user id for createdByUserId — use the first OWNER of the system
  // tenant if it exists, otherwise fall back to the demo OWNER (this is a
  // platform-internal field; not exposed to users).
  let systemUserId: string;
  const sysOwner = await prisma.tenantMember.findFirst({
    where: { tenantId: systemTenant.id },
    select: { userId: true },
  });
  if (sysOwner) {
    systemUserId = sysOwner.userId;
  } else {
    const demoOwner = await prisma.tenantMember.findFirst({
      where: { tenant: { slug: "demo" }, role: "OWNER" },
      select: { userId: true },
    });
    if (!demoOwner) {
      console.error("✗ No fallback user to attribute system docs to");
      process.exit(1);
    }
    systemUserId = demoOwner.userId;
  }

  // List videos
  console.log(`→ Listing videos from ${args.channel}...`);
  const videos = await listChannelVideos(args.channel, args.limit);
  console.log(`  Got ${videos.length} videos\n`);

  if (args.dryRun) {
    for (const v of videos.slice(0, 20)) {
      console.log(`  ${v.id} | ${v.durationSec}s | ${v.title.slice(0, 60)}`);
    }
    if (videos.length > 20) console.log(`  ... and ${videos.length - 20} more`);
    await prisma.$disconnect();
    return;
  }

  // Process in parallel
  console.log(`→ Ingesting (concurrency=${args.concurrency})...\n`);
  let ingested = 0;
  let skippedShorts = 0;
  let skippedExisting = 0;
  let skippedNoCaptions = 0;
  let skippedShort = 0;
  let failed = 0;
  let chunkTotal = 0;

  await processConcurrent(videos, args.concurrency, async (v, i) => {
    const r = await ingestVideo(prisma, systemTenant.id, systemUserId, v, args.channel);
    const prefix = `[${i + 1}/${videos.length}]`;
    if (r.status === "ingested") {
      ingested++;
      chunkTotal += r.chunkCount ?? 0;
      console.log(`  ${prefix} ✓ ${v.title.slice(0, 50)} (${r.chunkCount} chunks)`);
    } else if (r.status === "skipped") {
      if (r.reason === "shorts") skippedShorts++;
      else if (r.reason === "already_ingested") skippedExisting++;
      else if (r.reason === "no_english_captions") skippedNoCaptions++;
      else if (r.reason === "transcript_too_short") skippedShort++;
      console.log(`  ${prefix} ↷ skip [${r.reason}] ${v.title.slice(0, 50)}`);
    } else {
      failed++;
      console.log(`  ${prefix} ✗ fail ${v.title.slice(0, 50)} — ${r.reason}`);
    }
    return r;
  });

  console.log(`\n━━━ Summary ━━━`);
  console.log(`  ingested:      ${ingested} (${chunkTotal} chunks total)`);
  console.log(`  skipped shorts: ${skippedShorts}`);
  console.log(`  skipped existing: ${skippedExisting}`);
  console.log(`  skipped no captions: ${skippedNoCaptions}`);
  console.log(`  skipped too short: ${skippedShort}`);
  console.log(`  failed:        ${failed}`);

  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
