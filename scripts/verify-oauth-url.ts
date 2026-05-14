/**
 * Verify the live OAuth URL constructs correctly with the new APP_URL.
 * Hits the actual prod endpoint with a signed session for the demo
 * tenant's OWNER, captures Meta's redirect URL, and prints the
 * redirect_uri so we can confirm it's not localhost / empty.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { sealData } from "iron-session";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { slug: "demo" },
    include: { members: { where: { role: "OWNER" }, take: 1, include: { user: true } } },
  });
  const owner = tenant.members[0].user;
  const sealed = await sealData(
    { userId: owner.id, email: owner.email, name: owner.name },
    { password: process.env.SESSION_SECRET! },
  );
  const cookie = `adslab_session=${sealed}`;

  const res = await fetch(
    "https://ads-lab.xyz/api/meta/oauth/start?tenantSlug=demo",
    { method: "GET", headers: { cookie }, redirect: "manual" },
  );
  console.log("Status:", res.status);
  const loc = res.headers.get("location");
  console.log("Meta OAuth URL:", loc);
  if (loc) {
    const url = new URL(loc);
    console.log("\nDecoded params:");
    console.log("  client_id:    ", url.searchParams.get("client_id"));
    console.log("  redirect_uri: ", url.searchParams.get("redirect_uri"));
    console.log("  scope:        ", url.searchParams.get("scope"));
  }

  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
