// Comprehensive E2E test — covers all Phase 1 MVP flows.
// Run: npx dotenv -e .env.local -- npx tsx scripts/e2e-test.ts
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

config({ path: ".env.local" });

const BASE = process.env.APP_URL ?? "http://localhost:3000";

type TestResult = { name: string; ok: boolean; details?: string };
const results: TestResult[] = [];

function record(name: string, ok: boolean, details?: string) {
  results.push({ name, ok, details });
  const icon = ok ? "✅" : "❌";
  console.log(`${icon} ${name}${details ? "  — " + details : ""}`);
}

async function api(
  path: string,
  init: RequestInit & { cookieJar?: { value: string } } = {},
): Promise<{ status: number; body: any; setCookie: string | null }> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (init.cookieJar?.value) headers.set("Cookie", init.cookieJar.value);
  const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie && init.cookieJar) {
    // Extract just the cookie name=value from Set-Cookie
    const match = setCookie.match(/^([^;]+)/);
    if (match) init.cookieJar.value = match[1];
  }
  let body: any = null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    body = await res.json();
  } else {
    body = await res.text();
  }
  return { status: res.status, body, setCookie };
}

async function main() {
  const apiKey = process.env.DATABASE_URL;
  if (!apiKey) throw new Error("DATABASE_URL not set");
  const adapter = new PrismaNeon({ connectionString: apiKey });
  const prisma = new PrismaClient({ adapter });

  console.log("\n🧪 E2E test suite — AdsLab Phase 1 MVP\n");

  // -------- Cleanup --------
  // Remove any user records from prior test runs that might clash.
  await prisma.user.deleteMany({
    where: { email: { contains: "e2e-suite" } },
  });
  await prisma.tenant.deleteMany({
    where: { slug: { contains: "e2e-suite" } },
  });

  // ===== Signup =====
  const cookieJar = { value: "" };

  // 1. Signup happy path
  {
    const r = await api("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        name: "E2E Tester",
        email: "e2e-suite-1@example.com",
        password: "secret12345",
        tenantName: "E2E Suite Agency",
      }),
      cookieJar,
    });
    record(
      "1. Signup happy path → 201 + records + slug",
      r.status === 201 && r.body?.tenant?.slug === "e2e-suite-agency",
      `status=${r.status} slug=${r.body?.tenant?.slug}`,
    );
  }

  // 2. Signup duplicate email
  {
    const r = await api("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        name: "Dup",
        email: "e2e-suite-1@example.com",
        password: "secret12345",
        tenantName: "Dup Co",
      }),
    });
    record(
      "2. Signup duplicate email → 409",
      r.status === 409,
      `status=${r.status}`,
    );
  }

  // 3. Signup weak password
  {
    const r = await api("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        name: "Weak",
        email: "e2e-suite-weak@example.com",
        password: "short",
        tenantName: "Weak Co",
      }),
    });
    record(
      "3. Signup weak password → 400",
      r.status === 400 && Boolean(r.body?.fieldErrors?.password),
      `status=${r.status} hasFieldError=${Boolean(r.body?.fieldErrors?.password)}`,
    );
  }

  // 4. Signup short tenant name
  {
    const r = await api("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        name: "X",
        email: "e2e-suite-short@example.com",
        password: "verylongpassword",
        tenantName: "A",
      }),
    });
    record(
      "4. Signup short fields → 400",
      r.status === 400,
      `status=${r.status}`,
    );
  }

  // ===== Login =====

  // 5. Login wrong password
  {
    const r = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "test@test.com", password: "WRONG" }),
    });
    record(
      "5. Login wrong password → 401 generic",
      r.status === 401 && r.body?.error?.includes("ไม่ถูกต้อง"),
      `status=${r.status} body=${JSON.stringify(r.body)}`,
    );
  }

  // 6. Login email not found
  {
    const r = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "no-such-user@example.com", password: "any" }),
    });
    record(
      "6. Login email-not-found → 401 same generic (no enum)",
      r.status === 401 && r.body?.error?.includes("ไม่ถูกต้อง"),
      `status=${r.status}`,
    );
  }

  // 7. Login happy path (seeded user)
  const adminJar = { value: "" };
  {
    const r = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "test@test.com", password: "admin123" }),
      cookieJar: adminJar,
    });
    record(
      "7. Login seeded admin → 200 + redirectTo /t/demo/dashboard",
      r.status === 200 && r.body?.redirectTo === "/t/demo/dashboard",
      `redirectTo=${r.body?.redirectTo}`,
    );
  }

  // 8. Logout idempotent (no session)
  {
    const r = await api("/api/auth/logout", { method: "POST" });
    record(
      "8. Logout without session → 200 idempotent",
      r.status === 200 && r.body?.ok === true,
      `status=${r.status}`,
    );
  }

  // ===== Email verification =====

  // 9. Verify with invalid token
  {
    const r = await api("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token: "not-a-real-token-1234567890" }),
    });
    record(
      "9. Verify invalid token → 404 invalid",
      r.status === 404 && r.body?.status === "invalid",
      `status=${r.status} body=${JSON.stringify(r.body)}`,
    );
  }

  // 10. Verify with a real token (use the one created in test 1)
  const realToken = await prisma.emailVerificationToken.findFirst({
    where: { user: { email: "e2e-suite-1@example.com" }, usedAt: null },
    orderBy: { createdAt: "desc" },
    select: { token: true, userId: true },
  });
  if (realToken) {
    const r = await api("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token: realToken.token }),
    });
    record(
      "10. Verify real token → 200 success",
      r.status === 200 && r.body?.status === "success",
      `status=${r.status}`,
    );

    // Verify DB: emailVerifiedAt should be set
    const user = await prisma.user.findUnique({
      where: { id: realToken.userId },
      select: { emailVerifiedAt: true },
    });
    record(
      "11. After verify → user.emailVerifiedAt is set",
      Boolean(user?.emailVerifiedAt),
      `emailVerifiedAt=${user?.emailVerifiedAt}`,
    );

    // 12. Re-verify same token → "used"
    const r2 = await api("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token: realToken.token }),
    });
    record(
      "12. Verify same token twice → 410 used",
      r2.status === 410 && r2.body?.status === "used",
      `status=${r2.status} body=${JSON.stringify(r2.body)}`,
    );
  } else {
    record("10-12. Real token tests", false, "no token found in DB");
  }

  // 13. Resend without session
  {
    const r = await api("/api/auth/resend-verification", { method: "POST" });
    record(
      "13. Resend (no session) → 401",
      r.status === 401,
      `status=${r.status}`,
    );
  }

  // 14. Resend for already-verified user (admin)
  {
    const r = await api("/api/auth/resend-verification", {
      method: "POST",
      cookieJar: adminJar,
    });
    record(
      "14. Resend (already verified) → 400 + error message",
      r.status === 400 && Boolean(r.body?.error),
      `status=${r.status} body=${JSON.stringify(r.body)}`,
    );
  }

  // ===== Tenant routing =====

  // 15. /t/* without cookie → 307 /login
  {
    const r = await fetch(`${BASE}/t/demo/dashboard`, { redirect: "manual" });
    const loc = r.headers.get("location");
    record(
      "15. /t/demo without cookie → 307 /login?next=...",
      r.status === 307 && loc?.includes("/login") === true && loc?.includes("next=") === true,
      `status=${r.status} location=${loc}`,
    );
  }

  // 16. /t/demo with admin cookie → 200
  {
    const r = await fetch(`${BASE}/t/demo/dashboard`, {
      headers: { Cookie: adminJar.value },
      redirect: "manual",
    });
    record("16. /t/demo with admin cookie → 200", r.status === 200, `status=${r.status}`);
  }

  // 17. /t/nonexistent with admin cookie → 404
  {
    const r = await fetch(`${BASE}/t/this-tenant-does-not-exist/dashboard`, {
      headers: { Cookie: adminJar.value },
      redirect: "manual",
    });
    record(
      "17. /t/nonexistent with admin cookie → 404",
      r.status === 404,
      `status=${r.status}`,
    );
  }

  // ===== Public pages render =====

  // 18. /signup renders
  {
    const r = await fetch(`${BASE}/signup`);
    const html = await r.text();
    record(
      "18. /signup page renders + has form fields",
      r.status === 200 && html.includes("สมัครสมาชิก") && html.includes("tenantName"),
      `status=${r.status}`,
    );
  }

  // 19. /login renders
  {
    const r = await fetch(`${BASE}/login`);
    const html = await r.text();
    record(
      "19. /login page renders + Thai labels",
      r.status === 200 && html.includes("เข้าสู่ระบบ"),
      `status=${r.status}`,
    );
  }

  // 20. /verify-email without token → invalid state shown
  {
    const r = await fetch(`${BASE}/verify-email`);
    const html = await r.text();
    record(
      "20. /verify-email without token → 'invalid' UI",
      r.status === 200 && html.includes("ลิงก์ไม่ถูกต้อง"),
      `status=${r.status}`,
    );
  }

  // ===== Dashboard with admin =====

  // 21. Dashboard shows Connect Meta CTA (no MetaConnection yet)
  {
    const r = await fetch(`${BASE}/t/demo/dashboard`, {
      headers: { Cookie: adminJar.value },
    });
    const html = await r.text();
    record(
      "21. Dashboard shows 'Connect Meta' CTA + tenant name (when not connected)",
      r.status === 200 && html.includes("Connect Meta") && html.includes("AdsLab Demo Agency"),
      `status=${r.status}`,
    );
    record(
      "22. Dashboard has NO unverified banner (admin is verified)",
      !html.includes("กรุณายืนยันอีเมล"),
    );
  }

  // ===== Meta integration =====

  // 23-25. Legal pages return 200
  for (const path of ["/privacy", "/terms", "/data-deletion"]) {
    const r = await fetch(`${BASE}${path}`);
    record(`${path} returns 200`, r.status === 200, `status=${r.status}`);
  }

  // 26. GET /api/meta/connection (admin, no connection yet) → { connected: false }
  {
    const r = await api("/api/meta/connection?tenantSlug=demo", { cookieJar: adminJar });
    record(
      "26. Meta connection status (admin, no connection) → connected:false",
      r.status === 200 && r.body?.connected === false,
      `status=${r.status} body=${JSON.stringify(r.body)}`,
    );
  }

  // 27. GET /api/meta/oauth/start without session → proxy redirects to /login
  {
    const r = await fetch(`${BASE}/api/meta/oauth/start?tenantSlug=demo`, { redirect: "manual" });
    // The proxy only matches /t/* — /api/meta/oauth/start isn't proxy-gated,
    // so this hits the handler which calls requireSession() → redirect /login.
    record(
      "27. OAuth start without session → redirects",
      r.status === 307 || r.status === 401,
      `status=${r.status}`,
    );
  }

  // 28. GET /api/meta/oauth/start with admin (OWNER of demo) → 307 to facebook.com
  {
    const r = await fetch(`${BASE}/api/meta/oauth/start?tenantSlug=demo`, {
      headers: { Cookie: adminJar.value },
      redirect: "manual",
    });
    const loc = r.headers.get("location") ?? "";
    record(
      "28. OAuth start (OWNER) → 307 to facebook.com with scopes",
      r.status === 307 && loc.includes("facebook.com") && loc.includes("ads_management"),
      `status=${r.status} location=${loc.slice(0, 80)}...`,
    );
  }

  // 29. POST /api/meta/sync without session → redirected by requireSession
  {
    const r = await api("/api/meta/sync?tenantSlug=demo", { method: "POST" });
    record(
      "29. Meta sync without session → not authorized",
      r.status === 401 || r.status === 307,
      `status=${r.status}`,
    );
  }

  // 30. POST /api/meta/disconnect without session → not authorized
  {
    const r = await api("/api/meta/disconnect?tenantSlug=demo", { method: "POST" });
    record(
      "30. Meta disconnect without session → not authorized",
      r.status === 401 || r.status === 307,
      `status=${r.status}`,
    );
  }

  // 31. POST /api/meta/data-deletion with no body → 400
  {
    const r = await fetch(`${BASE}/api/meta/data-deletion`, { method: "POST" });
    record(
      "31. Meta data-deletion callback (no body) → 400",
      r.status === 400,
      `status=${r.status}`,
    );
  }

  // 32. POST /api/meta/deauthorize with no body → 400
  {
    const r = await fetch(`${BASE}/api/meta/deauthorize`, { method: "POST" });
    record(
      "32. Meta deauthorize callback (no body) → 400",
      r.status === 400,
      `status=${r.status}`,
    );
  }

  // 33. Settings integrations page renders for OWNER
  {
    const r = await fetch(`${BASE}/t/demo/settings/integrations`, {
      headers: { Cookie: adminJar.value },
    });
    const html = await r.text();
    record(
      "33. /t/demo/settings/integrations renders for OWNER + has Meta connect button",
      r.status === 200 && html.includes("Meta") && html.includes("เชื่อมต่อ"),
      `status=${r.status}`,
    );
  }

  // ===== Summary =====
  await prisma.$disconnect();

  console.log(`\n${"=".repeat(60)}`);
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`Total: ${results.length}  ✅ Passed: ${passed}  ❌ Failed: ${failed}`);
  if (failed > 0) {
    console.log("\nFailed tests:");
    results.filter((r) => !r.ok).forEach((r) => console.log(`  ❌ ${r.name}${r.details ? " — " + r.details : ""}`));
    process.exit(1);
  } else {
    console.log("\n🎉 All scenarios passed!");
  }
}

main().catch((err) => {
  console.error("❌ Test suite crashed:", err);
  process.exit(1);
});
