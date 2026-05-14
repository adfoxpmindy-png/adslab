/**
 * Round 2: combine fbadcode with known-required fields.
 * Hypothesis: boosted_component_id is the "what to boost" reference
 * and we still need to declare budget/audience/etc separately.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

const CODE = "fbadcode-Q_GkBQxe-o0pUU1XMzgu5tDJmMzwEsmB9I2IR5BxJ2XhhPOOoeUO_-yNnGE_FjgiEQ";
const ACCOUNT = "act_1006870751067315";
const PAGE_ID = "110409746982988";

async function tryCall(label: string, body: object, path = `/${ACCOUNT}/adcreatives`) {
  return null; // placeholder removed below
}

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } });
  const conn = await prisma.metaConnection.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  const token = decrypt(conn.accessTokenEncrypted);

  const attempts = [
    {
      label: "A. adcreatives + boosted_component_id + page_id",
      path: `/${ACCOUNT}/adcreatives`,
      body: { name: "test A", page_id: PAGE_ID, boosted_component_id: CODE },
    },
    {
      label: "B. adcreatives + object_id + object_story_spec",
      path: `/${ACCOUNT}/adcreatives`,
      body: {
        name: "test B",
        object_id: PAGE_ID,
        object_story_spec: { page_id: PAGE_ID, boosted_component_id: CODE },
      },
    },
    {
      label: "C. /me/adcode/CODE",
      path: `/me/adcode/${encodeURIComponent(CODE)}`,
      method: "GET",
      body: null,
    },
    {
      label: "D. /ACCOUNT/adcodes",
      path: `/${ACCOUNT}/adcodes?ad_code=${encodeURIComponent(CODE)}`,
      method: "GET",
      body: null,
    },
    {
      label: "E. GET CODE with full fields",
      path: `/${encodeURIComponent(CODE)}?fields=id,name,type,objective,creative,promoted_object,boosted_object_id`,
      method: "GET",
      body: null,
    },
    {
      label: "F. /CODE/ads",
      path: `/${encodeURIComponent(CODE)}/ads`,
      method: "GET",
      body: null,
    },
    {
      label: "G. POST /me/ads with code",
      path: `/me/ads`,
      body: { name: "test G", boosted_component_id: CODE, status: "PAUSED" },
    },
    {
      label: "H. boosted_object_id field name (not _component_)",
      path: `/${ACCOUNT}/ads`,
      body: { name: "test H", boosted_object_id: CODE, status: "PAUSED" },
    },
  ];

  for (const a of attempts) {
    const url = new URL(`https://graph.facebook.com/v23.0${a.path}`);
    const method = a.method ?? "POST";
    if (method === "GET") {
      url.searchParams.set("access_token", token);
      const res = await fetch(url.toString());
      const body = await res.json();
      console.log(`${a.label}\n  status: ${res.status}  ${JSON.stringify(body).slice(0, 300)}\n`);
    } else {
      url.searchParams.set("access_token", token);
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(a.body),
      });
      const body = await res.json();
      console.log(`${a.label}\n  status: ${res.status}  ${JSON.stringify(body).slice(0, 300)}\n`);
    }
  }

  await prisma.$disconnect();
}
main().catch(console.error);
