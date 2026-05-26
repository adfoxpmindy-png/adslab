// Edit caption on the 3 already-published FANA posts to trigger Meta's
// "post updated" event — gamble that NPE algorithm re-evaluates feed
// placement and surfaces them in the Posts tab.
//
// Visible diff per post: 0 characters (we append U+200B zero-width space).
// Meta sees a content change → fires update event. If algorithm reconsiders
// timeline_visibility, the post may appear in the public feed. If not,
// nothing breaks — the visible caption stays identical.
//
// Usage: USER_TOKEN=EAA... node scripts/fana-edit-trigger-resurface.mjs

const USER_TOKEN = process.env.USER_TOKEN;
const PAGE_ID = "198914959970923";
const V = "v23.0";
const ZWSP = "​";

if (!USER_TOKEN) {
  console.error("USER_TOKEN env not set");
  process.exit(1);
}

const FOOTER = `🔗Add LINE @675eyqyl or https://lin.ee/053p4g2
📞098-283-9372 to book!
.
MON.-SUN. 11:00-24:00!
.
📍อาคารปัญญามาร์เก็ต ถนนปัญญาอินทรา แขวงคันนายาว เขตคันนายาว กรุงเทพมหานคร
.
https://maps.app.goo.gl/3p3omT7NUUfVPDrh6`;

const POSTS = [
  {
    id: "198914959970923_122264396840156022",
    name: "Post 1 — Mood Album",
    caption: `บางคืนเริ่มจากค็อกเทล บางคืนเริ่มจาก steak\n\n${FOOTER}`,
  },
  {
    id: "198914959970923_122264396870156022",
    name: "Post 2 — Opening Hours",
    caption: `เปิดทุกวัน 11 โมงเช้า ถึงเที่ยงคืน\n\n${FOOTER}`,
  },
  {
    id: "198914959970923_122264397152156022",
    name: "Post 3 — Golf & Wine Album",
    caption: `เล่นกอล์ฟปัญญาอินทราเสร็จ แวะมารับไวน์แดง 1 แก้ว ฟรี ครับ\n\n${FOOTER}`,
  },
];

const tokenRes = await fetch(
  `https://graph.facebook.com/${V}/${PAGE_ID}?fields=access_token&access_token=${USER_TOKEN}`,
);
const PAGE_TOKEN = (await tokenRes.json()).access_token;
if (!PAGE_TOKEN) {
  console.error("Could not derive page token.");
  process.exit(1);
}
console.log("page token derived\n");

for (const post of POSTS) {
  // Append zero-width space — invisible to humans, forces Meta to register an edit.
  const newMessage = post.caption + ZWSP;

  // POST /POST_ID with message field. Use form encoding because the message
  // contains newlines + emoji.
  const body = new URLSearchParams();
  body.set("message", newMessage);
  body.set("access_token", PAGE_TOKEN);

  const res = await fetch(`https://graph.facebook.com/${V}/${post.id}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = await res.json();

  if (json.success === true || res.ok) {
    console.log(`✓ ${post.name}`);
    console.log(`  id: ${post.id}`);
    console.log(`  response: ${JSON.stringify(json)}`);
  } else {
    console.log(`✗ ${post.name}`);
    console.log(`  id: ${post.id}`);
    console.log(`  error: ${JSON.stringify(json)}`);
  }
  console.log("");
}

console.log("Done. Wait 1-2 minutes, then ask a non-admin to revisit the Page.");
console.log("If posts still don't appear in their Posts tab → algorithm didn't bite.");
console.log("Next step in that case: boost (Option 2 from chat).");
