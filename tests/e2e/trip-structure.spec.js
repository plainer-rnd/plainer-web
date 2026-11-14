const { test, expect } = require('@playwright/test');
const { installFakeFirebase } = require('./fake-firebase');
const { mockApi, signIn } = require('./fake-api');

const writes = (requests) => requests.filter((r) => r.method !== 'GET');
const headings = (page) => page.locator('#days-list .ghead b');
const dayTitles = (page) => page.locator('#days-list .day-row .day-title');

test.beforeEach(async ({ page }) => {
  await installFakeFirebase(page);
  await signIn(page);
});

test('add a day to a stop inserts it at the end of that stop', async ({ page }) => {
  const requests = [];
  await mockApi(page, { requests });
  await page.goto('/trip/?id=1');
  await page.getByRole('button', { name: 'Add a day to Bergen' }).click();
  await expect(headings(page)).toHaveText(['Oslo · 2 days', 'Bergen · 2 days', 'Flåm · 0 days']);
  const post = writes(requests).find((r) => r.method === 'POST');
  expect(post.path).toBe('/api/trips/1/days');
  expect(post.search).toBe('?style=Insert');
  expect(post.body).toMatchObject({ routeStopId: 12, order: 3 });
  await expect(page.locator('#save-status')).toContainText('All changes saved');
});

test('duplicate a day puts the copy right after it, with the same title and plan', async ({ page }) => {
  const requests = [];
  await mockApi(page, { requests });
  await page.goto('/trip/?id=1');
  await page.getByRole('button', { name: 'Duplicate day 1' }).click();
  await expect(headings(page).first()).toHaveText('Oslo · 3 days');
  await expect(dayTitles(page)).toHaveText(['Historic Core', 'Historic Core', 'Art and Culture', 'Day 4']);
  const post = writes(requests).find((r) => r.method === 'POST');
  expect(post.body).toEqual({ routeStopId: 11, order: 1, title: 'Historic Core', description: '<p>Akershus Fortress.</p>' });
});

test('days have no move buttons; Duplicate and Delete sit in the header row and show on open days or hover', async ({ page }) => {
  await mockApi(page);
  await page.goto('/trip/?id=1');
  await expect(page.getByRole('button', { name: /^Move day/ })).toHaveCount(0);
  const row = page.locator('.day-row').first();
  await expect(row.getByRole('button', { name: 'Duplicate day 1' })).toBeVisible();
  const actions = row.locator('.day-actions');
  const opacity = (locator) => locator.evaluate((node) => getComputedStyle(node).opacity);
  expect(await opacity(actions)).toBe('1'); // day 1 is open
  await row.getByRole('button', { name: 'Collapse day 1' }).click();
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.activeElement.blur()); // keyboard focus on the row also shows the actions
  await expect.poll(() => opacity(page.locator('.day-row').first().locator('.day-actions'))).toBe('0');
  await page.locator('.day-row').first().hover();
  await expect.poll(() => opacity(page.locator('.day-row').first().locator('.day-actions'))).toBe('1');
});

test('delete a day asks first', async ({ page }) => {
  const requests = [];
  await mockApi(page, { requests });
  await page.goto('/trip/?id=1');
  await page.getByRole('button', { name: 'Delete day 1' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Delete day 1?');
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect(writes(requests)).toHaveLength(0);

  await page.getByRole('button', { name: 'Delete day 1' }).click();
  await page.getByRole('button', { name: 'Delete day', exact: true }).click();
  await expect(headings(page).first()).toHaveText('Oslo · 1 day');
  expect(writes(requests)[0]).toMatchObject({ method: 'DELETE', path: '/api/trips/1/days/101' });
});

test('add a stop through the place search, then it opens for editing', async ({ page }) => {
  const requests = [];
  await mockApi(page, { requests });
  await page.goto('/trip/?id=1');
  await page.getByRole('button', { name: 'Add stop' }).click();
  await page.getByRole('searchbox', { name: 'Place' }).fill('Stav');
  await page.getByRole('button', { name: /Stavanger/ }).click();
  await expect(headings(page)).toHaveText(['Oslo · 2 days', 'Bergen · 1 day', 'Flåm · 0 days', 'Stavanger · 0 days']);
  await expect(page.getByRole('group', { name: 'Editing Stavanger' })).toBeVisible();
  const post = writes(requests).find((r) => r.path === '/api/trips/1/route-stops');
  expect(post.body).toEqual({ order: 3, locationId: 'g-Stavanger' });
  const search = requests.find((r) => r.path === '/api/trips/1/locations');
  expect(search.search).toContain('description=Stav');
});

test('cancelling the place search adds nothing', async ({ page }) => {
  const requests = [];
  await mockApi(page, { requests });
  await page.goto('/trip/?id=1');
  await page.getByRole('button', { name: 'Add stop' }).click();
  await page.keyboard.press('Escape');
  expect(writes(requests)).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Add stop' })).toBeFocused();
});

test('the stop editor has no move buttons; Remove sits on the same line as the controls', async ({ page }) => {
  await mockApi(page);
  await page.goto('/trip/?id=1');
  await page.getByRole('button', { name: 'Edit stop Bergen' }).click();
  await expect(page.getByRole('button', { name: /^Move Bergen/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Generate days with AI for Bergen/ })).toHaveCount(1);
  const row = (await page.locator('.stop-edit .stepper').boundingBox()).y;
  const remove = await page.getByRole('button', { name: 'Remove Bergen' }).boundingBox();
  expect(Math.abs(remove.y + remove.height / 2 - (row + 18))).toBeLessThan(30);
  await expect(page.locator('.stop-edit .ghead, .stop-edit [aria-label="Generate days with AI for Bergen"]')).toHaveCount(0);
});

test('remove a stop confirms with its day count', async ({ page }) => {
  const requests = [];
  await mockApi(page, { requests });
  await page.goto('/trip/?id=1');
  await page.getByRole('button', { name: 'Edit stop Oslo' }).click();
  await page.getByRole('button', { name: 'Remove Oslo' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Oslo and its 2 days will be removed.');
  await page.getByRole('button', { name: 'Remove stop' }).click();
  await expect(headings(page)).toHaveText(['Bergen · 1 day', 'Flåm · 0 days']);
  expect(writes(requests)[0]).toMatchObject({ method: 'DELETE', path: '/api/trips/1/route-stops/11' });
});

test('a failed structure change reloads the real state and offers Retry', async ({ page }) => {
  await mockApi(page, { writeStatus: 500 });
  await page.goto('/trip/?id=1');
  await page.getByRole('button', { name: 'Delete day 1' }).click();
  await page.getByRole('button', { name: 'Delete day', exact: true }).click();
  await expect(page.locator('#save-status')).toContainText('Couldn’t save');
  await expect(headings(page).first()).toHaveText('Oslo · 2 days');
});

test('a view-only trip has none of these controls', async ({ page }) => {
  await mockApi(page, { sharedWithMe: [{ id: 5, name: 'Lisbon with Olena', shareId: 50, sharedBy: 'Olena' }] });
  await page.goto('/trip/?id=5');
  await expect(page.getByRole('button', { name: 'Add stop' })).toBeHidden();
  await expect(page.getByRole('button', { name: /Add a day/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Delete day|Duplicate day|Move day/ })).toHaveCount(0);
});

test('drag a day below another day in the same stop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1400 });
  const requests = [];
  await mockApi(page, { requests });
  await page.goto('/trip/?id=1');
  const rows = page.locator('#days-list .day-row');
  await rows.nth(0).dragTo(rows.nth(1), { targetPosition: { x: 100, y: 40 } });
  await expect(dayTitles(page)).toHaveText(['Art and Culture', 'Historic Core', 'Day 3']);
  expect(writes(requests)[0]).toMatchObject({ method: 'PUT', path: '/api/trips/1/days/101', body: { order: 1 } });
});

test('a day cannot be dropped onto another stop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1400 });
  const requests = [];
  await mockApi(page, { requests });
  await page.goto('/trip/?id=1');
  const rows = page.locator('#days-list .day-row');
  await rows.nth(0).dragTo(rows.nth(2));
  expect(writes(requests)).toHaveLength(0);
  await expect(dayTitles(page)).toHaveText(['Historic Core', 'Art and Culture', 'Day 3']);
});

test('drag a stop to the top of the route', async ({ page }) => {
  const requests = [];
  await mockApi(page, { requests });
  await page.goto('/trip/?id=1');
  const rows = page.locator('#route-list .stop-row');
  await rows.nth(2).dragTo(rows.nth(0), { targetPosition: { x: 100, y: 4 } });
  await expect(headings(page)).toHaveText(['Flåm · 0 days', 'Oslo · 2 days', 'Bergen · 1 day']);
  expect(writes(requests)[0]).toMatchObject({ path: '/api/trips/1/route-stops/reorder', body: { orderedStopIds: [13, 11, 12] } });
});

test('the stop editor no longer has Change place', async ({ page }) => {
  await mockApi(page);
  await page.goto('/trip/?id=1');
  await page.getByRole('button', { name: 'Edit stop Oslo' }).click();
  await expect(page.getByRole('button', { name: /Change place/ })).toHaveCount(0);
});

test('view-only trips cannot be dragged', async ({ page }) => {
  await mockApi(page, { sharedWithMe: [{ id: 5, name: 'Lisbon with Olena', shareId: 50, sharedBy: 'Olena' }] });
  await page.goto('/trip/?id=5');
  await expect(page.locator('[draggable="true"]')).toHaveCount(0);
});
