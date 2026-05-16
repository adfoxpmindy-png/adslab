/**
 * v2: Delete the 3 broken Engagement adsets, then recreate with
 * promoted_object included from the start.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

const ACCOUNT = "act_1856743671701430";
const PAGE_ID = "903715949495532";
const POST_ID = "122128256793187956";
const OBJECT_STORY_ID = `${PAGE_ID}_${POST_ID}`;
const ENGAGE_CAMP = "120243958001750714";
const CREATIVE_ID = "842272118437616";

const BROKEN_ADSETS: string[] = [];

const START = new Date(Date.now() + 5 * 60_000);
const END = new Date("2026-05-22T23:59:00+07:00");

const BANGKOK_GEO = {
  regions: [{ key: "3793" }],
  location_types: ["home", "recent"],
};

const AUDIENCES = [
  {
    label: "A1_Families",
    age_min: 28,
    age_max: 45,
    interests: [
      { id: "6003902462066", name: "สวนสนุก" },
      { id: "6003737012891", name: "Parenting" },
      { id: "6003704126313", name: "อาหารเด็กทารก" },
    ],
  },
  {
    label: "A2_Couples_Insta",
    age_min: 20,
    age_max: 32,
    interests: [
      { id: "6003899195666", name: "การถ่ายรูป" },
      { id: "6003670602220", name: "Instagram" },
      { id: "6003594536273", name: "Fashion & Make Up" },
      { id: "6787836449986", name: "ร้านอาหารแบบสบายๆ" },
    ],
  },
  {
    label: "A3_Travelers",
    age_min: 25,
    age_max: 50,
    interests: [
      { id: "6003121064322", name: "Travel + Leisure" },
      { id: "6003349868805", name: "Travel Adventures" },
      { id: "6777460559594", name: "Travel booking services" },
    ],
  },
];

async function apiPost(p: string, token: string, body: object) {
  const url = new URL(`https://graph.facebook.com/v23.0${p}`);
  url.searchParams.set("access_token", token);
  const r = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await r.json()) as { id?: string; success?: boolean; error?: { message: string; error_user_msg?: string } };
}

async function apiDelete(p: string, token: string) {
  const url = new URL(`https://graph.facebook.com/v23.0${p}`);
  url.searchParams.set("access_token", token);
  const r = await fetch(url.toString(), { method: "DELETE" });
  return (await r.json()) as { success?: boolean; error?: { message: string } };
}

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } });
  const conn = await prisma.metaConnection.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  const token = decrypt(conn.accessTokenEncrypted);

  console.log("Step 1: Delete 3 broken Engagement adsets");
  for (const id of BROKEN_ADSETS) {
    const d = await apiDelete(`/${id}`, token);
    console.log(`  ${id}: ${d.success ? "deleted" : d.error?.message ?? "?"}`);
  }

  console.log("\nStep 2: Create 3 new Engagement adsets + ads (with promoted_object)");
  let ok = 0;
  for (const aud of AUDIENCES) {
    console.log(`\n━━━ ${aud.label}`);
    const adset = await apiPost(`/${ACCOUNT}/adsets`, token, {
      name: `Snowyn Engagement — ${aud.label}`,
      campaign_id: ENGAGE_CAMP,
      status: "ACTIVE",
      optimization_goal: "POST_ENGAGEMENT",
      billing_event: "IMPRESSIONS",
      destination_type: "ON_POST",
      promoted_object: { page_id: PAGE_ID },
      targeting: {
        geo_locations: BANGKOK_GEO,
        age_min: aud.age_min,
        age_max: aud.age_max,
        flexible_spec: [{ interests: aud.interests }],
        publisher_platforms: ["facebook"],
        facebook_positions: ["feed", "facebook_reels", "profile_feed", "story"],
        targeting_automation: { advantage_audience: 0 },
      },
      start_time: START.toISOString(),
      end_time: END.toISOString(),
      multi_advertiser_ads: { state: "OPT_OUT" },
    });
    if (adset.error || !adset.id) {
      console.log(`  ✗ AdSet: ${adset.error?.error_user_msg ?? adset.error?.message}`);
      continue;
    }
    console.log(`  ✓ AdSet ${adset.id}`);

    const ad = await apiPost(`/${ACCOUNT}/ads`, token, {
      name: `Snowyn Engagement — ${aud.label} — ad`,
      adset_id: adset.id,
      creative: { creative_id: CREATIVE_ID },
      status: "ACTIVE",
    });
    if (ad.error || !ad.id) {
      console.log(`  ✗ Ad: ${ad.error?.error_user_msg ?? ad.error?.message}`);
      continue;
    }
    console.log(`  ✓ Ad ${ad.id}`);
    ok++;
  }

  console.log(`\n${ok}/3 Engagement adsets+ads created`);
  await prisma.$disconnect();
}

main().catch(console.error);
