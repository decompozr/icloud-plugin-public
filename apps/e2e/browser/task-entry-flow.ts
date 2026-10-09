/** Task entry, form recovery and account comparison using disposable fixture data. */
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';

const args = process.argv.slice(2), option = (name: string) => args[args.indexOf(name) + 1];
const { chromium } = await import(pathToFileURL(resolve(option('--playwright-module'))).href);
const worker = Bun.spawn([process.execPath, join(import.meta.dir, 'admin-fixture.worker.ts')], { stdout: 'pipe', stderr: 'pipe' });
const reader = worker.stdout.getReader(), first = await reader.read();
reader.releaseLock();
const origin = new TextDecoder().decode(first.value).trim(), output = option('--output');
await mkdir(output, { recursive: true });
let browser: any, checks = 0;
const assert = (value: unknown, message: string) => { if (!value) throw Error(message); checks++; };

try {
  browser = await chromium.launch({ headless: true, executablePath: option('--chrome') });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { 'x-fixture-session': 'owner' } });
  const page = await desktop.newPage(), errors: string[] = [];
  page.on('pageerror', (error: Error) => errors.push(error.message));
  await page.goto(origin + '/icloud/admin');
  await page.getByTestId('service-card').waitFor();
  assert(await page.getByTestId('next-step').count() === 0, 'Overview has no task/review banner');
  await page.getByRole('button', { name: 'Configure Mail', exact: true }).click();
  await page.getByRole('dialog', { name: 'Mail Settings', exact: true }).waitFor();
  assert(await page.locator('#scope-mail-read').isChecked() === false, 'Opening settings never automatically enables operations');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await desktop.request.get(origin + '/fixture/network-off');
  await page.reload();
  await page.getByTestId('service-card').getByRole('button', { name: 'Set up', exact: true }).waitFor();
  assert(await page.getByTestId('next-step').count() === 0, 'Network guidance stays inside Runtime');
  await desktop.request.get(origin + '/fixture/network-on');
  await page.route('**/icloud/admin/status', async route => { const response=await route.fetch(),data=await response.json();data.accounts=[];await route.fulfill({response,json:data}); });
  await page.reload();await page.getByTestId('accounts-card').getByText('Add an iCloud account to configure credentials and client connections.', {exact:true}).waitFor();
  await page.getByTestId('accounts-card').getByRole('button',{name:'Add an iCloud account',exact:true}).first().click();
  await page.getByRole('dialog').waitFor();assert(true,'Account setup remains a direct section action');
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();await page.unrouteAll({behavior:'wait'});
  for (let index = 1; index <= 4; index++) {
    const response = await desktop.request.post(origin + '/icloud/admin/accounts/add', {
      headers: { origin }, data: { user: index === 4 ? "comparison-account-with-a-long-identifier-4@example.invalid" : `comparison-${index}@example.invalid`, label: index === 4 ? "Comparison account 4 with a deliberately long name for small screens" : `Comparison account ${index}`, appPassword: 'fixture-dummy' },
    });
    assert(response.status() === 201, 'Only fictional comparison accounts are seeded');
  }
  await page.goto(origin + '/icloud/admin/accounts');
  await page.waitForFunction(() => document.querySelectorAll('.account-card').length === 5);
  const bounds = await page.locator('.account-card').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()));
  assert(bounds[0].y === bounds[1].y && bounds[1].x > bounds[0].x, 'Desktop account comparison has two columns');
  await page.screenshot({ path: join(output, 'desktop-comparison.png') });

  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, extraHTTPHeaders: { 'x-fixture-session': 'owner' } });
  const mobile = await touch.newPage(); mobile.on('pageerror', (error: Error) => errors.push(error.message));
  await mobile.goto(origin + '/icloud/admin/accounts');
  await mobile.waitForFunction(() => document.querySelectorAll('.account-card').length === 5);
  const mobileBounds = await mobile.locator('.account-card').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()));
  assert(mobileBounds.every(rect => rect.x === mobileBounds[0].x), 'Touch comparison remains one column');
  assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Long account labels and addresses wrap without horizontal overflow');
  await mobile.evaluate(() => { (window as any).taskShell = document.querySelector('#wizard'); });
  assert(await mobile.locator('.shell-nav a').count() === 4, 'One navbar exposes all page destinations');
  assert(await mobile.locator('.readable-navigation').count() === 0, 'No duplicate Pages dropdown');
  await mobile.screenshot({ path: join(output, 'touch-navbar.png') });
  await mobile.locator('.shell-nav a[href="/icloud/admin/connections"]').click();
  await mobile.waitForURL(origin + '/icloud/admin/connections');
  assert(await mobile.evaluate(() => (window as any).taskShell === document.querySelector('#wizard')), 'Navbar navigation preserves the shell');
  await mobile.goBack(); await mobile.waitForURL(origin + '/icloud/admin/accounts');
  const account = mobile.locator('.account-card').nth(4), accountId = await account.getAttribute('data-account-id');
  await account.getByRole('button', { name: 'Update app password', exact: true }).click();
  await mobile.getByRole('dialog').waitFor();
  await mobile.waitForFunction(id => (document.querySelector('#credential-account') as HTMLSelectElement)?.value === id, accountId);
  assert(await mobile.locator('#credential-account').inputValue() === accountId, 'Comparison actions open the intended account');
  const navigation = await mobile.locator('.shell-nav a').first().boundingBox();
  assert(navigation!.y >= 0 && navigation!.y + navigation!.height <= 844, 'Navbar stays in view after deep account scrolling');
  assert(await mobile.locator('.shell-nav a').first().getAttribute('aria-disabled') === 'true', 'Modal guards disable page switching');
  await mobile.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await mobile.getByRole('button', { name: 'Add an iCloud account', exact: true }).click();
  const dialog = mobile.getByRole('dialog'); await dialog.waitFor();
  await dialog.locator('#credential-user').fill('invalid@example.invalid');
  await dialog.locator('#credential-label').fill('Preserved label');
  await dialog.locator('#credential-password').fill('invalid-dummy');
  await dialog.getByRole('button', { name: 'Verify and save account', exact: true }).click();
  await dialog.getByTestId('toast').waitFor();
  const description = await dialog.locator('#credential-password').getAttribute('aria-describedby');
  assert(!!description && await dialog.locator('form').getAttribute('aria-describedby') === description, 'Credential error is linked to the form and inputs');
  assert(await dialog.locator('#credential-user').getAttribute('aria-describedby') === description, 'Unknown credential-pair attribution remains shared');
  assert(await dialog.locator('#credential-password').inputValue() === '', 'Rejected secret clears');
  assert(await dialog.locator('#credential-label').inputValue() === 'Preserved label', 'Correctable non-secret context remains');
  await dialog.getByTestId('toast').getByRole('button').click();
  await dialog.getByTestId('toast').waitFor({ state: 'hidden' });
  assert(await dialog.locator(`[id="${description}"]`).isVisible(), 'Form feedback survives notification dismissal');
  await mobile.screenshot({ path: join(output, 'persistent-form-error.png') });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await mobile.getByRole('button', { name: 'Add an iCloud account', exact: true }).click();
  await mobile.getByRole('dialog').waitFor();
  assert(await mobile.locator('#credential-password').getAttribute('aria-describedby') === null, 'New dialog clears old failure context');
  await mobile.getByRole('button', { name: 'Close dialog', exact: true }).click();

  const update = await desktop.request.post(origin + '/icloud/admin/capabilities', { headers: { origin }, data: { policy: { read: true, write: false, send: false, unsubscribe: false }, confirmEnable: true } });
  assert(update.ok(), 'Fixture-only explicit capability update succeeds');
  await page.goto(origin+'/icloud/admin');await page.getByTestId('service-card').waitFor();
  assert(await page.getByTestId('next-step').count()===0,'Existing client does not create a manual-review banner');
  for (const path of ['/icloud/admin', '/icloud/admin/accounts', '/icloud/admin/connections', '/icloud/admin/system']) {
    await mobile.goto(origin + path); await mobile.locator('.shell-nav a[aria-current=page]').waitFor();
    assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Task entry wraps on ' + path);
  }
  await touch.addCookies([{ name: 'PARAGLIDE_LOCALE', value: 'zh-TW', url: origin }]);
  await mobile.goto(origin + '/icloud/admin'); await mobile.locator('.shell-nav a[aria-current=page]').waitFor();
  assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Traditional Chinese task entry wraps');
  await mobile.screenshot({ path: join(output, 'touch-chinese-task.png') });
  assert(errors.length === 0, 'No page errors: ' + errors.join('; '));
  await writeFile(join(output, 'acceptance.json'), JSON.stringify({ checks, fixtureOnly: true, errors }, null, 2));
  console.log(JSON.stringify({ checks, errors }));
} finally {
  await browser?.close(); worker.kill(); await worker.exited;
  const error = await new Response(worker.stderr).text(); if (error) console.error(error);
}
