const { test, expect } = require('@playwright/test');
const { installFakeFirebase } = require('./fake-firebase');
const { mockApi, signIn } = require('./fake-api');

const writes = (requests) => requests.filter((r) => r.method !== 'GET');

test.beforeEach(async ({ page }) => {
  await installFakeFirebase(page);
  await signIn(page);
});

test('Share is for owners; Export PDF is for everyone', async ({ page }) => {
  await mockApi(page);
  await page.goto('/trip/?id=1');
  await expect(page.getByRole('button', { name: 'Share' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export PDF' })).toBeVisible();

  await page.unroute('https://api.test/api/**');
  await mockApi(page, { sharedWithMe: [{ id: 5, name: 'Lisbon with Olena', shareId: 50, sharedBy: 'Olena' }] });
  await page.goto('/trip/?id=5');
  await expect(page.getByRole('button', { name: 'Share' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export PDF' })).toBeVisible();
});

test('share with a Plainer user, see them listed, then stop sharing', async ({ page }) => {
  const requests = [];
  await mockApi(page, { requests, shares: { 1: [{ sharedWith: 'max@x.co', shareId: 9 }] } });
  await page.goto('/trip/?id=1');
  await page.getByRole('button', { name: 'Share' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('view-only access');
  await expect(dialog).toContainText('max@x.co');

  await dialog.getByLabel('Email address').fill('known@x.co');
  await dialog.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(dialog).toContainText('known@x.co');
  expect(writes(requests)[0]).toMatchObject({ method: 'POST', path: '/api/trip-shares', body: { tripId: 1, emails: ['known@x.co'] } });
  await expect(page.locator('#trip-people .avatar')).toHaveCount(2);

  await dialog.getByRole('button', { name: 'Stop sharing with max@x.co' }).click();
  await expect(dialog).not.toContainText('max@x.co');
  expect(writes(requests).some((r) => r.method === 'DELETE' && r.path === '/api/trip-shares/9')).toBe(true);
  await expect(page.locator('#trip-people .avatar')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Share' })).toBeFocused();
});

test('invalid and unknown emails get a clear message', async ({ page }) => {
  const requests = [];
  await mockApi(page, { requests });
  await page.goto('/trip/?id=1');
  await page.getByRole('button', { name: 'Share' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Email address').fill('nope');
  await dialog.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('valid email');
  expect(writes(requests)).toHaveLength(0);

  await dialog.getByLabel('Email address').fill('stranger@x.co');
  await dialog.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('doesn’t have a Plainer account');
});

test('Export PDF downloads a file with the name the server gives it', async ({ page }) => {
  const requests = [];
  await mockApi(page, { requests });
  await page.goto('/trip/?id=1');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PDF' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('Plainer – Norway – 2020-01-01.pdf');
  expect(requests.some((r) => r.path === '/api/trips/1/export/pdf' && r.authorization === 'Bearer fake-token')).toBe(true);
  await expect(page.getByRole('button', { name: 'Export PDF' })).toBeEnabled();
});

test('without a readable Content-Disposition header the file is named after the trip', async ({ page }) => {
  await mockApi(page, { exportDisposition: null });
  await page.goto('/trip/?id=1');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PDF' }).click();
  expect((await download).suggestedFilename()).toBe('Plainer – 2 weeks in Norway.pdf');
});

test('a hostile file name from the server can only ever be a plain file name', async ({ page }) => {
  await mockApi(page, { exportDisposition: 'attachment; filename="../../evil.pdf"' });
  await page.goto('/trip/?id=1');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PDF' }).click();
  expect((await download).suggestedFilename()).toBe('evil.pdf');
});

test('a failed export says so', async ({ page }) => {
  await mockApi(page, { exportStatus: 500 });
  await page.goto('/trip/?id=1');
  await page.getByRole('button', { name: 'Export PDF' }).click();
  await expect(page.locator('#save-status')).toContainText('Couldn’t export');
  await expect(page.getByRole('button', { name: 'Export PDF' })).toBeEnabled();
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 800 } });
  test('actions fit in one row with 44px targets', async ({ page }) => {
    await mockApi(page);
    await page.goto('/trip/?id=1');
    for (const name of ['Share', 'Export PDF', 'More trip actions']) {
      const box = await page.getByRole('button', { name }).boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
});
