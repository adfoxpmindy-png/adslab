import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

const PAGE_ID = "110409746982988";
const TARGETS = ["1015360974392298", "2046794962859921", "1002568998876934", "994832796325634"];

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } });
  const conn = await prisma.metaConnection.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  const userToken = decrypt(conn.accessTokenEncrypted);

  // Get Page token
  let pageToken = "";
  for (let i = 0; i < 5; i++) {
    const url = new URL("https://graph.facebook.com/v23.0/me/accounts");
    url.searchParams.set("fields", "id,access_token");
    url.searchParams.set("limit", "100");
    url.searchParams.set("access_token", userToken);
    const res = await fetch(url.toString());
    const body = (await res.json()) as { data?: Array<{ id: string; access_token?: string }> };
    const f = body.data?.find((p) => p.id === PAGE_ID);
    if (f?.access_token) {
      pageToken = f.access_token;
      break;
    }
  }
  if (!pageToken) { console.log("no page token"); return; }

  // 1. Try /video_reels endpoint
  console.log("→ /PAGE_ID/video_reels (page-level reels list)");
  const reelsRes = await fetch(
    `https://graph.facebook.com/v23.0/${PAGE_ID}/video_reels?fields=id,created_time,title,description&limit=30&access_token=${pageToken}`,
  );
  const reelsBody = (await reelsRes.json()) as {
    data?: Array<{ id: string; created_time?: string; title?: string }>;
    error?: { message: string };
  };
  if (reelsBody.error) {
    console.log(`  ✗ ${reelsBody.error.message}`);
  } else {
    const reels = reelsBody.data ?? [];
    console.log(`  Got ${reels.length} reels`);
    for (const r of reels.slice(0, 10)) {
      const matches = TARGETS.find((t) => r.id === t || r.id.endsWith("_" + t));
      console.log(`  ${matches ? "🎯" : "  "} ${r.id} ${r.created_time?.slice(0, 10) ?? ""} ${(r.title ?? "").slice(0, 40)}`);
    }
  }

  // 2. Try each TARGET as a Video object directly (not page post)
  console.log("\n→ Each target as direct video object query:");
  for (const t of TARGETS) {
    const res = await fetch(
      `https://graph.facebook.com/v23.0/${t}?fields=id,title,description,from{id,name},source,permalink_url,created_time,published&access_token=${pageToken}`,
    );
    const body = (await res.json()) as Record<string, unknown>;
    if (body.error) {
      console.log(`  ✗ ${t}: ${(body.error as { message: string }).message}`);
    } else {
      const from = body.from as { id?: string; name?: string } | undefined;
      console.log(`  ✓ ${t}: from=${from?.name} (${from?.id}) created=${body.created_time}`);
    }
  }

  // 3. Try Ad creative dry-run with video_id approach (instead of object_story_id)
  console.log("\n→ Try fetching /VIDEO_ID/thumbnails to confirm video exists:");
  const t = TARGETS[0];
  const thumbRes = await fetch(
    `https://graph.facebook.com/v23.0/${t}/thumbnails?access_token=${pageToken}`,
  );
  const thumbBody = (await thumbRes.json()) as Record<string, unknown>;
  console.log(`  ${JSON.stringify(thumbBody).slice(0, 300)}`);

  await prisma.$disconnect();
}
main().catch(console.error);
