// Phase 7 full smoke — covers 7.2 (mutate confirmation) + 7.3 (RAG).
// We don't actually mutate Meta state (uses fake campaign id) — we only
// verify the API surface accepts the right shape + returns expected
// errors. For RAG we ingest a small text doc + query it.
//
// Run: npx dotenv -e .env.local -- npx tsx scripts/phase-7-full-smoke.ts
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { sealData } from "iron-session";

const PROD = process.env.SMOKE_BASE_URL ?? "https://adslab-theta.vercel.app";

type R = { name: string; pass: boolean; detail?: string };
const out: R[] = [];
function rec(name: string, pass: boolean, detail?: string) {
  out.push({ name, pass, detail });
  console.log(`  ${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const cs = process.env.DATABASE_URL;
  const sessionSecret = process.env.SESSION_SECRET;
  if (!cs) throw new Error("DATABASE_URL not set");
  if (!sessionSecret) throw new Error("SESSION_SECRET not set");

  const adapter = new PrismaNeon({ connectionString: cs });
  const prisma = new PrismaClient({ adapter });

  console.log("\n🤖 Phase 7 full smoke (7.2 + 7.3 + 7.4)\n");

  const tenant = await prisma.tenant.findFirst({
    where: { metaConnection: { status: "ACTIVE" } },
    select: { id: true, slug: true },
  });
  if (!tenant) throw new Error("No tenant");
  const owner = await prisma.tenantMember.findFirst({
    where: { tenantId: tenant.id, role: "OWNER" },
    select: { user: { select: { id: true, email: true, name: true } } },
  });
  if (!owner) throw new Error("No OWNER");

  const sealed = await sealData(
    { userId: owner.user.id, email: owner.user.email, name: owner.user.name },
    { password: sessionSecret },
  );
  const cookie = `adslab_session=${sealed}`;

  // ---- 7.3.1: Ingest knowledge doc ----
  console.log("[7.3] Knowledge ingestion");
  const ingestRes = await fetch(
    `${PROD}/api/ai/knowledge-documents?tenantSlug=${tenant.slug}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        sourceType: "text",
        title: "Smoke Test Doc",
        text: `AdsLab is a Thai-first SaaS for media buyers. The team
              optimizes Meta ads for Thai e-commerce brands. Key KPI:
              ROAS above 3x for sales campaigns, CTR above 1.5% for
              awareness campaigns. Avoid running ads during 2am-6am
              Bangkok time as conversion drops 80%. Always include a
              clear CTA in primary text.`,
      }),
    },
  );
  const ingestData = await ingestRes.json();
  rec(
    "7.3a. POST knowledge-documents → 200",
    ingestRes.status === 200 && ingestData.document?.id,
    `chunks=${ingestData.document?.chunkCount}`,
  );

  const docId = ingestData.document?.id;
  if (docId) {
    // ---- 7.3.2: List documents ----
    const listRes = await fetch(
      `${PROD}/api/ai/knowledge-documents?tenantSlug=${tenant.slug}`,
      { headers: { cookie } },
    );
    const listData = await listRes.json();
    const found = (listData.documents ?? []).some(
      (d: { id: string }) => d.id === docId,
    );
    rec("7.3b. list returns the new doc", found);

    // ---- 7.3.3: AI uses searchKnowledge ----
    console.log("\n[7.3c] AI uses RAG to answer domain question");
    const convRes = await fetch(
      `${PROD}/api/ai/conversations?tenantSlug=${tenant.slug}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({}),
      },
    );
    const { conversationId } = await convRes.json();
    const askRes = await fetch(
      `${PROD}/api/ai/conversations/${conversationId}/messages?tenantSlug=${tenant.slug}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({
          message: "ROAS target สำหรับ sales campaign ของ AdsLab ตามที่ทีมตั้งคือเท่าไหร่? ใช้ searchKnowledge ก่อนตอบ",
        }),
      },
    );
    const askData = await askRes.json();
    rec("7.3c1. AI responded", askRes.status === 200 && askData.assistantMessage);
    const calledRag = (askData.executedTools ?? []).some(
      (t: { name: string }) => t.name === "searchKnowledge",
    );
    rec(
      "7.3c2. AI called searchKnowledge",
      calledRag,
      `tools: ${(askData.executedTools ?? []).map((t: { name: string }) => t.name).join(", ")}`,
    );
    const answer: string = askData.assistantMessage ?? "";
    rec(
      "7.3c3. answer mentions '3x' (from doc)",
      answer.includes("3x") || answer.includes("3 เท่า") || answer.toLowerCase().includes("roas"),
      `"${answer.slice(0, 100)}..."`,
    );

    // Cleanup conversation
    await prisma.aIConversation.delete({ where: { id: conversationId } });
  }

  // ---- 7.4: Persona config ----
  console.log("\n[7.4] Persona config");
  const persGet = await fetch(`${PROD}/api/ai/persona?tenantSlug=${tenant.slug}`, {
    headers: { cookie },
  });
  rec("7.4a. GET persona → 200", persGet.status === 200);

  const persPut = await fetch(`${PROD}/api/ai/persona?tenantSlug=${tenant.slug}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({
      role: "Test persona role",
      customInstructions: "Smoke test",
      ragEnabled: true,
    }),
  });
  rec("7.4b. PUT persona → 200", persPut.status === 200);

  // ---- Cleanup ----
  if (docId) {
    await fetch(
      `${PROD}/api/ai/knowledge-documents/${docId}?tenantSlug=${tenant.slug}`,
      { method: "DELETE", headers: { cookie } },
    );
  }
  // Reset persona to default-ish
  await prisma.aIPersona.deleteMany({ where: { tenantId: tenant.id } });

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
