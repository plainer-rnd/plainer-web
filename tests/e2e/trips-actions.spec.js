const { test, expect } = require('@playwright/test');
const { installFakeFirebase } = require('./fake-firebase');
const { mockApi, signIn } = require('./fake-api');

const writes = (requests) => requests.filter((r) => r.method !== 'GET');

test.beforeEach(async ({ page }) => {
  await installFakeFirebase(page);
  await signIn(page);
  await page.route(/\/trip\/\?id=/, (route) => route.fulfill({ contentType: 'text/html', body: '<title>Trip</title>' }));
});

test('the menu on an owned trip offers Open, Duplicate and Delete', async ({ page }) => {
  await mockApi(page);
  await page.goto('/trips/');
  await page.getByRole('button', { name: 'Actions for Scotland' }).click();
  await expect(page.getByRole('menuitem')).toHaveText(['Open', 'Duplicate', 'Delete…']);
  await expect(page.getByRole('menuitem', { name: 'Open' })).toHaveAttribute('href', '/trip/?id=2');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Actions for Scotland' })).toBeFocused();
});

test('clicking elsewhere closes the menu, and the card still opens normally', async ({ page }) => {
  await mockApi(page);
  await page.goto('/trips/');
  await page.getByRole('button', { name: 'Actions for Scotland' }).click();
  await page.getByRole('heading', { name: 'Trips' }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.locator('a.tcard', { hasText: 'Scotland' }).click();
  await expect(page).toHaveURL(/\/trip\/\?id=2$/);
});

test('Duplicate sends a clone request and refreshes the list', async ({ page }) => {
  const requests = [];
  await mockApi(page, { requests });
  await page.goto('/trips/');
  await page.getByRole('button', { name: 'Actions for Scotland' }).click();
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  await expect(page.locator('#results-status')).toContainText('Duplicated “Scotland”');
  expect(writes(requests)[0]).toMatchObject({ method: 'POST', path: '/api/trips/2/clone' });
});

test('Delete asks first', async ({ page }) => {
  const requests = [];
  await mockApi(page, { requests });
  await page.goto('/trips/');
  await page.getByRole('button', { name: 'Actions for Scotland' }).click();
  await page.getByRole('menuitem', { name: 'Delete…' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('“Scotland”');
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect(writes(requests)).toHaveLength(0);

  await page.getByRole('button', { name: 'Actions for Scotland' }).click();
  await page.getByRole('menuitem', { name: 'Delete…' }).click();
  await page.getByRole('button', { name: 'Delete trip' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(writes(requests)[0]).toMatchObject({ method: 'DELETE', path: '/api/trips/2' });
});

test('a shared trip offers Leave, not Delete', async ({ page }) => {
  const requests = [];
  await mockApi(page, { requests });
  await page.goto('/trips/');
  await page.getByRole('tab', { name: /Shared with me/ }).click();
  await page.getByRole('button', { name: 'Actions for Max’s Alps' }).click();
  await expect(page.getByRole('menuitem')).toHaveText(['Open', 'Leave trip…']);
  await page.getByRole('menuitem', { name: 'Leave trip…' }).click();
  await page.getByRole('button', { name: 'Leave trip' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(writes(requests)[0]).toMatchObject({ method: 'DELETE', path: '/api/trip-shares/unsubscribe/6' });
});

test('the menu also works in the list view', async ({ page }) => {
  await mockApi(page);
  await page.goto('/trips/');
  await page.getByRole('button', { name: 'List' }).click();
  await page.getByRole('button', { name: 'Actions for Scotland' }).click();
  await expect(page.getByRole('menuitem', { name: 'Duplicate' })).toBeVisible();
});

test('New trip needs a name, creates a draft and opens it', async ({ page }) => {
  const requests = [];
  await mockApi(page, { requests });
  await page.goto('/trips/');
  await page.getByRole('button', { name: 'New trip' }).click();
  await page.getByRole('button', { name: 'Create trip' }).click();
  await expect(page.getByRole('alert')).toContainText('Give your trip a name');
  expect(writes(requests)).toHaveLength(0);

  await page.getByLabel('Trip name').fill('Lisbon');
  await page.getByLabel('Start date (optional)').fill('2027-03-05');
  await page.getByRole('button', { name: 'Create trip' }).click();
  await expect(page).toHaveURL(/\/trip\/\?id=900$/);
  expect(writes(requests)[0]).toMatchObject({ method: 'POST', path: '/api/trips', body: { name: 'Lisbon', startDate: '2027-03-05T00:00:00Z', isDraft: true } });
});

test('New trip without a date sends the "no date" placeholder', async ({ page }) => {
  const requests = [];
  await mockApi(page, { requests });
  await page.goto('/trips/');
  await page.getByRole('button', { name: 'New trip' }).click();
  await page.getByLabel('Trip name').fill('Someday');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/trip\/\?id=900$/);
  expect(writes(requests)[0].body.startDate).toBe('0001-01-01T00:00:00Z');
});

test('an empty list offers New trip and the app link', async ({ page }) => {
  await mockApi(page, { trips: [] });
  await page.goto('/trips/');
  await expect(page.getByRole('button', { name: 'New trip' })).toHaveCount(2);
  await expect(page.getByRole('link', { name: 'Get the iPhone app' })).toBeVisible();
});
