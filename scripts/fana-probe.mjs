// Quick targeted probe for FANA Page audience/restriction state.
// Usage: USER_TOKEN=EAA... node scripts/fana-probe.mjs

const USER_TOKEN = process.env.USER_TOKEN;
const PAGE_ID = "198914959970923";
const V = "v23.0";

if (!USER_TOKEN) {
  console.error("USER_TOKEN env not set");
  process.exit(1);
}

const tokenRes = await fetch(`https://graph.facebook.com/${V}/${PAGE_ID}?fields=access_token&access_token=${USER_TOKEN}`);
const tokenJson = await tokenRes.json();
const PAGE_TOKEN = tokenJson.access_token;
if (!PAGE_TOKEN) {
  console.error("Could not derive page token:", JSON.stringify(tokenJson));
  process.exit(1);
}
console.log("page token derived OK");

const fields = [
  "name",
  "is_published",
  "is_unclaimed",
  "fan_count",
  "followers_count",
  "country_page_likes",
  "category",
  "category_list",
  "location",
  "can_post",
  "talking_about_count",
  "were_here_count",
  "overall_star_rating",
  "rating_count",
  "instagram_business_account",
  "connected_instagram_account",
];

for (const f of fields) {
  const url = `https://graph.facebook.com/${V}/${PAGE_ID}?fields=${f}&access_token=${PAGE_TOKEN}`;
  const r = await fetch(url);
  const j = await r.json();
  if (j.error) {
    console.log(`  ${f}:  ERR ${j.error.code} ${j.error.message}`);
  } else {
    const value = j[f];
    console.log(`  ${f}:  ${typeof value === "object" ? JSON.stringify(value) : value}`);
  }
}

console.log("\n=== Visitor posts endpoint (the one anonymous users hit) ===");
const visitorRes = await fetch(
  `https://graph.facebook.com/${V}/${PAGE_ID}/visitor_posts?fields=id,from{id,name}&limit=5&access_token=${PAGE_TOKEN}`,
);
const visitorJson = await visitorRes.json();
console.log(JSON.stringify(visitorJson, null, 2).slice(0, 1000));

console.log("\n=== Page Insights — post_impressions last 7d (admin-only view of reach) ===");
const insightRes = await fetch(
  `https://graph.facebook.com/${V}/${PAGE_ID}/insights/page_impressions_unique?period=day&since=${Math.floor(Date.now() / 1000) - 7 * 86400}&access_token=${PAGE_TOKEN}`,
);
const insightJson = await insightRes.json();
console.log(JSON.stringify(insightJson, null, 2).slice(0, 1500));

console.log("\n=== Check the 3 published posts individually for any visibility quirk ===");
const POST_IDS = [
  "198914959970923_122264396840156022",
  "198914959970923_122264396870156022",
  "198914959970923_122264397152156022",
];
for (const pid of POST_IDS) {
  const r = await fetch(
    `https://graph.facebook.com/${V}/${pid}?fields=id,message,is_published,is_hidden,privacy{value,description,friends,allow,deny},targeting,feed_targeting,timeline_visibility,is_eligible_for_promotion,via,actions,permalink_url&access_token=${PAGE_TOKEN}`,
  );
  const j = await r.json();
  console.log(`\nPost ${pid}:`);
  if (j.error) {
    console.log("  ERR", j.error.message);
  } else {
    console.log("  is_published:", j.is_published);
    console.log("  is_hidden:", j.is_hidden);
    console.log("  privacy:", JSON.stringify(j.privacy));
    console.log("  timeline_visibility:", j.timeline_visibility);
    console.log("  targeting:", JSON.stringify(j.targeting));
    console.log("  feed_targeting:", JSON.stringify(j.feed_targeting));
    console.log("  promotable:", j.is_eligible_for_promotion);
    console.log("  via:", j.via);
    console.log("  actions:", JSON.stringify(j.actions));
    console.log("  permalink:", j.permalink_url);
  }
}
