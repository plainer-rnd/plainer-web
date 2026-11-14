const { test, expect } = require('@playwright/test');
const { installFakeFirebase } = require('./fake-firebase');
const { mockApi, signIn } = require('./fake-api');

test.beforeEach(async ({ page }) => {
  await installFakeFirebase(page);
  await signIn(page);
});

test('cards show how many stops and days each trip has', async ({ page }) => {
  await mockApi(page);
  await page.goto('/trips/');
  const card = (name) => page.locator('.tcard', { hasText: name });
  await expect(card('2 weeks in Norway')).toContainText('3 stops · 3 days');
  await expect(card('Scotland')).toContainText('1 stop · 1 day');
  await expect(card('Long weekend in Rome')).toContainText('No stops yet');
});

test('the list view shows them too, and shared trips have counts', async ({ page }) => {
  await mockApi(page);
  await page.goto('/trips/');
  await page.getByRole('button', { name: 'List' }).click();
  await expect(page.locator('tr', { hasText: '2 weeks in Norway' })).toContainText('3 stops · 3 days');
  await page.getByRole('tab', { name: /Shared with me/ }).click();
  await expect(page.locator('tr', { hasText: 'Lisbon with Olena' })).toContainText('2 stops · 5 days');
});

test('trips without counts from an older server show nothing extra', async ({ page }) => {
  await mockApi(page);
  await page.goto('/trips/');
  await expect(page.locator('.tcard', { hasText: 'France' })).not.toContainText('stop');
  await expect(page.locator('.tcard', { hasText: 'France' })).not.toContainText('No stops yet');
});
