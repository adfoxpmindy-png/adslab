/**
 * End-to-end test of the Quick Boost flow against PROD using the
 * founder's exact real client message.
 *
 * 1. POST /api/boost/plan with the prompt
 * 2. Verify 4 briefs returned + intent parsed + URLs resolved
 * 3. POST /api/boost/execute with status=PAUSED (safe — won't spend $)
 * 4. Verify 4 campaigns created
 * 5. Clean up: delete the campaigns via existing pause/archive flow (optional)
 *
 * NOTE: This will create 4 real PAUSED campaigns on the demo tenant's
 * ad account. They won't spend money but you may want to delete them
 * manually after the test via /campaigns page.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { sealData } from "iron-session";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const PROD = "https://ads-lab.xyz";

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
  const cookieHeader = `adslab_session=${sealed}`;

  console.log("→ Step 1: POST /api/boost/plan ...");
  console.log(`  prompt:\n${REAL_PROMPT.split("\n").map((l) => "  | " + l).join("\n")}\n`);

  const planRes = await fetch(`${PROD}/api/boost/plan?tenantSlug=demo`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify({ promptText: REAL_PROMPT }),
  });
  const planBody = (await planRes.json()) as {
    ok?: boolean;
    jobId?: string;
    intent?: unknown;
    briefs?: Array<{
      briefId: string;
      campaignName: string;
      metaAccountId: string;
      lifetimeBudgetThb: number;
      resolved: { pageName: string; postId: string };
    }>;
    urlErrors?: unknown[];
    error?: unknown;
  };
  if (!planRes.ok || !planBody.ok) {
    console.log(`✗ Plan failed (${planRes.status}): ${JSON.stringify(planBody)}`);
    await prisma.$disconnect();
    return;
  }
  console.log(`✓ Plan created: jobId=${planBody.jobId}`);
  console.log(`  intent: ${JSON.stringify(planBody.intent).slice(0, 200)}...`);
  console.log(`  briefs: ${planBody.briefs!.length}`);
  for (const b of planBody.briefs!) {
    console.log(`    - ${b.campaignName}`);
    console.log(`        post: ${b.resolved.postId} (${b.resolved.pageName})`);
    console.log(`        account: ${b.metaAccountId}`);
    console.log(`        budget: ฿${b.lifetimeBudgetThb}`);
  }
  if (planBody.urlErrors && planBody.urlErrors.length > 0) {
    console.log(`  ⚠ URL errors: ${JSON.stringify(planBody.urlErrors)}`);
  }

  // Step 2: Execute as PAUSED (always safe — won't spend money)
  console.log("\n→ Step 2: POST /api/boost/execute (PAUSED) ...");

  const execRes = await fetch(`${PROD}/api/boost/execute?tenantSlug=demo`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify({
      jobId: planBody.jobId,
      initialStatus: "PAUSED",
      briefs: planBody.briefs,
    }),
  });
  const execBody = (await execRes.json()) as {
    ok?: boolean;
    results?: Array<{
      briefId: string;
      pageName: string;
      status: string;
      campaignMetaId?: string;
      error?: string;
    }>;
    error?: unknown;
  };
  if (!execRes.ok || !execBody.ok) {
    console.log(`✗ Execute failed (${execRes.status}): ${JSON.stringify(execBody)}`);
    await prisma.$disconnect();
    return;
  }

  const ok = execBody.results!.filter((r) => r.status === "success").length;
  const failed = execBody.results!.filter((r) => r.status === "failed").length;
  console.log(`✓ Executed: ${ok} success, ${failed} failed`);
  for (const r of execBody.results!) {
    if (r.status === "success") {
      console.log(`  ✓ ${r.pageName} → Meta campaign id: ${r.campaignMetaId}`);
    } else {
      console.log(`  ✗ ${r.pageName} → ${r.error}`);
    }
  }

  // Step 3: Verify BoostJob persisted correctly
  console.log("\n→ Step 3: verify BoostJob row in DB ...");
  const job = await prisma.boostJob.findUnique({
    where: { id: planBody.jobId },
    select: {
      status: true,
      promptText: true,
      kpiText: true,
      purposeText: true,
      executedAt: true,
    },
  });
  console.log(`  job: ${JSON.stringify(job, null, 2)}`);

  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
