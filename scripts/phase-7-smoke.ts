// Phase 7.1 smoke — AI Master chat with tool use.
//
// Scenarios:
//   1. Create conversation
//   2. Send message asking AI to list campaigns → AI calls listCampaigns
//      tool → tool returns real DB data → AI responds in Thai with the list
//   3. AIMessage rows persisted (user + assistant + tool_result)
//   4. Tool actually returned data from the right scope
//
// Run: npx dotenv -e .env.local -- npx tsx scripts/phase-7-smoke.ts
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

  console.log("\n🤖 Phase 7.1 smoke — AI Master\n");
  console.log(`Target: ${PROD}\n`);

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

  // ---- 1. Create conversation ----
  console.log("[1] Create conversation");
  const createRes = await fetch(
    `${PROD}/api/ai/conversations?tenantSlug=${tenant.slug}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({}),
    },
  );
  const createData = await createRes.json();
  rec(
    "1. POST /api/ai/conversations → 200 with id",
    createRes.status === 200 && !!createData.conversationId,
    `id=${createData.conversationId?.slice(0, 8)}...`,
  );

  const conversationId: string = createData.conversationId;
  if (!conversationId) {
    process.exit(1);
  }

  // ---- 2. Send message asking for campaign list ----
  console.log("\n[2] Send message — 'list active campaigns'");
  const sendRes = await fetch(
    `${PROD}/api/ai/conversations/${conversationId}/messages?tenantSlug=${tenant.slug}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ message: "list active campaigns ของ tenant นี้" }),
    },
  );
  const sendData = await sendRes.json();
  rec(
    "2a. send → 200",
    sendRes.status === 200,
    `status=${sendRes.status}`,
  );
  rec(
    "2b. AI returned assistantMessage",
    typeof sendData.assistantMessage === "string" &&
      sendData.assistantMessage.length > 5,
    sendData.assistantMessage
      ? `"${sendData.assistantMessage.slice(0, 80)}..."`
      : "(empty)",
  );
  rec(
    "2c. AI called at least 1 tool",
    Array.isArray(sendData.executedTools) && sendData.executedTools.length >= 1,
    `${sendData.executedTools?.length ?? 0} tools`,
  );
  if (sendData.executedTools?.length > 0) {
    const calledNames = sendData.executedTools.map((t: { name: string }) => t.name);
    rec(
      "2d. AI called listCampaigns",
      calledNames.includes("listCampaigns"),
      `tools called: ${calledNames.join(", ")}`,
    );
  }

  // ---- 3. Persistence check ----
  console.log("\n[3] DB persistence");
  const messages = await prisma.aIMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });
  rec(
    "3a. at least 3 messages persisted (user + assistant + tool_result)",
    messages.length >= 3,
    `${messages.length} messages`,
  );
  const roles = messages.map((m) => m.role);
  rec(
    "3b. has user role",
    roles.includes("user"),
  );
  rec(
    "3c. has assistant role",
    roles.includes("assistant"),
  );
  rec(
    "3d. has tool_result role",
    roles.includes("tool_result"),
  );

  // ---- 4. Token usage ----
  console.log("\n[4] Token accounting");
  rec(
    "4. promptTokens + completionTokens > 0",
    sendData.usage?.promptTokens > 0 && sendData.usage?.completionTokens > 0,
    `prompt=${sendData.usage?.promptTokens} completion=${sendData.usage?.completionTokens}`,
  );

  // Cleanup
  console.log("\nCleanup test conversation...");
  await prisma.aIConversation.delete({ where: { id: conversationId } });

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
