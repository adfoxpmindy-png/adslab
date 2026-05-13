// Phase 6d smoke — naming patterns + templates + AI suggest.
//
// Scenarios:
//   A. TenantScope.campaignNamePatterns persists
//   B. getEffectiveScope expands patterns to real campaign IDs
//   C. Union with explicit campaignIds (no double-count)
//   D. renderTemplate produces correct strings for placeholders
//   E. templateToRegex matches generated names
//   F. detectPatternsFromNames groups by skeleton
//   G. NamingTemplate CRUD (create/list/delete)
//
// Run: npx dotenv -e .env.local -- npx tsx scripts/phase-6d-smoke.ts
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import {
  setTenantScope,
  getEffectiveScope,
  expandCampaignPatterns,
} from "../src/lib/tenant-scope";
import {
  renderTemplate,
  templateToRegex,
  detectPatternsFromNames,
} from "../src/lib/naming-template";

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

  console.log("\n🧪 Phase 6d smoke — naming\n");

  const tenant = await prisma.tenant.findFirst({
    where: { metaConnection: { status: "ACTIVE" } },
    select: { id: true, slug: true },
  });
  if (!tenant) throw new Error("No tenant");
  const member = await prisma.tenantMember.findFirst({
    where: { tenantId: tenant.id, role: "OWNER" },
    select: { userId: true },
  });
  if (!member) throw new Error("No OWNER");

  const prevScope = await prisma.tenantScope.findUnique({
    where: { tenantId: tenant.id },
  });
  await prisma.tenantScope.deleteMany({ where: { tenantId: tenant.id } });

  // ---- D-E: renderTemplate + templateToRegex ----
  console.log("[D-E] Template rendering + regex");
  // Fix the date so smoke is deterministic
  const fixedDate = new Date(Date.UTC(2026, 5, 13)); // 2026-06-13 UTC
  const rendered = renderTemplate("CPS_{MM}{YY}", { date: fixedDate });
  // BKK = UTC+7, so still 2026-06-13 (13 Jun 02:00 → 09:00 BKK same day)
  rec(
    "D. renderTemplate substitutes MM + YY",
    rendered === "CPS_0626",
    rendered,
  );
  const rendered2 = renderTemplate("Lead_{Region}_{YYYY}{MM}", {
    date: fixedDate,
    custom: { Region: "BKK" },
  });
  rec(
    "D2. custom placeholder {Region} substitutes from ctx",
    rendered2 === "Lead_BKK_202606",
    rendered2,
  );

  const re = templateToRegex("CPS_{MM}{YY}");
  rec("E1. matches CPS_0626", re.test("CPS_0626"));
  rec("E2. doesn't match CPS_xxyy", !re.test("CPS_xxyy"));
  rec("E3. doesn't match Lead_0626", !re.test("Lead_0626"));

  // ---- F: detectPatternsFromNames ----
  console.log("\n[F] detectPatternsFromNames");
  const groups = detectPatternsFromNames(
    ["CPS0426", "CPS0526", "CPS0626", "Lead_BKK", "Lead_CNX"],
    2,
    5,
  );
  rec(
    "F1. groups CPS#### together",
    groups.some((g) => g.skeleton === "CPS####" && g.count === 3),
    JSON.stringify(groups.find((g) => g.skeleton === "CPS####")),
  );
  // Skeletons only collapse digits → "#"; alpha tokens stay literal.
  // Lead_BKK and Lead_CNX are different skeletons (no digits to collapse),
  // so they should NOT group together — confirms detector is conservative.
  rec(
    "F2. alpha-only names do NOT collapse (digits-only skeleton)",
    !groups.some((g) => g.skeleton === "Lead_###" || g.skeleton === "Lead_AAA"),
  );

  // ---- A-C: TenantScope patterns + expansion ----
  console.log("\n[A-C] Pattern expansion via DB");
  // Find some real campaigns to test against
  const conn = await prisma.metaConnection.findUnique({
    where: { tenantId: tenant.id },
    select: { id: true },
  });
  const realCampaigns = conn
    ? await prisma.metaCampaign.findMany({
        where: { metaConnectionId: conn.id },
        take: 5,
        select: { metaCampaignId: true, name: true },
      })
    : [];

  if (realCampaigns.length === 0) {
    rec("A-C. skipped (no campaigns in tenant)", true);
  } else {
    // Pick a substring that appears in at least one campaign name
    const sample = realCampaigns[0];
    const fragment = sample.name.slice(0, Math.min(4, sample.name.length));

    await setTenantScope(tenant.id, {
      accountIds: null,
      campaignIds: null,
      campaignNamePatterns: [
        { pattern: fragment, kind: "contains", caseInsensitive: true },
      ],
    });

    // A. persisted shape
    const saved = await prisma.tenantScope.findUnique({
      where: { tenantId: tenant.id },
      select: { campaignNamePatterns: true },
    });
    const persisted = saved?.campaignNamePatterns as unknown[];
    rec(
      "A. campaignNamePatterns persisted",
      Array.isArray(persisted) && persisted.length === 1,
      JSON.stringify(persisted),
    );

    // B. expansion returns at least the sample campaign
    const expanded = await expandCampaignPatterns(
      tenant.id,
      [{ pattern: fragment, kind: "contains", caseInsensitive: true }],
      null,
    );
    rec(
      "B. pattern expansion finds matching campaign id",
      expanded.includes(sample.metaCampaignId),
      `${expanded.length} matched`,
    );

    // C. getEffectiveScope unions explicit + pattern
    const otherCampaignId =
      realCampaigns[1]?.metaCampaignId ?? "fake-not-in-db";
    await setTenantScope(tenant.id, {
      accountIds: null,
      campaignIds: [otherCampaignId],
      campaignNamePatterns: [
        { pattern: fragment, kind: "contains", caseInsensitive: true },
      ],
    });
    const eff = await getEffectiveScope(member.userId, tenant.id);
    rec(
      "C. effective.campaignIds unions explicit + matched",
      eff.campaignIds !== null &&
        eff.campaignIds.includes(sample.metaCampaignId) &&
        eff.campaignIds.includes(otherCampaignId),
      `${eff.campaignIds?.length} total`,
    );
  }

  // ---- G: NamingTemplate CRUD ----
  console.log("\n[G] NamingTemplate CRUD");
  await prisma.namingTemplate.deleteMany({
    where: { tenantId: tenant.id, name: "Smoke Test Template" },
  });

  const created = await prisma.namingTemplate.create({
    data: {
      tenantId: tenant.id,
      createdByUserId: member.userId,
      name: "Smoke Test Template",
      pattern: "TEST_{MM}{YY}",
      description: "smoke",
      isDefault: true,
    },
  });
  rec("G1. NamingTemplate created", !!created.id);

  const listed = await prisma.namingTemplate.findMany({
    where: { tenantId: tenant.id, name: "Smoke Test Template" },
  });
  rec("G2. NamingTemplate listed", listed.length === 1);

  await prisma.namingTemplate.delete({ where: { id: created.id } });
  const after = await prisma.namingTemplate.findUnique({
    where: { id: created.id },
  });
  rec("G3. NamingTemplate deleted", after === null);

  // ---- Restore ----
  console.log("\nRestore...");
  await prisma.tenantScope.deleteMany({ where: { tenantId: tenant.id } });
  if (prevScope) {
    await prisma.tenantScope.create({
      data: {
        tenantId: tenant.id,
        accountIds: prevScope.accountIds as never,
        campaignIds: prevScope.campaignIds as never,
        campaignNamePatterns: (prevScope.campaignNamePatterns ?? []) as never,
      },
    });
  }

  await prisma.$disconnect();

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
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
