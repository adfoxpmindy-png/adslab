/**
 * Diagnose visibility of FANA Restaurant scheduled posts.
 *
 * Symptom: user reports that posts scheduled via schedule-fana-posts.ts
 * are visible only to the page owner — not to public viewers.
 *
 * This script lists every recent post + scheduled post on the page and
 * reports the fields that determine visibility:
 *   - is_published        (true after schedule time hits)
 *   - is_hidden           (false = public-eligible)
 *   - is_eligible_for_promotion (signals content review held)
 *   - status_type         (mobile_status_update / added_photos / ...)
 *   - scheduled_publish_time (unix; null after auto-publish)
 *   - privacy.value       ("EVERYONE" expected)
 *   - targeting           (if non-null, post is restricted by audience)
 *
 * Run:
 *   FANA_TOKEN=EAA... npx tsx scripts/diagnose-fana-posts.ts
 */

const PAGE_ID = "198914959970923";
const GRAPH_VERSION = "v23.0";
const TOKEN = process.env.FANA_TOKEN;

type PostRow = {
  id: string;
  created_time?: string;
  message?: string;
  is_published?: boolean;
  is_hidden?: boolean;
  is_eligible_for_promotion?: boolean;
  status_type?: string;
  scheduled_publish_time?: number;
  privacy?: { value?: string; description?: string };
  targeting?: Record<string, unknown>;
  feed_targeting?: Record<string, unknown>;
  permalink_url?: string;
};

async function fetchPosts(endpoint: string, label: string): Promise<PostRow[]> {
  const fields = [
    "id",
    "created_time",
    "message",
    "is_published",
    "is_hidden",
    "is_eligible_for_promotion",
    "status_type",
    "scheduled_publish_time",
    "privacy{value,description}",
    "targeting",
    "feed_targeting",
    "permalink_url",
  ].join(",");
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PAGE_ID}/${endpoint}?fields=${fields}&limit=25&access_token=${TOKEN}`;
  const res = await fetch(url);
  const data = (await res.json()) as { data?: PostRow[]; error?: { message: string; code?: number } };
  if (!res.ok || data.error) {
    console.error(`\n[${label}] FAILED — ${data.error?.message ?? res.statusText}`);
    return [];
  }
  return data.data ?? [];
}

function fmtRow(p: PostRow): string {
  const created = p.created_time ? new Date(p.created_time).toISOString() : "—";
  const sched = p.scheduled_publish_time
    ? new Date(p.scheduled_publish_time * 1000).toISOString()
    : "—";
  const snippet = (p.message ?? "").replace(/\n/g, " ").slice(0, 60);
  const privacy = p.privacy?.value ?? "?";
  const targeting = p.targeting || p.feed_targeting ? "YES" : "no";
  return [
    `  id:            ${p.id}`,
    `  created_time:  ${created}`,
    `  scheduled:     ${sched}`,
    `  is_published:  ${p.is_published ?? "?"}`,
    `  is_hidden:     ${p.is_hidden ?? "?"}`,
    `  promotable:    ${p.is_eligible_for_promotion ?? "?"}`,
    `  status_type:   ${p.status_type ?? "?"}`,
    `  privacy:       ${privacy}`,
    `  targeting set: ${targeting}`,
    `  permalink:     ${p.permalink_url ?? "(none)"}`,
    `  message:       ${snippet}${snippet.length === 60 ? "..." : ""}`,
  ].join("\n");
}

async function main() {
  if (!TOKEN) {
    console.error("ERROR: FANA_TOKEN env var not set.");
    console.error("Get a Page token via Graph API Explorer with pages_manage_posts scope.");
    process.exit(1);
  }

  console.log(`FANA Page diagnostic — page ${PAGE_ID}`);
  console.log("=".repeat(70));

  // 1. Page-level visibility check
  console.log("\n[1] Page settings");
  const pageRes = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${PAGE_ID}?fields=name,is_published,is_eligible_for_branded_content,is_unclaimed,country_page_likes&access_token=${TOKEN}`,
  );
  const pageData = (await pageRes.json()) as Record<string, unknown> & { error?: { message: string } };
  if (pageData.error) {
    console.error(`  Page fetch failed: ${pageData.error.message}`);
  } else {
    console.log(`  name:           ${pageData.name}`);
    console.log(`  is_published:   ${pageData.is_published} ${pageData.is_published === false ? "  ← PAGE IS UNPUBLISHED!" : ""}`);
    console.log(`  is_unclaimed:   ${pageData.is_unclaimed ?? "—"}`);
  }

  // 2. Published posts (what visitors see)
  console.log("\n[2] Published posts (page /feed endpoint, what visitors see)");
  const feedPosts = await fetchPosts("feed", "feed");
  if (feedPosts.length === 0) {
    console.log("  (none)");
  } else {
    feedPosts.forEach((p, i) => {
      console.log(`\n  Post ${i + 1}:`);
      console.log(fmtRow(p));
    });
  }

  // 3. Scheduled posts (admin-only view)
  console.log("\n\n[3] Scheduled posts (admin-only view; should be empty after schedule time hits)");
  const scheduledPosts = await fetchPosts("scheduled_posts", "scheduled_posts");
  if (scheduledPosts.length === 0) {
    console.log("  (none)");
  } else {
    scheduledPosts.forEach((p, i) => {
      console.log(`\n  Scheduled ${i + 1}:`);
      console.log(fmtRow(p));
    });
  }

  // 4. Promotable posts (a clue if some posts are blocked from promo + thus from public reach)
  console.log("\n\n[4] Promotable posts (subset of /feed that Meta deems publish-eligible)");
  const promotable = await fetchPosts("promotable_posts", "promotable_posts");
  if (promotable.length === 0) {
    console.log("  (none — could be normal, or could indicate a content policy block)");
  } else {
    console.log(`  ${promotable.length} promotable posts found.`);
  }

  // 5. Diagnosis hints
  console.log("\n\n=== DIAGNOSIS ===");
  const publishedButHidden = feedPosts.filter((p) => p.is_published && p.is_hidden);
  const withTargeting = feedPosts.filter((p) => p.targeting || p.feed_targeting);
  const stuckScheduled = scheduledPosts.filter(
    (p) =>
      p.scheduled_publish_time &&
      p.scheduled_publish_time * 1000 < Date.now(),
  );

  if (pageData.is_published === false) {
    console.log("⚠️  Page itself is UNPUBLISHED — no posts visible to anyone but admins.");
    console.log("    Fix: go to Page Settings → General → Page Visibility → Publish page.");
  }
  if (publishedButHidden.length > 0) {
    console.log(`⚠️  ${publishedButHidden.length} published posts marked is_hidden=true — these are admin-only.`);
  }
  if (withTargeting.length > 0) {
    console.log(`⚠️  ${withTargeting.length} posts have targeting/feed_targeting set — restricts who sees them.`);
  }
  if (stuckScheduled.length > 0) {
    console.log(`⚠️  ${stuckScheduled.length} scheduled posts' time has already passed but they did NOT auto-publish.`);
    console.log("    Could be a Meta-side delay, a token-scope issue at publish time, or content review hold.");
  }
  if (
    pageData.is_published !== false &&
    publishedButHidden.length === 0 &&
    withTargeting.length === 0 &&
    stuckScheduled.length === 0
  ) {
    console.log("No obvious red flag in the API. If posts still aren't visible to a non-admin viewer, try:");
    console.log("  - Open one of the permalink URLs above in an INCOGNITO window (not logged in).");
    console.log("  - Confirm the user sees them in Page Insights → Reach.");
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
