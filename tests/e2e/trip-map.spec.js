const { test, expect } = require('@playwright/test');
const { installFakeFirebase } = require('./fake-firebase');
const { mockApi, signIn, sampleDetails } = require('./fake-api');

const clone = () => JSON.parse(JSON.stringify(sampleDetails));
const pins = (page) => page.locator('.map-pin');

test.beforeEach(async ({ page }) => {
  await installFakeFirebase(page);
  await signIn(page);
});

test('the map pins every stop, numbered like the Route list, with a popup', async ({ page }) => {
  await mockApi(page);
  await page.goto('/trip/?id=1');
  await expect(page.locator('#pane-map')).toBeVisible();
  await expect(pins(page)).toHaveText(['1', '2', '3']);
  await expect(page.locator('.leaflet-marker-icon').first()).toHaveAttribute('aria-label', 'Stop 1: Oslo');
  await page.getByRole('button', { name: 'Stop 1: Oslo' }).click();
  await expect(page.locator('.map-popup')).toContainText('1. Oslo');
  await expect(page.locator('.map-popup')).toContainText('Planned: 2 · Actual: 2 · Flight');
  // the map sits above both lists
  const map = await page.locator('#pane-map').boundingBox();
  const days = await page.locator('#pane-days').boundingBox();
  expect(map.y + map.height).toBeLessThanOrEqual(days.y);
});

test('stops without coordinates are left off but keep their number', async ({ page }) => {
  const details = clone();
  details[1].stops.find((stop) => stop.location.name === 'Bergen').location.latitude = 0;
  details[1].stops.find((stop) => stop.location.name === 'Bergen').location.longitude = 0;
  await mockApi(page, { details });
  await page.goto('/trip/?id=1');
  await expect(pins(page)).toHaveText(['1', '3']);
});

test('a trip with no known places has no map', async ({ page }) => {
  const details = clone();
  details[1].stops.forEach((stop) => { stop.location.latitude = 0; stop.location.longitude = 0; });
  await mockApi(page, { details });
  await page.goto('/trip/?id=1');
  await expect(page.locator('#trip-name')).toBeVisible();
  await expect(page.locator('#pane-map')).toBeHidden();
  await expect(page.locator('.leaflet-container')).toHaveCount(0);
});

test('removing a stop removes its pin', async ({ page }) => {
  await mockApi(page);
  await page.goto('/trip/?id=1');
  await expect(pins(page)).toHaveCount(3);
  await page.getByRole('button', { name: 'Edit stop Oslo' }).click();
  await page.getByRole('button', { name: 'Remove Oslo' }).click();
  await page.getByRole('button', { name: 'Remove stop' }).click();
  await expect(pins(page)).toHaveText(['1', '2']);
});

test('stop names are shown as text in the popup, never as markup', async ({ page }) => {
  const details = clone();
  const evil = '<img src=x onerror="window.pwned=1">Evil';
  details[1].stops.find((stop) => stop.location.name === 'Oslo').location.name = evil;
  await mockApi(page, { details });
  await page.goto('/trip/?id=1');
  await expect(pins(page)).toHaveCount(3);
  await page.locator('.leaflet-marker-icon').first().click();
  await expect(page.locator('.map-popup b')).toContainText(evil);
  expect(await page.evaluate(() => window.pwned)).toBeUndefined();
});

test('if the map library can’t load, the page still works without the map', async ({ page }) => {
  await mockApi(page);
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/leaflet/**', (route) => route.abort());
  await page.goto('/trip/?id=1');
  await expect(page.locator('#trip-name')).toBeVisible();
  await expect(page.locator('#days-list .day-row').first()).toBeVisible();
  await expect(page.locator('#pane-map')).toBeHidden();
});

test('the map is loaded from the pinned Leaflet version with integrity checks', async ({ page }) => {
  await mockApi(page);
  await page.goto('/trip/?id=1');
  await expect(pins(page)).toHaveCount(3);
  const tags = await page.evaluate(() => [...document.querySelectorAll('script[src*="leaflet"], link[href*="leaflet"]')].map((n) => [n.src || n.href, n.integrity, n.crossOrigin]));
  expect(tags).toHaveLength(2);
  for (const [url, integrity, cors] of tags) {
    expect(url).toContain('/ajax/libs/leaflet/1.9.4/');
    expect(integrity).toMatch(/^sha512-/);
    expect(cors).toBe('anonymous');
  }
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 800 } });
  test('the map shows above the Stops and Days lists, not on Overview', async ({ page }) => {
    await mockApi(page);
    await page.goto('/trip/?id=1');
    await expect(page.locator('#pane-map')).toBeHidden(); // Overview tab
    await page.getByRole('tab', { name: 'Stops' }).click();
    await expect(page.locator('#pane-map')).toBeVisible();
    await expect(pins(page)).toHaveCount(3);
    await page.getByRole('tab', { name: 'Days' }).click();
    await expect(page.locator('#pane-map')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
});
