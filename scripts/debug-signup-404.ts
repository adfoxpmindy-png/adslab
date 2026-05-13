// Reproduce the "404 after signup" bug.
//
// What we do:
//   1. POST /api/auth/signup with a fresh email
//   2. Capture the session cookie from the response
//   3. GET /t/<new-tenant-slug>/dashboard using that cookie
//   4. Inspect status + redirect chain
//   5. Verify the tenant row + membership row exist in DB
//
// Run: npx dotenv -e .env.local -- npx tsx scripts/debug-signup-404.ts
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const PROD = process.env.SMOKE_BASE_URL ?? "https://adslab-theta.vercel.app";

async function main() {
  const cs = process.env.DATABASE_URL;
  if (!cs) throw new Error("DATABASE_URL not set");
  const adapter = new PrismaNeon({ connectionString: cs });
  const prisma = new PrismaClient({ adapter });

  console.log("\n🐛 Debug: 404 after signup\n");
  console.log(`Target: ${PROD}\n`);

  const stamp = Date.now();
  const email = `debug-signup-${stamp}@example.com`;
  const password = "Adslab1234!";
  const tenantName = `Debug Tenant ${stamp}`;
  const name = "Debug User";

  // ---- 1. Signup ----
  console.log("[1] POST /api/auth/signup");
  const signupRes = await fetch(`${PROD}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name, tenantName }),
    redirect: "manual",
  });
  console.log(`   status: ${signupRes.status}`);
  const setCookie = signupRes.headers.get("set-cookie");
  console.log(`   set-cookie: ${setCookie?.slice(0, 80)}...`);

  if (!signupRes.ok) {
    const errBody = await signupRes.text();
    console.log(`   error body: ${errBody}`);
    process.exit(1);
  }

  const signupData = await signupRes.json();
  console.log(`   tenant.slug: "${signupData.tenant?.slug}"`);
  console.log(`   user.id: ${signupData.user?.id}`);

  // Extract session cookie value
  const sessionCookieMatch = setCookie?.match(/adslab_session=([^;]+)/);
  const sessionValue = sessionCookieMatch?.[1];
  if (!sessionValue) {
    console.log("   ❌ No session cookie returned!");
    process.exit(1);
  }

  // ---- 2. Verify DB rows ----
  console.log("\n[2] Verify DB state");
  const tenantRow = await prisma.tenant.findUnique({
    where: { slug: signupData.tenant.slug },
    select: {
      id: true,
      name: true,
      slug: true,
      members: { select: { userId: true, role: true } },
    },
  });
  if (!tenantRow) {
    console.log(`   ❌ tenant row NOT found in DB`);
  } else {
    console.log(`   ✓ tenant: ${tenantRow.name} (${tenantRow.slug})`);
    console.log(`   ✓ members: ${tenantRow.members.length}`);
    for (const m of tenantRow.members) {
      console.log(`       - ${m.userId} role=${m.role}`);
    }
  }

  // ---- 3. Dashboard request with session cookie ----
  console.log("\n[3] GET dashboard with session cookie");
  const dashUrl = `${PROD}/t/${signupData.tenant.slug}/dashboard`;
  console.log(`   URL: ${dashUrl}`);
  const dashRes = await fetch(dashUrl, {
    headers: {
      cookie: `adslab_session=${sessionValue}`,
    },
    redirect: "manual",
  });
  console.log(`   status: ${dashRes.status}`);
  const location = dashRes.headers.get("location");
  if (location) console.log(`   redirect → ${location}`);

  const html = await dashRes.text();
  if (dashRes.status === 404) {
    console.log("   ❌ 404 — confirmed bug");
    // Print a snippet to see what's rendered
    console.log(`   body snippet (first 200 chars):`);
    console.log(`   ${html.slice(0, 200).replace(/\s+/g, " ")}`);
  } else if (dashRes.status === 200) {
    console.log("   ✓ 200 OK");
  } else if (dashRes.status >= 300 && dashRes.status < 400) {
    console.log(`   ↪ redirect to ${location}`);
  } else {
    console.log(`   ⚠ unexpected status ${dashRes.status}`);
  }

  // ---- 4. Cleanup ----
  console.log("\n[4] Cleanup test user + tenant");
  if (tenantRow) {
    await prisma.tenantMember.deleteMany({ where: { tenantId: tenantRow.id } });
    await prisma.tenant.delete({ where: { id: tenantRow.id } });
  }
  await prisma.emailVerificationToken.deleteMany({
    where: { user: { email } },
  });
  await prisma.user.deleteMany({ where: { email } });

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
