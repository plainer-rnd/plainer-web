const { test, expect } = require('@playwright/test');
const { installFakeFirebase } = require('./fake-firebase');
const { mockApi, signIn } = require('./fake-api');

const writes = (requests) => requests.filter((r) => r.method !== 'GET');
const pdf = (name = 'plan.pdf', size = 200) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 ' + 'x'.repeat(size)) });

test.beforeEach(async ({ page }) => {
  await installFakeFirebase(page);
  await signIn(page);
  await page.route(/\/trip\/\?id=/, (route) => route.fulfill({ contentType: 'text/html', body: '<title>Trip</title>' }));
});

async function openDialog(page) {
  await page.goto('/trips/');
  await page.getByRole('button', { name: 'Import PDF' }).click();
  return page.getByRole('dialog', { name: 'Import a trip from PDF' });
}

test('importing a PDF uploads it as multipart and opens the new trip', async ({ page }) => {
  const requests = [];
  await mockApi(page, { requests });
  const dialog = await openDialog(page);
  await dialog.getByLabel('PDF file (up to 3 MB)').setInputFiles(pdf());
  await dialog.getByRole('button', { name: 'Import' }).click();
  await expect(page).toHaveURL(/\/trip\/\?id=88$/);
  const upload = writes(requests).find((r) => r.path === '/api/trips/import');
  expect(upload.body).toEqual({ multipart: true, hasPdf: true });
});

test('no file, a non-PDF and a too-big file are refused before any upload', async ({ page }) => {
  const requests = [];
  await mockApi(page, { requests });
  const dialog = await openDialog(page);
  const input = dialog.getByLabel('PDF file (up to 3 MB)');
  await dialog.getByRole('button', { name: 'Import' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Choose a PDF file first.');
  await input.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') });
  await dialog.getByRole('button', { name: 'Import' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Choose a PDF file.');
  await input.setInputFiles({ name: 'big.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(3 * 1024 * 1024 + 1) });
  await dialog.getByRole('button', { name: 'Import' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('That file is larger than 3 MB.');
  expect(writes(requests)).toHaveLength(0);
});

test('a PDF the server declines shows its reason and creates nothing', async ({ page }) => {
  await mockApi(page, { importResult: { tripId: null, tripName: null, rejectionReason: 'This looks like an invoice, not a trip plan.' } });
  const dialog = await openDialog(page);
  await dialog.getByLabel('PDF file (up to 3 MB)').setInputFiles(pdf());
  await dialog.getByRole('button', { name: 'Import' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('This looks like an invoice, not a trip plan.');
  await expect(page).toHaveURL(/\/trips\/$/);
  await expect(dialog.getByRole('button', { name: 'Import' })).toBeEnabled();
});

test('unresolved places are listed before opening the trip', async ({ page }) => {
  await mockApi(page, { importResult: { unresolvedStopNames: ['Atlantis'], routeStops: [{ name: 'Rome', daysMissing: true }] } });
  const dialog = await openDialog(page);
  await dialog.getByLabel('PDF file (up to 3 MB)').setInputFiles(pdf());
  await dialog.getByRole('button', { name: 'Import' }).click();
  await expect(dialog).toContainText('“Imported Rome” was added with 2 stops and 4 days.');
  await expect(dialog).toContainText('Atlantis');
  await expect(dialog).toContainText('Some days are missing for: Rome');
  await expect(dialog.getByRole('link', { name: 'Open trip' })).toHaveAttribute('href', '/trip/?id=88');
});

test('a server error shows a message and the dialog can retry', async ({ page }) => {
  await mockApi(page, { importStatus: 500 });
  const dialog = await openDialog(page);
  await dialog.getByLabel('PDF file (up to 3 MB)').setInputFiles(pdf());
  await dialog.getByRole('button', { name: 'Import' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Couldn’t import the PDF');
  await expect(dialog.getByRole('button', { name: 'Import' })).toBeEnabled();
});

test('a 400 shows the server’s message', async ({ page }) => {
  await mockApi(page, { importStatus: 400, importMessage: 'The file is not a PDF.' });
  const dialog = await openDialog(page);
  await dialog.getByLabel('PDF file (up to 3 MB)').setInputFiles(pdf());
  await dialog.getByRole('button', { name: 'Import' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('The file is not a PDF.');
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 800 } });
  test('header buttons fit with 44px targets', async ({ page }) => {
    await mockApi(page);
    await page.goto('/trips/');
    for (const name of ['Import PDF', 'New trip']) {
      const box = await page.getByRole('button', { name }).boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
});
