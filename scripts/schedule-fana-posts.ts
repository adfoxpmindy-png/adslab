/**
 * Schedule the 6 FANA Restaurant posts via Meta Graph API.
 *
 * Uses USER access token (with pages_manage_posts scope) directly —
 * because the user is admin of the FANA page, Meta accepts user tokens
 * on page endpoints. No page-token derivation needed.
 *
 * Run:
 *   FANA_TOKEN=EAA... npx tsx scripts/schedule-fana-posts.ts
 *
 * Optional env:
 *   FANA_START_AT — ISO datetime for Day 1 (default: tomorrow 18:00 +07:00)
 *   FANA_MEDIA_DIR — path to unzipped media (default: /tmp/fana-content)
 *   FANA_DRY_RUN=1 — print what would be scheduled, no API calls
 */
import { readFile } from "node:fs/promises";
import * as path from "node:path";

const PAGE_ID = "198914959970923"; // FANA Restaurant
const GRAPH_VERSION = "v23.0";

const TOKEN = process.env.FANA_TOKEN;
const MEDIA_DIR = process.env.FANA_MEDIA_DIR ?? "/tmp/fana-content";
const DRY_RUN = process.env.FANA_DRY_RUN === "1";

const FOOTER = `🔗Add LINE @675eyqyl or https://lin.ee/053p4g2
📞098-283-9372 to book!
.
MON.-SUN. 11:00-24:00!
.
📍อาคารปัญญามาร์เก็ต ถนนปัญญาอินทรา แขวงคันนายาว เขตคันนายาว กรุงเทพมหานคร
.
https://maps.app.goo.gl/3p3omT7NUUfVPDrh6`;

type AlbumPost = {
  name: string;
  kind: "album";
  caption: string;
  files: string[];
  dayOffset: number;
  hour: number;
  minute: number;
};
type PhotoPost = {
  name: string;
  kind: "photo";
  caption: string;
  file: string;
  dayOffset: number;
  hour: number;
  minute: number;
};
type VideoPost = {
  name: string;
  kind: "video";
  caption: string;
  file: string;
  dayOffset: number;
  hour: number;
  minute: number;
};
type Post = AlbumPost | PhotoPost | VideoPost;

const POSTS: Post[] = [
  {
    name: "POST 1 — Mood Album",
    kind: "album",
    caption: `บางคืนเริ่มจากค็อกเทล บางคืนเริ่มจาก steak\n\n${FOOTER}`,
    files: [
      "folder1/04 _ 69/ALBUM POST 01/01.png",
      "folder1/04 _ 69/ALBUM POST 01/02.png",
      "folder1/04 _ 69/ALBUM POST 01/03.png",
      "folder1/04 _ 69/ALBUM POST 01/04.png",
    ],
    dayOffset: 0,
    hour: 18,
    minute: 0,
  },
  {
    name: "POST 2 — Opening Hours",
    kind: "photo",
    caption: `เปิดทุกวัน 11 โมงเช้า ถึงเที่ยงคืน\n\n${FOOTER}`,
    file: "folder1/04 _ 69/POST 01.png",
    dayOffset: 3,
    hour: 19,
    minute: 0,
  },
  {
    name: "POST 3 — Golf & Wine Album",
    kind: "album",
    caption: `เล่นกอล์ฟปัญญาอินทราเสร็จ แวะมารับไวน์แดง 1 แก้ว ฟรี ครับ\n\n${FOOTER}`,
    files: [
      "folder2/GOFT & WINE/1.png",
      "folder2/GOFT & WINE/2.png",
      "folder2/GOFT & WINE/3.png",
      "folder2/GOFT & WINE/4.png",
    ],
    dayOffset: 6,
    hour: 17,
    minute: 30,
  },
  {
    name: "POST 4 — Steak Reel",
    kind: "video",
    caption: `Steak ของบ้านเรา มาลองสิครับ\n\n${FOOTER}`,
    file: "folder1/04 _ 69/Steak 01.mp4",
    dayOffset: 9,
    hour: 18,
    minute: 30,
  },
  {
    name: "POST 5 — Ambience Reel",
    kind: "video",
    caption: `นี่คือ FANA คืนวันธรรมดาครับ\n\n${FOOTER}`,
    file: "folder1/04 _ 69/Ambience 01 .mp4",
    dayOffset: 12,
    hour: 19,
    minute: 0,
  },
  {
    name: "POST 6 — Birthday Reel",
    kind: "video",
    caption: `จัดวันสำคัญของคนสำคัญที่ FANA ทักมาได้ครับ\n\n${FOOTER}`,
    file: "folder1/04 _ 69/Birthday 01.mp4",
    dayOffset: 15,
    hour: 17,
    minute: 0,
  },
];

function computeScheduledUnix(startAt: Date, dayOffset: number, hour: number, minute: number): number {
  const t = new Date(startAt);
  t.setUTCDate(t.getUTCDate() + dayOffset);
  // hour/minute are Bangkok local time; subtract 7h to get UTC.
  t.setUTCHours(hour - 7, minute, 0, 0);
  return Math.floor(t.getTime() / 1000);
}

function defaultStartAt(): Date {
  // Tomorrow 18:00 Bangkok = 11:00 UTC.
  const t = new Date();
  t.setUTCDate(t.getUTCDate() + 1);
  t.setUTCHours(11, 0, 0, 0);
  return t;
}

async function uploadUnpublishedPhoto(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  const fd = new FormData();
  fd.append("source", new Blob([buffer as unknown as ArrayBuffer]), path.basename(filePath));
  fd.append("published", "false");
  fd.append("access_token", TOKEN!);

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PAGE_ID}/photos`;
  const res = await fetch(url, { method: "POST", body: fd as unknown as BodyInit });
  const data = (await res.json()) as { id?: string; error?: { message: string } };
  if (!res.ok || !data.id) {
    throw new Error(`upload ${path.basename(filePath)}: ${data.error?.message ?? res.statusText}`);
  }
  return data.id;
}

async function schedulePhotoPost(filePath: string, caption: string, scheduledAt: number): Promise<string> {
  const buffer = await readFile(filePath);
  const fd = new FormData();
  fd.append("source", new Blob([buffer as unknown as ArrayBuffer]), path.basename(filePath));
  fd.append("caption", caption);
  fd.append("published", "false");
  fd.append("scheduled_publish_time", String(scheduledAt));
  fd.append("access_token", TOKEN!);

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PAGE_ID}/photos`;
  const res = await fetch(url, { method: "POST", body: fd as unknown as BodyInit });
  const data = (await res.json()) as { id?: string; post_id?: string; error?: { message: string } };
  if (!res.ok || (!data.id && !data.post_id)) {
    throw new Error(`schedulePhoto: ${data.error?.message ?? res.statusText}`);
  }
  return data.post_id ?? data.id!;
}

async function scheduleAlbumPost(filePaths: string[], message: string, scheduledAt: number): Promise<string> {
  const photoIds: string[] = [];
  for (const fp of filePaths) {
    process.stdout.write(`  uploading ${path.basename(fp)}... `);
    const id = await uploadUnpublishedPhoto(fp);
    photoIds.push(id);
    console.log(`ok (${id})`);
  }

  const fd = new FormData();
  fd.append("message", message);
  fd.append("published", "false");
  fd.append("scheduled_publish_time", String(scheduledAt));
  fd.append("access_token", TOKEN!);
  photoIds.forEach((id, idx) => {
    fd.append(`attached_media[${idx}]`, JSON.stringify({ media_fbid: id }));
  });

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PAGE_ID}/feed`;
  const res = await fetch(url, { method: "POST", body: fd as unknown as BodyInit });
  const data = (await res.json()) as { id?: string; error?: { message: string } };
  if (!res.ok || !data.id) {
    throw new Error(`scheduleAlbum: ${data.error?.message ?? res.statusText}`);
  }
  return data.id;
}

async function scheduleVideoPost(filePath: string, description: string, scheduledAt: number): Promise<string> {
  const buffer = await readFile(filePath);
  const fd = new FormData();
  fd.append("source", new Blob([buffer as unknown as ArrayBuffer]), path.basename(filePath));
  fd.append("description", description);
  fd.append("published", "false");
  fd.append("scheduled_publish_time", String(scheduledAt));
  fd.append("access_token", TOKEN!);

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PAGE_ID}/videos`;
  const res = await fetch(url, { method: "POST", body: fd as unknown as BodyInit });
  const data = (await res.json()) as { id?: string; error?: { message: string } };
  if (!res.ok || !data.id) {
    throw new Error(`scheduleVideo: ${data.error?.message ?? res.statusText}`);
  }
  return data.id;
}

async function main() {
  if (!TOKEN) {
    console.error("ERROR: FANA_TOKEN env var not set.");
    process.exit(1);
  }

  const startAt = process.env.FANA_START_AT ? new Date(process.env.FANA_START_AT) : defaultStartAt();
  if (Number.isNaN(startAt.getTime())) {
    console.error(`Invalid FANA_START_AT: ${process.env.FANA_START_AT}`);
    process.exit(1);
  }

  console.log("FANA Restaurant — Post Scheduler");
  console.log("================================");
  console.log(`Page ID:    ${PAGE_ID}`);
  console.log(`Media dir:  ${MEDIA_DIR}`);
  console.log(`Day 1:      ${startAt.toISOString()} (UTC)`);
  console.log(`Total:      ${POSTS.length} posts`);
  if (DRY_RUN) console.log(`Mode:       DRY RUN (no API calls)`);
  console.log("");

  // Pre-flight: verify all media files exist.
  for (const post of POSTS) {
    const files = post.kind === "album" ? post.files : [post.file];
    for (const f of files) {
      const full = path.join(MEDIA_DIR, f);
      try {
        await readFile(full);
      } catch {
        console.error(`Missing media file: ${full}`);
        process.exit(1);
      }
    }
  }
  console.log("✓ All media files present");

  // Show plan
  for (const post of POSTS) {
    const scheduledUnix = computeScheduledUnix(startAt, post.dayOffset, post.hour, post.minute);
    const scheduledISO = new Date(scheduledUnix * 1000).toISOString();
    const bkkTime = `${String(post.hour).padStart(2, "0")}:${String(post.minute).padStart(2, "0")}`;
    console.log(`  ${post.name} → Day ${post.dayOffset + 1} ${bkkTime} BKK (${scheduledISO})`);
  }
  console.log("");

  if (DRY_RUN) {
    console.log("DRY RUN complete. Re-run without FANA_DRY_RUN=1 to actually schedule.");
    return;
  }

  const results: Array<{ name: string; scheduledAt: string; postId: string | null; error?: string }> = [];

  for (const post of POSTS) {
    const scheduledUnix = computeScheduledUnix(startAt, post.dayOffset, post.hour, post.minute);
    const scheduledISO = new Date(scheduledUnix * 1000).toISOString();
    console.log(`\n→ ${post.name}`);
    console.log(`  scheduled: ${scheduledISO}`);

    try {
      let postId: string;
      if (post.kind === "album") {
        const full = post.files.map((f) => path.join(MEDIA_DIR, f));
        postId = await scheduleAlbumPost(full, post.caption, scheduledUnix);
      } else if (post.kind === "photo") {
        postId = await schedulePhotoPost(path.join(MEDIA_DIR, post.file), post.caption, scheduledUnix);
      } else {
        postId = await scheduleVideoPost(path.join(MEDIA_DIR, post.file), post.caption, scheduledUnix);
      }
      console.log(`  ✓ scheduled — id: ${postId}`);
      results.push({ name: post.name, scheduledAt: scheduledISO, postId });
    } catch (err) {
      const msg = (err as Error).message;
      console.log(`  ✗ FAILED — ${msg}`);
      results.push({ name: post.name, scheduledAt: scheduledISO, postId: null, error: msg });
    }
  }

  console.log("\n=== Summary ===");
  for (const r of results) {
    const status = r.postId ? "✓" : "✗";
    console.log(`${status} ${r.name}  →  ${r.scheduledAt}`);
    if (r.postId) console.log(`     id: ${r.postId}`);
    if (r.error) console.log(`     err: ${r.error}`);
  }

  const failed = results.filter((r) => !r.postId).length;
  console.log(`\n${results.length - failed}/${results.length} posts scheduled successfully.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
