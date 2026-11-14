const { test, expect } = require('@playwright/test');
const { installFakeFirebase } = require('./fake-firebase');
const { mockApi, signIn } = require('./fake-api');

test.beforeEach(async ({ page }) => {
  await installFakeFirebase(page);
  await page.route('**/login/*', (route) => route.fulfill({ contentType: 'text/html', body: '<title>Login</title>' }));
});

test('signed-out visitors are sent to log in and brought back', async ({ page }) => {
  await page.goto('/trip/?id=1');
  await expect(page).toHaveURL(/\/login\/\?next=%2Ftrip%2F%3Fid%3D1$/);
});

test.describe('trip details', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('shows the title row, overview, itinerary and route', async ({ page }) => {
    await mockApi(page, { shares: { 1: [{ sharedWith: 'max@x.co', shareId: 9 }] } });
    await page.goto('/trip/?id=1');

    await expect(page.locator('#trip-name')).toHaveText('2 weeks in Norway');
    await expect(page).toHaveTitle('2 weeks in Norway | Plainer');
    await expect(page.locator('#trip-status')).toHaveText('Active');
    await expect(page.locator('#trip-dates')).toHaveText('1 – 3 Jan 2020');
    await expect(page.locator('#trip-owner')).toHaveText('Owned by you');
    await expect(page.locator('#trip-people .avatar')).toHaveAttribute('title', 'max@x.co');
    await expect(page.getByRole('link', { name: 'All trips' })).toHaveAttribute('href', '/trips/');

    const stats = page.locator('#pane-overview .stat');
    await expect(stats.nth(0)).toContainText('3');
    await expect(stats.nth(0)).toContainText('Stops');
    await expect(stats.nth(1)).toContainText('3');
    await expect(stats.nth(2)).toContainText('Validation');
    await expect(stats.nth(2).locator('b')).toHaveText('3');
    await expect(page.locator('#pane-overview')).toContainText('2 of 3 days have a plan');
    await expect(page.getByRole('progressbar', { name: 'Planning progress' })).toHaveAttribute('aria-valuenow', '67');
    await expect(page.locator('#pane-overview')).toContainText('Fix 3 validation issues');

    // Stops are in route order, with their days grouped underneath.
    const headings = page.locator('#days-list .ghead b');
    await expect(headings).toHaveText(['Oslo · 2 days', 'Bergen · 1 day', 'Flåm · 0 days']);
    await expect(page.locator('#route-list .stop-row')).toHaveCount(3);
    await expect(page.locator('#route-list .stop-row').nth(0)).toContainText('Planned: 2 · Actual: 2 · Flight');
    await expect(page.locator('#route-list .stop-row').nth(1)).toContainText('Planned: 1 · Actual: 1 · Train');
    await expect(page.locator('#route-list .stop-row').nth(2)).toContainText('Planned: 3 · Actual: 0');
  });

  test('the first day is open; days expand and collapse with aria-expanded', async ({ page }) => {
    await mockApi(page);
    await page.goto('/trip/?id=1');

    const first = page.getByRole('button', { name: 'Collapse day 1' });
    await expect(first).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#day-101-plan')).toContainText('Akershus Fortress.');

    const second = page.getByRole('button', { name: 'Expand day 2' });
    await expect(second).toHaveAttribute('aria-expanded', 'false');
    await second.click();
    const plan = page.locator('#day-102-plan');
    await expect(plan).toContainText('Visit the National Museum & Munch.');
    await expect(plan).toContainText('• Lunch at Mathallen');
    await expect(page.getByRole('button', { name: 'Collapse day 2' })).toBeFocused();

    await page.getByRole('button', { name: 'Collapse day 2' }).click();
    await expect(plan).toHaveCount(0);
  });

  test('days without a title or plan still render', async ({ page }) => {
    await mockApi(page);
    await page.goto('/trip/?id=1');
    await page.getByRole('button', { name: 'Expand day 3' }).click();
    await expect(page.locator('#days-list')).toContainText('Day 3');
    await expect(page.locator('#day-103-plan')).toContainText('Add a plan for this day');
  });

  test('a trip without stops explains how to add them', async ({ page }) => {
    await mockApi(page);
    await page.goto('/trip/?id=2');
    await expect(page.locator('#trip-status')).toHaveText('Upcoming');
    await expect(page.locator('#trip-dates')).toHaveText('Starts 12 Jun 2099');
    await expect(page.locator('#days-list')).toContainText('No stops or days yet');
    await expect(page.locator('#route-list')).toContainText('no stops yet');
    await expect(page.locator('#pane-overview')).toContainText('No days planned yet');
    await expect(page.locator('#pane-overview .stat').nth(2).locator('b')).toHaveText('OK');
    await expect(page.locator('#pane-overview')).not.toContainText('Fix');
  });

  test('a trip shared with me shows who shared it', async ({ page }) => {
    await mockApi(page, { sharedWithMe: [{ id: 5, name: 'Lisbon with Olena', shareId: 50, sharedBy: 'Olena' }] });
    await page.goto('/trip/?id=5');
    await expect(page.locator('#trip-owner')).toHaveText('Shared by Olena');
    await expect(page.locator('#trip-people')).toBeEmpty();
  });

  test('validation failing does not block the page', async ({ page }) => {
    const { sampleDetails } = require('./fake-api');
    const details = { 1: { ...sampleDetails[1], validation: null } };
    await mockApi(page, { details });
    await page.goto('/trip/?id=1');
    await expect(page.locator('#trip-name')).toHaveText('2 weeks in Norway');
    await expect(page.locator('#pane-overview .stat').nth(2).locator('b')).toHaveText('–');
  });

  test('unknown, forbidden and malformed ids show the not-found message', async ({ page }) => {
    await mockApi(page);
    await page.goto('/trip/?id=999');
    await expect(page.getByRole('alert')).toContainText('Trip not found');
    await expect(page.getByRole('link', { name: 'Back to all trips' })).toHaveAttribute('href', '/trips/');

    await page.goto('/trip/?id=abc');
    await expect(page.getByRole('alert')).toContainText('Trip not found');
    await page.goto('/trip/');
    await expect(page.getByRole('alert')).toContainText('Trip not found');
  });

  test('a 403 shows the not-found message', async ({ page }) => {
    await mockApi(page, { detailStatus: 403 });
    await page.goto('/trip/?id=1');
    await expect(page.getByRole('alert')).toContainText('Trip not found');
  });

  test('a server error offers a retry', async ({ page }) => {
    await mockApi(page, { detailStatus: 500 });
    await page.goto('/trip/?id=1');
    await expect(page.getByRole('alert')).toContainText('couldn’t load this trip');
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  test('trip names are shown as text, never as markup', async ({ page }) => {
    const { sampleDetails } = require('./fake-api');
    const evil = '<img src=x onerror="window.pwned=1">Trip';
    const details = { 1: { ...sampleDetails[1], trip: { ...sampleDetails[1].trip, name: evil } } };
    await mockApi(page, { details });
    await page.goto('/trip/?id=1');
    await expect(page.locator('#trip-name')).toHaveText(evil);
    expect(await page.evaluate(() => window.pwned)).toBeUndefined();
  });

  test('deferred actions are not rendered, and there is no Save button', async ({ page }) => {
    await mockApi(page);
    await page.goto('/trip/?id=1');
    for (const name of ['Save changes', 'Save']) {
      await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
    }
    await expect(page.locator('.pane-tabs')).toBeHidden();
  });

  test('a trip shared with me is view only and offers Leave', async ({ page }) => {
    const requests = [];
    await mockApi(page, { requests, sharedWithMe: [{ id: 5, name: 'Lisbon with Olena', shareId: 50, sharedBy: 'Olena' }] });
    await page.goto('/trip/?id=5');
    await expect(page.locator('#readonly-note')).toHaveText('Shared by Olena · view only');
    await expect(page.locator('.editable')).toHaveCount(0);
    await expect(page.locator('.stepper')).toHaveCount(0);
    await expect(page.locator('.stop-open')).toHaveCount(0);

    await page.getByRole('button', { name: 'More trip actions' }).click();
    await expect(page.getByRole('menuitem')).toHaveText(['Leave trip…']);
    await page.getByRole('menuitem', { name: 'Leave trip…' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('Leave this trip?');
    await page.getByRole('button', { name: 'Cancel' }).click();
    expect(requests.some((r) => r.method === 'DELETE')).toBe(false);

    await page.getByRole('button', { name: 'More trip actions' }).click();
    await page.getByRole('menuitem', { name: 'Leave trip…' }).click();
    await page.route('**/trips/', (route) => route.fulfill({ contentType: 'text/html', body: '<title>Trips</title>' }));
    await page.getByRole('button', { name: 'Leave trip' }).click();
    await expect(page).toHaveURL(/\/trips\/$/);
    expect(requests.find((r) => r.method === 'DELETE').path).toBe('/api/trip-shares/unsubscribe/5');
  });

  test.describe('phone', () => {
    test.use({ viewport: { width: 390, height: 800 } });

    test('Overview, Stops and Days are tabs', async ({ page }) => {
      await mockApi(page);
      await page.goto('/trip/?id=1');
      await expect(page.locator('#pane-overview')).toBeVisible();
      await expect(page.locator('#pane-days')).toBeHidden();
      await expect(page.locator('#pane-stops')).toBeHidden();

      await page.getByRole('tab', { name: 'Days' }).click();
      await expect(page.locator('#pane-days')).toBeVisible();
      await expect(page.locator('#pane-overview')).toBeHidden();
      await expect(page.getByRole('tab', { name: 'Days' })).toHaveAttribute('aria-selected', 'true');

      await page.getByRole('tab', { name: 'Stops' }).click();
      await expect(page.locator('#pane-stops')).toBeVisible();
      await expect(page.locator('#route-list')).toContainText('Oslo');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      expect(overflow).toBe(false);
    });
  });
});
