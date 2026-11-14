const { test, expect } = require('@playwright/test');
const { installFakeFirebase } = require('./fake-firebase');
const { mockApi, signIn, sampleDetails } = require('./fake-api');

const writes = (requests) => requests.filter((r) => r.method !== 'GET');
const headings = (page) => page.locator('#days-list .ghead b');

test.beforeEach(async ({ page }) => {
  await installFakeFirebase(page);
  await signIn(page);
});

async function openReview(page, options = {}) {
  await mockApi(page, options);
  await page.goto('/trip/?id=1');
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  return page.getByRole('dialog', { name: 'Review your trip' });
}

test('Review lists critical and advisory issues, grouped, with Fix only where the server offers fixes', async ({ page }) => {
  const dialog = await openReview(page);
  await expect(dialog.getByRole('heading', { name: 'Critical (1)' })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Advisory (2)' })).toBeVisible();
  await expect(dialog).toContainText('Flåm has no days planned.');
  await expect(dialog).toContainText('Tip: Add days to Flåm.');
  await expect(dialog.getByRole('button', { name: 'Fix this' })).toHaveCount(2);
  await expect(dialog).toContainText('Remove this stop and add it again with a different place.');
});

test('Dismiss hides an issue, updates the count and is remembered; Show dismissed brings it back', async ({ page }) => {
  const dialog = await openReview(page);
  await dialog.locator('.issue-card', { hasText: 'Oslo has more days' }).getByRole('button', { name: 'Dismiss' }).click();
  await expect(dialog.getByRole('heading', { name: 'Advisory (1)' })).toBeVisible();
  await expect(dialog.getByRole('status')).toHaveText('Dismissed.');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('#pane-overview')).toContainText('Fix 2 validation issues');
  await page.reload();
  await expect(page.locator('#pane-overview')).toContainText('Fix 2 validation issues');
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  const again = page.getByRole('dialog', { name: 'Review your trip' });
  await again.getByRole('button', { name: 'Show 1 dismissed issue' }).click();
  await expect(again.getByRole('heading', { name: 'Advisory (2)' })).toBeVisible();
});

test('applying “Generate days” saves the generated days into the stop and clears the issue', async ({ page }) => {
  const requests = [];
  const dialog = await openReview(page, { requests });
  await dialog.locator('.issue-card', { hasText: 'Flåm has no days' }).getByRole('button', { name: 'Fix this' }).click();
  await expect(dialog.getByRole('heading', { name: 'Stop without days' })).toBeVisible();
  const suggest = writes(requests).find((r) => r.path === '/api/trips/1/suggest');
  expect(suggest.body).toEqual({ issueHash: 'h-flam', issueCode: 'ROUTE_STOP_NO_DAYS', entityId: 13 });
  await dialog.getByRole('button', { name: 'Apply' }).first().click();
  await expect(dialog.getByRole('status')).toHaveText('Fix applied.');
  await expect(dialog.getByRole('heading', { name: 'Critical' })).toHaveCount(0);
  const generate = writes(requests).find((r) => r.path.endsWith('/generate-days'));
  expect(generate.body).toEqual({ numberOfDays: 3 });
  const batch = writes(requests).find((r) => r.path === '/api/trips/1/days/batch');
  expect(batch.body).toMatchObject({ routeStopId: 13, order: 3 });
  expect(batch.body.days).toHaveLength(3);
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(headings(page)).toHaveText(['Oslo · 2 days', 'Bergen · 1 day', 'Flåm · 3 days']);
  await expect(page.locator('#pane-overview')).toContainText('Fix 2 validation issues');
});

test('while a fix is being applied the button shows a spinner', async ({ page }) => {
  await mockApi(page);
  await page.route('**/generate-days', async (route) => { await new Promise((r) => setTimeout(r, 700)); await route.fallback(); });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/trip/?id=1');
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Review your trip' });
  await dialog.locator('.issue-card', { hasText: 'Flåm has no days' }).getByRole('button', { name: 'Fix this' }).click();
  await dialog.getByRole('button', { name: 'Apply' }).first().click();
  const busy = dialog.getByRole('button', { name: 'Applying…' });
  await expect(busy).toBeVisible();
  await expect(busy.locator('.spinner')).toBeVisible();
  await expect(busy).toBeDisabled();
  await expect(dialog.getByRole('status')).toHaveText('Fix applied.');
});

test('applying “Remove stop” runs the server’s call and the page reflects it', async ({ page }) => {
  const requests = [];
  const dialog = await openReview(page, { requests });
  await dialog.locator('.issue-card', { hasText: 'Flåm has no days' }).getByRole('button', { name: 'Fix this' }).click();
  await dialog.getByRole('button', { name: 'Apply' }).nth(1).click();
  await expect(dialog.getByRole('status')).toHaveText('Fix applied.');
  expect(writes(requests).find((r) => r.method === 'DELETE').path).toBe('/api/trips/1/route-stops/13');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(headings(page)).toHaveText(['Oslo · 2 days', 'Bergen · 1 day']);
});

test('a fix that points outside this trip is refused and nothing is sent', async ({ page }) => {
  const requests = [];
  const dialog = await openReview(page, { requests });
  await dialog.locator('.issue-card', { hasText: 'Oslo has more days' }).getByRole('button', { name: 'Fix this' }).click();
  await dialog.getByRole('button', { name: 'Apply' }).nth(1).click();
  await expect(dialog.getByRole('alert')).toContainText('can’t be applied from the web');
  expect(writes(requests).filter((r) => r.method === 'DELETE')).toHaveLength(0);
  await expect(dialog.getByRole('button', { name: 'Apply' }).nth(1)).toBeEnabled();
});

test('a failing fix shows the server’s message and can be retried', async ({ page }) => {
  const dialog = await openReview(page, { generateStatus: 500, generateMessage: 'Not enough information about this place.' });
  await dialog.locator('.issue-card', { hasText: 'Flåm has no days' }).getByRole('button', { name: 'Fix this' }).click();
  await dialog.getByRole('button', { name: 'Apply' }).first().click();
  await expect(dialog.getByRole('alert')).toHaveText('Not enough information about this place.');
  await expect(dialog.getByRole('button', { name: 'Apply' }).first()).toBeEnabled();
});

test('loading suggestions can fail or come back empty', async ({ page }) => {
  let dialog = await openReview(page, { suggestStatus: 500, suggestMessage: 'The suggestion service is busy.' });
  await dialog.getByRole('button', { name: 'Fix this' }).first().click();
  await expect(dialog.getByRole('alert')).toHaveText('The suggestion service is busy.');
  await dialog.getByRole('button', { name: '← Issues' }).click();
  await expect(dialog.getByRole('heading', { name: 'Critical (1)' })).toBeVisible();
});

test('no suggestions says so', async ({ page }) => {
  const dialog = await openReview(page, { noSuggestions: true });
  await dialog.getByRole('button', { name: 'Fix this' }).first().click();
  await expect(dialog).toContainText('No suggestions are available for this issue.');
});

test('a trip with no issues has no Review card', async ({ page }) => {
  await mockApi(page);
  await page.goto('/trip/?id=2');
  await expect(page.locator('#trip-name')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review', exact: true })).toHaveCount(0);
  await expect(page.locator('.attention')).toHaveCount(0);
});

test('a shared trip shows the card without a Review button', async ({ page }) => {
  const details = JSON.parse(JSON.stringify(sampleDetails));
  details[5].validation = { tripId: 5, isValid: false, errorCount: 1, warningCount: 0, issues: [{ hash: 'h5', severity: 'Error', code: 'ROUTE_STOP_NO_DAYS', name: 'Stop without days', message: 'No days.', entityId: 51 }] };
  await mockApi(page, { details, sharedWithMe: [{ id: 5, name: 'Lisbon with Olena', shareId: 50, sharedBy: 'Olena' }] });
  await page.goto('/trip/?id=5');
  await expect(page.locator('.attention')).toContainText('Fix 1 validation issue');
  await expect(page.getByRole('button', { name: 'Review', exact: true })).toHaveCount(0);
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 800 } });
  test('the dialog fits and its buttons are 44px tall', async ({ page }) => {
    const dialog = await openReview(page);
    for (const button of await dialog.getByRole('button', { name: /Fix this|Dismiss/ }).all()) {
      expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
});
