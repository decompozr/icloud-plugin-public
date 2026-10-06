import { test, expect } from "bun:test";
import { join } from "node:path";
import { createStudio } from "../dist/transport.js";
import en from "../messages/en.json";
import zh from "../messages/zh-TW.json";
const studio = await createStudio(join(import.meta.dir, "../dist/kit"));
test("Paraglide JSON catalogs have matching identifiers and preserve English base copy", () => {
  expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
  for (const [key, value] of Object.entries(en)) {
    expect(typeof value).toBe("string");
    if (key !== "$schema") expect(value.length).toBeGreaterThan(0);
  }
});
test("parallel Kit SSR isolates locale and supplies safe bootstrap with no-store", async () => {
  const render = (locale: "en" | "zh-TW") =>
    studio.admin(
      new Request("https://private.example.invalid/icloud/admin", {
        headers: { cookie: "PARAGLIDE_LOCALE=" + locale },
      }),
      { enrolled: true, ready: true, admin: true, view: "overview" },
    );
  for (let i = 0; i < 3; i++) {
    const [a, b] = await Promise.all([render("en"), render("zh-TW")]);
    const [x, y] = await Promise.all([a.text(), b.text()]);
    expect(x).toContain('<html lang="en"');
    expect(y).toContain('<html lang="zh-TW"');
    expect(x).toContain(en.navOverview);
    expect(x).not.toContain(zh.navOverview);
    expect(y).toContain(zh.navOverview);
    for (const [r, html] of [
      [a, x],
      [b, y],
    ] as const) {
      expect(r.status).toBe(200);
      expect(r.headers.get("cache-control")).toBe("no-store");
      expect(r.headers.get("content-security-policy")).toContain("'nonce-");
      expect(html).toContain("/icloud/_studio/");
      expect(html).not.toContain("admin-browser.js");
    }
  }
});
test("consent CSP permits its own compiled stylesheet and retains nonce script policy",async()=>{
 const response=await studio.auth(new Request('https://public.example.invalid/icloud/consent'),'consent',false,{});
 const csp=response.headers.get('content-security-policy')??'';
 expect(csp.match(/(?:^|;)\s*style-src\s+([^;]+)/)?.[1]).toContain("'self'");
 expect(csp.match(/(?:^|;)\s*script-src\s+([^;]+)/)?.[1]).toContain("'nonce-");
 expect(csp).toContain("frame-ancestors 'none'");
 const html=await response.text();expect(html).toMatch(/rel="stylesheet"[^>]*href="[^"]+\.css"|href="[^"]+\.css"[^>]*rel="stylesheet"/);
});
test("Kit API dispatch preserves signed query, JSON body and multiple cookies without locale behavior", async () => {
  const request = new Request(
    "https://public.example.invalid/icloud/auth/oauth2/consent?resource=a&resource=b&sig=fixture",
    {
      method: "POST",
      headers: {
        cookie: "PARAGLIDE_LOCALE=zh-TW",
        "content-type": "application/json",
        origin: "https://public.example.invalid",
      },
      body: JSON.stringify({ accept: true, scope: "mail.read" }),
    },
  );
  let seen = false;
  const result = await studio.api(request, async (r) => {
    seen = true;
    expect(r.url).toBe(request.url);
    expect(r.headers.get("origin")).toBe("https://public.example.invalid");
    expect(await r.json()).toEqual({ accept: true, scope: "mail.read" });
    return new Response("api", {
      status: 201,
      headers: [
        ["set-cookie", "one=1; Path=/icloud"],
        ["set-cookie", "two=2; Path=/icloud"],
      ],
    });
  });
  expect(seen).toBe(true);
  expect(result.status).toBe(201);
  expect(result.headers.get("location")).toBeNull();
  expect(result.headers.getSetCookie()).toHaveLength(2);
  expect(await result.text()).toBe("api");
});
test("compiled asset serving rejects unknown paths and non-read methods", async () => {
  expect(
    (await studio.asset(
      new Request(
        "https://public.example.invalid/icloud/_studio/does-not-exist.js",
      ),
    ))!.status,
  ).toBe(404);
  expect(
    (await studio.asset(
      new Request(
        "https://public.example.invalid/icloud/_studio/does-not-exist.js",
        { method: "POST" },
      ),
    ))!.status,
  ).toBe(405);
  expect(
    await studio.asset(
      new Request("https://public.example.invalid/icloud/admin"),
    ),
  ).toBeUndefined();
});

test("originless form token exchange and refresh reach authoritative OAuth handler", async () => {
  for (const grant of ["authorization_code", "refresh_token"]) {
    const body = new URLSearchParams({
      grant_type: grant,
      client_id: "dummy",
      code: "dummy",
      refresh_token: "dummy",
    });
    let reached = false;
    const result = await studio.api(
      new Request("https://public.example.invalid/icloud/auth/oauth2/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      }),
      async (request) => {
        reached = true;
        expect(request.headers.has("origin")).toBe(false);
        expect(await request.text()).toBe(body.toString());
        return Response.json({ fixture: true });
      },
    );
    expect(reached).toBe(true);
    expect(result.status).toBe(200);
  }
});
