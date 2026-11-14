const { test, expect } = require('@playwright/test');
const { installFakeFirebase } = require('./fake-firebase');
const { mockApi, signIn } = require('./fake-api');

const writes = (requests) => requests.filter((r) => r.method !== 'GET');
const headings = (page) => page.locator('#days-list .ghead b');
const dayTitles = (page) => page.locator('#days-list .day-row .day-title');

test.beforeEach(async ({ page }) => {
  await installFakeFirebase(page);
  await signIn(page);
  await page.route(/\/trip\/\?id=(88|99)/, (route) => route.fulfill({ contentType: 'text/html', body: '<title>Trip</title>' }));
});

test.describe('Plan with AI (trips list)', () => {
  async function openPlan(page) {
    await page.goto('/trips/');
    await page.getByRole('button', { name: 'Plan with AI' }).click();
    return page.getByRole('dialog', { name: 'Plan with AI' });
  }

  test('describing a trip creates it and opens it', async ({ page }) => {
    const requests = [];
    await mockApi(page, { requests });
    const dialog = await openPlan(page);
    await dialog.getByLabel('Describe your trip').fill('  7 days in Portugal, foodie ');
    await dialog.getByRole('button', { name: 'Plan my trip' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Planning your trip…' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Plan with AI' })).toHaveCount(0);
    await expect(page).toHaveURL(/\/trip\/\?id=99$/);
    const post = writes(requests).find((r) => r.path === '/api/trips/express');
    expect(post.body).toEqual({ instructions: '7 days in Portugal, foodie' });
  });

  test('an empty description is refused and example chips fill the box', async ({ page }) => {
    const requests = [];
    await mockApi(page, { requests });
    const dialog = await openPlan(page);
    await dialog.getByRole('button', { name: 'Plan my trip' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Describe your trip first.');
    expect(writes(requests)).toHaveLength(0);
    await dialog.getByRole('button', { name: '7 days in Portugal, foodie' }).click();
    await expect(dialog.getByLabel('Describe your trip')).toHaveValue('7 days in Portugal, foodie');
  });

  test('the box stops at 500 characters', async ({ page }) => {
    await mockApi(page);
    const dialog = await openPlan(page);
    await expect(dialog.getByLabel('Describe your trip')).toHaveAttribute('maxlength', '500');
  });

  test('a declined request shows the reason and keeps the dialog usable', async ({ page }) => {
    await mockApi(page, { expressResult: { tripId: null, rejectionReason: 'That doesn’t look like a trip.' } });
    const dialog = await openPlan(page);
    await dialog.getByLabel('Describe your trip').fill('hello');
    await dialog.getByRole('button', { name: 'Plan my trip' }).click();
    const again = page.getByRole('dialog', { name: 'Plan with AI' });
    await expect(again.getByRole('alert')).toHaveText('That doesn’t look like a trip.');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/trips\/$/);
    await expect(again.getByLabel('Describe your trip')).toHaveValue('hello');
    await expect(again.getByRole('button', { name: 'Plan my trip' })).toBeEnabled();
  });

  test('unresolved places are listed before opening the trip', async ({ page }) => {
    await mockApi(page, { expressResult: { unresolvedStopNames: ['Atlantis'] } });
    const dialog = await openPlan(page);
    await dialog.getByLabel('Describe your trip').fill('Atlantis');
    await dialog.getByRole('button', { name: 'Plan my trip' }).click();
    const ready = page.getByRole('dialog', { name: 'Your trip is ready' });
    await expect(ready).toContainText('Atlantis');
    await expect(ready.getByRole('link', { name: 'Open trip' })).toHaveAttribute('href', '/trip/?id=99');
  });

  test('server errors show a message', async ({ page }) => {
    await mockApi(page, { expressStatus: 500, expressMessage: 'Failed to generate the trip: the AI service is busy.' });
    const dialog = await openPlan(page);
    await dialog.getByLabel('Describe your trip').fill('Rome');
    await dialog.getByRole('button', { name: 'Plan my trip' }).click();
    await expect(page.getByRole('dialog', { name: 'Plan with AI' }).getByRole('alert')).toContainText('Failed to generate the trip: the AI service is busy.');
    await expect(page.getByLabel('Describe your trip')).toHaveValue('Rome');
  });
});

test.describe('Generate days with AI (days list)', () => {
  async function openGenerate(page, stopName) {
    await page.goto('/trip/?id=1');
    await page.getByRole('button', { name: `Generate days with AI for ${stopName}` }).click();
    return page.getByRole('dialog', { name: `Generate days for ${stopName}` });
  }

  test('a stop without days: defaults to its planned days and adds the generated days', async ({ page }) => {
    const requests = [];
    await mockApi(page, { requests });
    const dialog = await openGenerate(page, 'Flåm');
    await expect(dialog.getByRole('radio')).toHaveCount(0);
    await expect(dialog.locator('.stepper')).toContainText('3');
    await dialog.getByRole('button', { name: 'Generate days' }).click();
    await expect(page.getByRole('dialog', { name: 'Generate days for Flåm' })).toHaveCount(0);
    await expect(headings(page)).toHaveText(['Oslo · 2 days', 'Bergen · 1 day', 'Flåm · 3 days']);
    const generate = writes(requests).find((r) => r.path.endsWith('/generate-days'));
    expect(generate.path).toBe('/api/trips/1/route-stops/13/generate-days');
    expect(generate.body).toEqual({ numberOfDays: 3 });
    const batch = writes(requests).find((r) => r.path === '/api/trips/1/days/batch');
    expect(batch.body).toMatchObject({ routeStopId: 13, order: 3 });
    expect(batch.body.days).toEqual([
      { title: 'AI day 1', description: '<p>Plan 1</p>' },
      { title: 'AI day 2', description: '<p>Plan 2</p>' },
      { title: 'AI day 3', description: '<p>Plan 3</p>' },
    ]);
    await expect(page.locator('#save-status')).toContainText('All changes saved');
  });

  test('adding to a stop that has days puts the new days after them', async ({ page }) => {
    const requests = [];
    await mockApi(page, { requests });
    const dialog = await openGenerate(page, 'Oslo');
    await dialog.getByLabel(/Keep the 2 days/).check();
    await dialog.getByRole('button', { name: 'Generate days' }).click();
    await expect(headings(page)).toHaveText(['Oslo · 4 days', 'Bergen · 1 day', 'Flåm · 0 days']);
    expect(writes(requests).some((r) => r.method === 'DELETE')).toBe(false);
    expect(writes(requests).find((r) => r.path === '/api/trips/1/days/batch').body.order).toBe(2);
  });

  test('replacing deletes the stop’s days first and puts the new ones in the same place', async ({ page }) => {
    const requests = [];
    await mockApi(page, { requests });
    const dialog = await openGenerate(page, 'Bergen');
    await dialog.getByLabel(/Replace the 1 existing day/).check();
    await dialog.getByRole('button', { name: 'Generate days' }).click();
    await expect(headings(page)).toHaveText(['Oslo · 2 days', 'Bergen · 1 day', 'Flåm · 0 days']);
    await expect(dayTitles(page).nth(2)).toHaveText('AI day 1');
    const sent = writes(requests).map((r) => `${r.method} ${r.path}`);
    expect(sent.indexOf('DELETE /api/trips/1/days/103')).toBeGreaterThan(-1);
    expect(sent.indexOf('DELETE /api/trips/1/days/103')).toBeLessThan(sent.indexOf('POST /api/trips/1/days/batch'));
    expect(writes(requests).find((r) => r.path === '/api/trips/1/days/batch').body.order).toBe(2);
  });

  test('while generating, a spinner dialog replaces the form', async ({ page }) => {
    await mockApi(page);
    await page.route('**/generate-days', async (route) => { await new Promise((r) => setTimeout(r, 600)); await route.fallback(); });
    const dialog = await openGenerate(page, 'Flåm');
    await dialog.getByRole('button', { name: 'Generate days' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Generating trip days…' })).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(headings(page)).toHaveText(['Oslo · 2 days', 'Bergen · 1 day', 'Flåm · 3 days']);
  });

  test('the choices survive a failure (replace stays selected)', async ({ page }) => {
    await mockApi(page, { generateStatus: 500, generateMessage: 'Nope.' });
    const dialog = await openGenerate(page, 'Oslo');
    await dialog.getByLabel(/Replace the 2 existing days/).check();
    await dialog.getByRole('button', { name: 'Generate days' }).click();
    await expect(page.getByLabel(/Replace the 2 existing days/)).toBeChecked();
  });

  test('the number of days is limited to 7', async ({ page }) => {
    await mockApi(page);
    const dialog = await openGenerate(page, 'Flåm');
    const plus = dialog.getByRole('button', { name: 'More days' });
    for (let i = 0; i < 4; i += 1) await plus.click();
    await expect(dialog.locator('.stepper')).toContainText('7');
    await expect(plus).toBeDisabled();
  });

  test('a failure keeps the trip unchanged and lets you retry', async ({ page }) => {
    const requests = [];
    await mockApi(page, { requests, generateStatus: 500, generateMessage: 'Not enough information about this place.' });
    const dialog = await openGenerate(page, 'Flåm');
    await dialog.getByRole('button', { name: 'Generate days' }).click();
    const again = page.getByRole('dialog', { name: 'Generate days for Flåm' });
    await expect(again.getByRole('alert')).toContainText('Not enough information about this place.');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(again.locator('.stepper')).toContainText('3');
    await expect(again.getByRole('button', { name: 'Generate days' })).toBeEnabled();
    expect(writes(requests).filter((r) => r.path.endsWith('/batch') || r.method === 'DELETE')).toHaveLength(0);
  });

  test('the AI button is not offered on a shared trip', async ({ page }) => {
    await mockApi(page);
    await page.goto('/trip/?id=5');
    await expect(page.locator('#trip-name')).toBeVisible();
    await expect(page.getByRole('button', { name: /Generate days with AI/ })).toHaveCount(0);
  });
});
