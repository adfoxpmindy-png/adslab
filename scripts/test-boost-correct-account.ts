/**
 * Same as test-boost-e2e but overrides the brief's metaAccountId to
 * the correct EV Plaza ad account (act_964256484530707) which has
 * actual access to boost EV Plaza Page posts.
 *
 * Goal: prove that everything else in the pipeline works once the
 * Page → AdAccount linkage is correct.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { sealData } from "iron-session";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const PROD = "https://ads-lab.xyz";
const CORRECT_ACCOUNT = "act_1006870751067315"; // Digittribe — only ACTIVE acct with EV Plaza access
const REAL_PROMPT = `บูสต์วีดีโอให้หน่อยครัย เป็น Views โพสละ 1250 บาท ให้จบพรุ่งนี้ 10.00 น.

https://www.facebook.com/share/v/1AtdSLKovS/
https://www.facebook.com/reel/2046794962859921
https://www.facebook.com/reel/1002568998876934
https://www.facebook.com/reel/994832796325634`;

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

  console.log("→ Step 1: Plan");
  const planRes = await fetch(`${PROD}/api/boost/plan?tenantSlug=demo`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ promptText: REAL_PROMPT }),
  });
  const plan = (await planRes.json()) as {
    ok: boolean;
    jobId: string;
    briefs: Array<{ metaAccountId: string; accountName: string; campaignName: string }>;
  };
  if (!plan.ok) {
    console.log("Plan failed:", plan);
    await prisma.$disconnect();
    return;
  }

  // Override every brief's ad account to the correct one for EV Plaza
  const correctedBriefs = plan.briefs.map((b) => ({
    ...b,
    metaAccountId: CORRECT_ACCOUNT,
    accountName: "EV Plaza",
  }));
  console.log(`  ✓ ${correctedBriefs.length} briefs (overridden account → EV Plaza ad account)`);

  console.log("\n→ Step 2: Execute (PAUSED)");
  const execRes = await fetch(`${PROD}/api/boost/execute?tenantSlug=demo`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({
      jobId: plan.jobId,
      initialStatus: "PAUSED",
      briefs: correctedBriefs,
    }),
  });
  const exec = (await execRes.json()) as {
    ok?: boolean;
    results?: Array<{
      pageName: string;
      status: string;
      campaignMetaId?: string;
      error?: string;
    }>;
    error?: unknown;
  };
  if (!exec.ok) {
    console.log("Execute failed:", JSON.stringify(exec).slice(0, 500));
    await prisma.$disconnect();
    return;
  }

  const ok = exec.results!.filter((r) => r.status === "success").length;
  const failed = exec.results!.filter((r) => r.status === "failed").length;
  console.log(`  Result: ${ok} success, ${failed} failed`);
  for (const r of exec.results!) {
    if (r.status === "success") {
      console.log(`  ✓ ${r.pageName} → Meta campaign id: ${r.campaignMetaId}`);
    } else {
      console.log(`  ✗ ${r.pageName} → ${r.error}`);
    }
  }

  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
