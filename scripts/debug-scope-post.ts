// Quick debug: POST to /api/scopes and print the 500 body
const BASE = "http://localhost:3000";

async function api(p: string, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (init.cookie) headers.set("Cookie", init.cookie);
  const res = await fetch(BASE + p, { ...init, headers, redirect: "manual" });
  const sc = res.headers.get("set-cookie");
  const text = await res.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch {}
  return { status: res.status, body, cookie: sc };
}

(async () => {
  const login = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "test@test.com", password: "admin123" }),
  });
  const cookie = login.cookie ? login.cookie.match(/^([^;]+)/)![1] : "";
  console.log("login:", login.status);

  const r = await api("/api/scopes?tenantSlug=demo", {
    method: "POST",
    body: JSON.stringify({
      name: "[smoke-direct]",
      accountIds: ["act_40626827"],
      campaignIds: [],
    }),
    cookie,
  });
  console.log("POST:", r.status);
  console.log("body:", typeof r.body === "string" ? r.body.slice(0, 1500) : JSON.stringify(r.body).slice(0, 1500));
})();
