// Force-regenerate yesterday's daily report so we can inspect the new
// campaign-goal-aware AI output end-to-end.
//
// Run: npx dotenv -e .env.local -- npx tsx scripts/regenerate-latest-report.ts
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

async function main() {
  const cs = process.env.DATABASE_URL!;
  const adapter = new PrismaNeon({ connectionString: cs });
  const prisma = new PrismaClient({ adapter });

  const tenant = await prisma.tenant.findFirst({
    where: { metaConnection: { status: "ACTIVE" } },
    select: { id: true, slug: true },
  });
  if (!tenant) throw new Error("No tenant with active Meta connection");

  // Delete any existing report for "yesterday" so we get a fresh AI call.
  const yesterdayBkk = new Date(Date.now() + 7 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const reportDate = new Date(`${yesterdayBkk}T00:00:00.000Z`);
  console.log(`Regenerating report for tenant ${tenant.slug} on ${yesterdayBkk}\n`);
  await prisma.dailyReport.deleteMany({
    where: { tenantId: tenant.id, reportDate },
  });

  const { generateDailyReport } = await import("../src/lib/reports/daily-report");
  const t0 = Date.now();
  const result = await generateDailyReport({
    tenantId: tenant.id,
    reportDate: yesterdayBkk,
    sendEmail: false,
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`\nResult: ${result.status} in ${elapsed}s`);
  if (result.status === "failed") {
    console.error("Error:", result.error);
    process.exit(1);
  }
  if (result.status === "completed") {
    const report = await prisma.dailyReport.findUnique({
      where: { id: result.reportId },
      select: {
        contentMd: true,
        promptTokens: true,
        completionTokens: true,
        estimatedCostUsd: true,
      },
    });
    console.log(`Tokens: ${report?.promptTokens} prompt / ${report?.completionTokens} completion`);
    console.log(`Cost:   $${report?.estimatedCostUsd?.toFixed(6)}\n`);
    console.log("---------- AI report (first 2500 chars) ----------");
    console.log((report?.contentMd ?? "").slice(0, 2500));
    console.log("--------------------------------------------------");
  }
}

main()
  .catch((e) => {
    console.error("❌ Failed:", e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
