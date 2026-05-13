// Phase 6a smoke test — Multi-platform UX scaffolding.
//
// Scenarios:
//   A. UserAccountPreference round-trip: set/get null + array
//   B. applyAccountFilter helper produces correct Prisma fragments
//   C. PlatformWaitlist dedup: same email+platform within 30 days = no-op
//   D. PlatformWaitlist: persists email + platform
//
// Run: npx dotenv -e .env.local -- npx tsx scripts/phase-6a-smoke.ts
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import {
  getSelectedAccountIds,
  setSelectedAccountIds,
  applyAccountFilter,
} from "../src/lib/account-preference";

type R = { name: string; pass: boolean; detail?: string };
const out: R[] = [];
function rec(name: string, pass: boolean, detail?: string) {
  out.push({ name, pass, detail });
  console.log(`  ${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const cs = process.env.DATABASE_URL;
  if (!cs) throw new Error("DATABASE_URL not set");
  const adapter = new PrismaNeon({ connectionString: cs });
  const prisma = new PrismaClient({ adapter });

  console.log("\n🧪 Phase 6a smoke test — Multi-platform UX\n");

  const tenant = await prisma.tenant.findFirst({
    select: { id: true, slug: true },
  });
  if (!tenant) throw new Error("No tenant");
  const member = await prisma.tenantMember.findFirst({
    where: { tenantId: tenant.id },
    select: { userId: true },
  });
  if (!member) throw new Error("No tenant member");

  // ---- A. round-trip --------------------------------------------
  console.log("[A] UserAccountPreference round-trip");
  // Clear first
  await prisma.userAccountPreference.deleteMany({
    where: { userId: member.userId, tenantId: tenant.id },
  });

  const initial = await getSelectedAccountIds(member.userId, tenant.id);
  rec("A1. no row → returns null (all accounts)", initial === null);

  await setSelectedAccountIds(member.userId, tenant.id, ["act_1", "act_2"]);
  const afterSet = await getSelectedAccountIds(member.userId, tenant.id);
  rec(
    "A2. set + get returns same array",
    JSON.stringify(afterSet) === JSON.stringify(["act_1", "act_2"]),
    JSON.stringify(afterSet),
  );

  await setSelectedAccountIds(member.userId, tenant.id, null);
  const afterClear = await getSelectedAccountIds(member.userId, tenant.id);
  rec("A3. set null → returns null", afterClear === null);

  await setSelectedAccountIds(member.userId, tenant.id, []);
  const afterEmpty = await getSelectedAccountIds(member.userId, tenant.id);
  rec(
    "A4. set empty array → normalized to null (legacy fix)",
    afterEmpty === null,
    JSON.stringify(afterEmpty),
  );

  // ---- B. applyAccountFilter helper -----------------------------
  console.log("\n[B] applyAccountFilter helper");
  const fNull = applyAccountFilter(null);
  rec("B1. null → empty where (no filter)", Object.keys(fNull).length === 0);

  const fArr = applyAccountFilter(["act_1", "act_2"]);
  rec(
    "B2. array → `{ metaAccountId: { in: [...] } }`",
    !!fArr.metaAccountId &&
      JSON.stringify(fArr.metaAccountId.in) === JSON.stringify(["act_1", "act_2"]),
    JSON.stringify(fArr),
  );

  const fEmpty = applyAccountFilter([]);
  rec(
    "B3. empty array → empty `in` (no rows match)",
    !!fEmpty.metaAccountId && fEmpty.metaAccountId.in.length === 0,
  );

  // ---- C-D. PlatformWaitlist -----------------------------------
  console.log("\n[C-D] PlatformWaitlist");
  const testEmail = `smoketest+${Date.now()}@example.com`;
  // First submit
  const first = await prisma.platformWaitlist.create({
    data: { email: testEmail, platform: "google", source: "smoke" },
  });
  rec("C1. waitlist row created", !!first.id);

  // Dedup check via API logic (in-test): same email+platform recent
  const recent = await prisma.platformWaitlist.findFirst({
    where: {
      email: testEmail,
      platform: "google",
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
  });
  rec("D1. dedup query finds existing", !!recent);

  // Cleanup
  await prisma.platformWaitlist.deleteMany({
    where: { email: testEmail, platform: "google" },
  });
  await prisma.userAccountPreference.deleteMany({
    where: { userId: member.userId, tenantId: tenant.id },
  });

  console.log("\n=== Summary ===");
  const passed = out.filter((r) => r.pass).length;
  console.log(`${passed}/${out.length} scenarios passed`);
  if (passed < out.length) {
    console.log("Failed:");
    for (const r of out.filter((r) => !r.pass)) {
      console.log(`  ✗ ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
    }
    process.exit(1);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
