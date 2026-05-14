import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

const CANDIDATES = [
  { id: "act_105091833624296", name: "Denial Wellinton" },
  { id: "act_2191699664343216", name: "Digit Tribe" },
  { id: "act_1006870751067315", name: "Digittribe" },
  { id: "act_964256484530707", name: "EV Plaza" },
  { id: "act_1749776588732977", name: "Patnadon Nat-om" },
];

// Meta account_status values
const STATUS_NAMES: Record<number, string> = {
  1: "ACTIVE",
  2: "DISABLED",
  3: "UNSETTLED",
  7: "PENDING_RISK_REVIEW",
  8: "PENDING_SETTLEMENT",
  9: "IN_GRACE_PERIOD",
  100: "PENDING_CLOSURE",
  101: "CLOSED",
  201: "ANY_ACTIVE",
  202: "ANY_CLOSED",
};

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } });
  const conn = await prisma.metaConnection.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  const token = decrypt(conn.accessTokenEncrypted);

  for (const c of CANDIDATES) {
    const url = new URL(`https://graph.facebook.com/v23.0/${c.id}`);
    url.searchParams.set(
      "fields",
      "name,account_status,disable_reason,currency,timezone_name,is_personal,business",
    );
    url.searchParams.set("access_token", token);
    const res = await fetch(url.toString());
    const body = (await res.json()) as Record<string, unknown>;
    const status = body.account_status as number | undefined;
    const statusName = status !== undefined ? STATUS_NAMES[status] ?? `?(${status})` : "?";
    const biz = body.business as { id?: string; name?: string } | undefined;
    console.log(
      `${statusName.padEnd(10)} ${c.id.padEnd(22)} ${c.name.padEnd(20)} biz=${biz?.name ?? "personal"}${body.disable_reason ? " disable=" + body.disable_reason : ""}`,
    );
  }

  await prisma.$disconnect();
}
main().catch(console.error);
