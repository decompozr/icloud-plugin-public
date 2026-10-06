/** Disposable shared-shell QA; no live account, provider or clipboard mutations. */
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdir } from "node:fs/promises";
const args = process.argv.slice(2),
  option = (name: string) => args[args.indexOf(name) + 1];
const { chromium } = await import(
  pathToFileURL(resolve(option("--playwright-module"))).href
);
const worker = Bun.spawn(
  [process.execPath, join(import.meta.dir, "admin-fixture.worker.ts")],
  { stdout: "pipe", stderr: "pipe" },
);
const reader = worker.stdout.getReader(),
  first = await reader.read();
reader.releaseLock();
const origin = new TextDecoder().decode(first.value).trim();
let browser: any,
  checks = 0;
const assert = (v: unknown, m: string) => {
  if (!v) throw Error(m);
  checks++;
};
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: option("--chrome"),
  });
  const context = await browser.newContext({
    extraHTTPHeaders: { "x-fixture-session": "owner" },
    viewport: { width: 1100, height: 1000 },
  });
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e: Error) => errors.push(e.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (value: string) => {
          (window as any).copied = value;
        },
      },
    });
  });
  await page.goto(origin + "/icloud/admin");
  await page.getByTestId("accounts-card").locator(".account").waitFor();
  await page.evaluate(() => {
    (window as any).rail = document.querySelector(".shell-nav");
    (window as any).doc = document;
  });
  assert(
    JSON.stringify(
      await page.locator(".module-summary h3").allTextContents(),
    ) === JSON.stringify(["Mail", "Calendar", "Photos"]),
    "Module order",
  );
  const s = await page.getByTestId("service-card").boundingBox(),
    a = await page.getByTestId("accounts-card").boundingBox();
  assert(a.y >= s.y + s.height, "Cards are rows");
  await page
    .getByRole("button", { name: "Copy runtime folder", exact: true })
    .click();
  const expected = await context.request
    .get(origin + "/icloud/admin/system-status")
    .then((r: any) => r.json())
    .then((v: any) => v.locations.runtimeDirectory);
  assert(
    (await page.evaluate(() => (window as any).copied)) === expected,
    "Full runtime path copied",
  );
  for (const width of [1100, 640, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [path, key] of [
      ["/icloud/admin/accounts", "navAccounts"],
      ["/icloud/admin/connections", "navConnections"],
      ["/icloud/admin/system", "navSystem"],
      ["/icloud/admin", "navOverview"],
    ]) {
      await page.locator('.shell-nav a[href="' + path + '"]').click();
      await page.waitForURL(origin + path);
      assert(
        await page.evaluate(
          () =>
            (window as any).doc === document &&
            (window as any).rail === document.querySelector(".shell-nav"),
        ),
        "Same document/rail",
      );
      const heights = await page
        .locator(".shell-nav a")
        .evaluateAll((nodes: HTMLElement[]) =>
          nodes.map((n) => n.getBoundingClientRect().height),
        );
      assert(
        heights.every((h: number) => h === 44),
        "Icon rail size fixed",
      );
      const mark = await page.locator(".active-indicator").boundingBox();
      assert(mark.height === 44, "Green marker stays 44px");
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "No horizontal overflow",
      );
    }
  }
  await page.locator('.shell-nav a[href="/icloud/admin/accounts"]').click();
  await page.waitForURL(origin + "/icloud/admin/accounts");
  await page.locator('.shell-nav a[href="/icloud/admin/connections"]').click();
  await page.waitForURL(origin + "/icloud/admin/connections");
  await page.locator('.shell-nav a[href="/icloud/admin/system"]').click();
  await page.waitForURL(origin + "/icloud/admin/system");
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route("**/icloud/admin/status", async (route: any) => {
    await gate;
    await route.continue();
  });
  await page.goBack();
  await page.goBack();
  release();
  await page.waitForFunction(
    () =>
      location.pathname === "/icloud/admin/accounts" &&
      document.querySelector("main")?.getAttribute("data-view") === "accounts",
  );
  assert(true, "Rapid Back keeps URL and view aligned");
  await page.unroute("**/icloud/admin/status");
  await page
    .getByRole("button", { name: "Add an iCloud account", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "iCloud app password",
    exact: true,
  });
  await dialog.locator("#credential-user").fill("pending@example.invalid");
  await dialog.locator("#credential-password").fill("fixture-dummy");
  let finish!: () => void;
  const pending = new Promise<void>((r) => (finish = r));
  await page.route("**/icloud/admin/accounts/add", async (route: any) => {
    await pending;
    await route.continue();
  });
  await dialog
    .getByRole("button", { name: "Verify and save account", exact: true })
    .click();
  await page.goBack();
  assert(
    await dialog.isVisible(),
    "Back cannot close a pending credential modal",
  );
  assert(
    new URL(page.url()).pathname === "/icloud/admin/accounts",
    "Pending credential operation holds the route",
  );
  finish();
  await dialog.waitFor({ state: "hidden" });
  await page.unroute("**/icloud/admin/accounts/add");
  await page.locator('.shell-nav a[href="/icloud/admin"]').click();
  await page.waitForURL(origin + "/icloud/admin");
  await page.goBack();
  await page.waitForFunction(
    () =>
      document
        .querySelector('.shell-nav a[aria-current="page"]')
        ?.getAttribute("href") === location.pathname,
  );
  assert(true, "Back updates content/selection");
  await mkdir(option("--output"), { recursive: true });
  await page.locator('.shell-nav a[href="/icloud/admin"]').click();
  await page.waitForURL(origin + "/icloud/admin");
  await page.waitForFunction(
    () =>
      document.querySelector(".shell-nav")?.getAttribute("aria-busy") ===
      "false",
  );
  assert(
    (await page.locator("main#wizard").count()) === 1,
    "One admin shell after Back",
  );
  await page.setViewportSize({ width: 1100, height: 1000 });
  await page.waitForTimeout(250);
  await page.screenshot({
    path: join(option("--output"), "overview.png"),
    fullPage: true,
  });
  await page.route("**/icloud/admin/status", async (route: any) =>
    route.fulfill({ status: 403, body: '{"error":"OWNER_REQUIRED"}' }),
  );
  await page.locator('.shell-nav a[href="/icloud/admin/accounts"]').click();
  await page.waitForURL("**/icloud/sign-in");
  assert(true, "Expired owner redirects");
  assert(errors.length === 0, errors.join(";"));
  console.log(JSON.stringify({ passed: true, checks }));
} finally {
  await browser?.close();
  worker.kill();
  await worker.exited;
  const err = await new Response(worker.stderr).text();
  if (err) console.error(err);
}
