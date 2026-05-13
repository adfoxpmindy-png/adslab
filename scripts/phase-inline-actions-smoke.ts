// Smoke test for add-inline-actions (Stage 1 v3).
//
// Scenarios:
//   Unit (no AI / DB writes):
//   1. extractActionsBlock — valid JSON fenced block → returns inner content
//   2. extractActionsBlock — markdown without block → null
//   3. extractActionsBlock — heuristic fallback for plain `json` fence with "actions"
//   4. stripActionsBlock — removes block from markdown
//
//   Validation (DB-backed):
//   5. extractAndValidateActions — valid PAUSE on ACTIVE campaign → kept
//   6. Drop: unknown metaCampaignId → empty
//   7. Drop: PAUSE on already-PAUSED campaign
//   8. Drop: SET_BUDGET on ABO campaign
//   9. Drop: SET_END_DATE in past
//  10. Mixed valid + invalid → only valid kept
//
//   API (apply/dismiss):
//  11. Dismiss → suggestion.status = "dismissed", no Meta call
//  12. Apply pause → suggestion.status = "applied" + appliedLogId set
//  13. Apply on already-applied → 409
//  14. Apply on dismissed → 409
//
// Run: npx dotenv -e .env.local -- npx tsx scripts/phase-inline-actions-smoke.ts
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const BASE = process.env.APP_URL ?? "http://localhost:3000";

type CookieJar = { value: string };

async function api(
  path: string,
  init: RequestInit & { cookieJar?: CookieJar } = {},
): Promise<{ status: number; body: any }> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (init.cookieJar?.value) headers.set("Cookie", init.cookieJar.value);
  const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie && init.cookieJar) {
    const m = setCookie.match(/^([^;]+)/);
    if (m) init.cookieJar.value = m[1];
  }
  const text = await res.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch {}
  return { status: res.status, body };
}

function assert(cond: any, label: string) {
  if (cond) console.log(`   ✓ ${label}`);
  else {
    console.log(`   ✗ ${label}`);
    process.exit(1);
  }
}

async function main() {
  console.log("\n🧪 Inline actions smoke test\n");

  const cs = process.env.DATABASE_URL!;
  const adapter = new PrismaNeon({ connectionString: cs });
  const prisma = new PrismaClient({ adapter });

  // ====== Unit: extract / strip ======
  console.log("[1-4] Unit: extract + strip");
  const { extractActionsBlock, stripActionsBlock, extractAndValidateActions } = await import(
    "../src/lib/reports/extract-actions"
  );

  const sample = `# Report
Some text.

\`\`\`json suggested-actions
{
  "actions": [
    { "metaCampaignId": "111", "action": "PAUSE", "reason": "test" }
  ]
}
\`\`\`
`;
  assert(extractActionsBlock(sample) !== null, "extracts tagged block");
  assert(
    extractActionsBlock("# No block here\nJust markdown") === null,
    "returns null when no block",
  );

  const fallback = `# Report
\`\`\`json
{ "actions": [{ "metaCampaignId": "111", "action": "PAUSE", "reason": "x" }] }
\`\`\`
`;
  assert(extractActionsBlock(fallback) !== null, "heuristic fallback for plain json fence");

  const stripped = stripActionsBlock(sample);
  assert(!stripped.includes("suggested-actions"), "strip removes block");
  assert(stripped.includes("Some text"), "strip preserves body");

  // ====== Setup tenant + campaigns ======
  const tenant = await prisma.tenant.findFirst({
    where: { metaConnection: { status: "ACTIVE" } },
    select: {
      id: true,
      slug: true,
      members: {
        where: { role: "OWNER" },
        select: { user: { select: { id: true, email: true } } },
        take: 1,
      },
    },
  });
  if (!tenant) {
    console.log("❌ No tenant with active Meta connection");
    process.exit(1);
  }
  const owner = tenant.members[0].user;

  const activeCampaign = await prisma.metaCampaign.findFirst({
    where: { connection: { tenantId: tenant.id }, effectiveStatus: "ACTIVE" },
    select: { id: true, metaCampaignId: true, name: true },
  });
  const pausedCampaign = await prisma.metaCampaign.findFirst({
    where: { connection: { tenantId: tenant.id }, effectiveStatus: "PAUSED" },
    select: { id: true, metaCampaignId: true, name: true },
  });
  const aboCampaign = await prisma.metaCampaign.findFirst({
    where: { connection: { tenantId: tenant.id }, dailyBudget: null, lifetimeBudget: null },
    select: { id: true, metaCampaignId: true, name: true },
  });
  if (!activeCampaign || !pausedCampaign) {
    console.log("❌ Need both ACTIVE and PAUSED campaigns to test");
    process.exit(1);
  }
  console.log(`\n   Active campaign: ${activeCampaign.name}`);
  console.log(`   Paused campaign: ${pausedCampaign.name}`);
  if (aboCampaign) console.log(`   ABO campaign:    ${aboCampaign.name}`);

  // ====== Validation tests ======
  function makeMd(actions: unknown[]): string {
    return `# Report\n\n\`\`\`json suggested-actions\n${JSON.stringify({ actions })}\n\`\`\`\n`;
  }

  console.log("\n[5] Valid PAUSE on ACTIVE campaign → kept");
  const v1 = await extractAndValidateActions(
    makeMd([{ metaCampaignId: activeCampaign.metaCampaignId, action: "PAUSE", reason: "test" }]),
    tenant.id,
  );
  assert(v1.length === 1, `1 valid action (got ${v1.length})`);
  assert(v1[0].internalCampaignId === activeCampaign.id, "internalCampaignId mapped");

  console.log("\n[6] Drop: unknown metaCampaignId");
  const v2 = await extractAndValidateActions(
    makeMd([{ metaCampaignId: "9999999999999", action: "PAUSE", reason: "test" }]),
    tenant.id,
  );
  assert(v2.length === 0, "dropped");

  console.log("\n[7] Drop: PAUSE on already-PAUSED");
  const v3 = await extractAndValidateActions(
    makeMd([{ metaCampaignId: pausedCampaign.metaCampaignId, action: "PAUSE", reason: "test" }]),
    tenant.id,
  );
  assert(v3.length === 0, "dropped");

  if (aboCampaign) {
    console.log("\n[8] Drop: SET_BUDGET on ABO");
    const v4 = await extractAndValidateActions(
      makeMd([
        {
          metaCampaignId: aboCampaign.metaCampaignId,
          action: "SET_BUDGET",
          params: { dailyBudget: 100 },
          reason: "test",
        },
      ]),
      tenant.id,
    );
    assert(v4.length === 0, "dropped");
  }

  console.log("\n[9] Drop: SET_END_DATE in past");
  const pastIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const v5 = await extractAndValidateActions(
    makeMd([
      {
        metaCampaignId: activeCampaign.metaCampaignId,
        action: "SET_END_DATE",
        params: { endTime: pastIso },
        reason: "test",
      },
    ]),
    tenant.id,
  );
  assert(v5.length === 0, "dropped");

  console.log("\n[10] Mixed: valid PAUSE + invalid → only valid kept");
  const v6 = await extractAndValidateActions(
    makeMd([
      { metaCampaignId: activeCampaign.metaCampaignId, action: "PAUSE", reason: "ok" },
      { metaCampaignId: "9999999999999", action: "PAUSE", reason: "bad id" },
    ]),
    tenant.id,
  );
  assert(v6.length === 1, "1 of 2 kept");

  // ====== API tests ======
  console.log("\n[11-14] API: apply / dismiss via report row");

  // Create a synthetic report row with 2 pending suggestions.
  const testDate = new Date("2026-05-01T00:00:00.000Z");
  // Clean up any prior test report on this date.
  await prisma.dailyReport.deleteMany({
    where: { tenantId: tenant.id, reportDate: testDate },
  });
  const { randomUUID } = await import("node:crypto");
  const suggA = {
    id: randomUUID(),
    internalCampaignId: pausedCampaign.id,
    metaCampaignId: pausedCampaign.metaCampaignId,
    campaignName: pausedCampaign.name,
    action: "RESUME",
    reason: "test resume",
    status: "pending",
  };
  const suggB = {
    id: randomUUID(),
    internalCampaignId: activeCampaign.id,
    metaCampaignId: activeCampaign.metaCampaignId,
    campaignName: activeCampaign.name,
    action: "PAUSE",
    reason: "test pause then we'll restore",
    status: "pending",
  };
  const report = await prisma.dailyReport.create({
    data: {
      tenantId: tenant.id,
      reportDate: testDate,
      status: "COMPLETED",
      contentMd: "# Test",
      suggestedActions: [suggA, suggB] as unknown as object,
    },
  });

  // Login
  const jar: CookieJar = { value: "" };
  await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: owner.email, password: "admin123" }),
    cookieJar: jar,
  });

  // [11] Dismiss suggA
  console.log("\n[11] Dismiss");
  const r1 = await api(`/api/reports/suggestion?tenantSlug=${tenant.slug}`, {
    method: "POST",
    body: JSON.stringify({
      reportId: report.id,
      suggestionId: suggA.id,
      decision: "dismiss",
    }),
    cookieJar: jar,
  });
  assert(r1.status === 200, `200 (got ${r1.status})`);
  assert(r1.body.suggestion.status === "dismissed", "status=dismissed");

  // [12] Apply suggB (pause the active campaign)
  console.log("\n[12] Apply pause on ACTIVE campaign");
  const r2 = await api(`/api/reports/suggestion?tenantSlug=${tenant.slug}`, {
    method: "POST",
    body: JSON.stringify({
      reportId: report.id,
      suggestionId: suggB.id,
      decision: "apply",
    }),
    cookieJar: jar,
  });
  assert(r2.status === 200, `200 (got ${r2.status}, body=${JSON.stringify(r2.body).slice(0, 200)})`);
  assert(r2.body.suggestion.status === "applied", "status=applied");
  assert(typeof r2.body.suggestion.appliedLogId === "string", "appliedLogId set");

  // [13] Apply again → 409
  console.log("\n[13] Apply again → 409");
  const r3 = await api(`/api/reports/suggestion?tenantSlug=${tenant.slug}`, {
    method: "POST",
    body: JSON.stringify({
      reportId: report.id,
      suggestionId: suggB.id,
      decision: "apply",
    }),
    cookieJar: jar,
  });
  assert(r3.status === 409, `409 (got ${r3.status})`);

  // [14] Apply dismissed → 409
  console.log("\n[14] Apply on dismissed → 409");
  const r4 = await api(`/api/reports/suggestion?tenantSlug=${tenant.slug}`, {
    method: "POST",
    body: JSON.stringify({
      reportId: report.id,
      suggestionId: suggA.id,
      decision: "apply",
    }),
    cookieJar: jar,
  });
  assert(r4.status === 409, `409 (got ${r4.status})`);

  // Cleanup: restore the campaign we paused, and delete the test report.
  console.log("\n[*] Cleanup: resume the campaign we paused for testing");
  const { performCampaignAction } = await import("../src/lib/meta/campaign-actions");
  await performCampaignAction({
    tenantId: tenant.id,
    userId: owner.id,
    campaignId: activeCampaign.id,
    action: "RESUME",
  });
  await prisma.dailyReport.delete({ where: { id: report.id } });
  console.log("   ✓ cleaned up");

  console.log("\n✅ Inline actions smoke test complete\n");
}

main()
  .catch((e) => {
    console.error("❌ Failed:", e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
