const { test, expect } = require('@playwright/test');
const { installFakeFirebase } = require('./fake-firebase');
const { mockApi, signIn } = require('./fake-api');

const writes = (requests) => requests.filter((r) => r.method !== 'GET');

test.beforeEach(async ({ page }) => {
  await installFakeFirebase(page);
  await signIn(page);
  await page.route('**/login/*', (route) => route.fulfill({ contentType: 'text/html', body: '<title>Login</title>' }));
});

test('renaming the trip saves on Enter with the full trip body', async ({ page }) => {
  const requests = [];
  await mockApi(page, { requests });
  await page.goto('/trip/?id=1');

  await page.getByRole('button', { name: /Edit trip name/ }).click();
  const input = page.getByRole('textbox', { name: 'trip name' });
  await input.fill('Norway, again');
  await input.press('Enter');

  await expect(page.locator('#trip-name')).toHaveText('Norway, again');
  await expect(page.locator('#save-status')).toContainText('All changes saved');
  const put = writes(requests).find((r) => r.path === '/api/trips/1');
  expect(put.method).toBe('PUT');
  expect(put.body).toMatchObject({ name: 'Norway, again', isDraft: false, startDate: '2020-01-01T00:00:00Z' });
});

test('Esc cancels and an unchanged value sends nothing', async ({ page }) => {
  const requests = [];
  await mockApi(page, { requests });
  await page.goto('/trip/?id=1');

  await page.getByRole('button', { name: /Edit trip name/ }).click();
  await page.getByRole('textbox', { name: 'trip name' }).fill('Nope');
  await page.keyboard.press('Escape');
  await expect(page.locator('#trip-name')).toHaveText('2 weeks in Norway');

  await page.getByRole('button', { name: /Edit trip name/ }).click();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /Edit trip name/ }).click();
  await page.getByRole('textbox', { name: 'trip name' }).blur();
  expect(writes(requests)).toHaveLength(0);
  await expect(page.locator('#save-status')).toBeHidden();
});

test('changing the start date updates the range and saves', async ({ page }) => {
  const requests = [];
  await mockApi(page, { requests });
  await page.goto('/trip/?id=1');
  await page.getByRole('button', { name: /Edit start date/ }).click();
  const input = page.getByLabel('start date');
  await input.fill('2026-11-08');
  await input.press('Enter');
  await expect(page.locator('#trip-dates')).toHaveText('8 – 10 Nov 2026');
  expect(writes(requests)[0].body.startDate).toBe('2026-11-08T00:00:00Z');
});

test('editing a day title and plan saves each to its day', async ({ page }) => {
  const requests = [];
  await mockApi(page, { requests });
  await page.goto('/trip/?id=1');

  await page.getByRole('button', { name: /Edit title of day 1/ }).click();
  await page.getByLabel('title of day 1').fill('Old town');
  await page.keyboard.press('Enter');
  await expect(page.locator('#days-list')).toContainText('Old town');

  await page.getByRole('button', { name: /Edit plan for day 1/ }).click();
  const plan = page.getByLabel('plan for day 1');
  await plan.fill('Fortress <b>tour</b>\n\nHarbour walk');
  await plan.press('Control+Enter');
  await expect(page.locator('#day-101-plan')).toContainText('Harbour walk');
  await expect(page.locator('#save-status')).toContainText('All changes saved');

  const [title, description] = writes(requests);
  expect(title).toMatchObject({ method: 'PUT', path: '/api/trips/1/days/101', body: { title: 'Old town' } });
  expect(description.body).toEqual({ description: '<p>Fortress &lt;b&gt;tour&lt;/b&gt;</p><p>Harbour walk</p>' });
});

test('planned days and transport are saved on the stop', async ({ page }) => {
  const requests = [];
  await mockApi(page, { requests });
  await page.goto('/trip/?id=1');

  await page.getByRole('button', { name: 'More planned days for Oslo' }).click();
  await expect(page.locator('#route-list .stop-row').first()).toContainText('Planned: 3');
  await page.getByLabel('Getting to Oslo').selectOption('Cruise');
  await expect(page.locator('#route-list .stop-row').first()).toContainText('Cruise');
  await expect(page.getByRole('button', { name: 'Fewer planned days for Bergen' })).toBeDisabled();

  const stopWrites = writes(requests).filter((r) => r.path === '/api/trips/1/route-stops/11');
  expect(stopWrites.map((r) => r.body)).toEqual([{ plannedDays: 3 }, { transport: 'Cruise' }]);
});

test('a failed save puts the old value back and Retry sends it again', async ({ page }) => {
  const requests = [];
  const state = { fail: true };
  await mockApi(page, { requests });
  await page.route('https://api.test/api/trips/1', async (route, request) => {
    if (request.method() === 'PUT' && state.fail) {
      return route.fulfill({ status: 500, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"error":"boom"}' });
    }
    return route.fallback();
  });
  await page.goto('/trip/?id=1');

  await page.getByRole('button', { name: /Edit trip name/ }).click();
  await page.getByLabel('trip name').fill('Renamed');
  await page.keyboard.press('Enter');

  await expect(page.locator('#save-status')).toContainText('Couldn’t save');
  await expect(page.locator('#trip-name')).toHaveText('2 weeks in Norway');

  state.fail = false;
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.locator('#trip-name')).toHaveText('Renamed');
  await expect(page.locator('#save-status')).toContainText('All changes saved');
});

test('Duplicate trip opens the copy', async ({ page }) => {
  const requests = [];
  await mockApi(page, { requests });
  await page.route('**/trip/?id=77', (route) => route.fulfill({ contentType: 'text/html', body: '<title>Copy</title>' }));
  await page.goto('/trip/?id=1');
  await page.getByRole('button', { name: 'More trip actions' }).click();
  await expect(page.getByRole('menuitem')).toHaveText(['Duplicate trip', 'Delete trip…']);
  await page.getByRole('menuitem', { name: 'Duplicate trip' }).click();
  await expect(page).toHaveURL(/id=77$/);
  expect(writes(requests)[0]).toMatchObject({ method: 'POST', path: '/api/trips/1/clone' });
});

test('Delete trip asks first, then returns to the list', async ({ page }) => {
  const requests = [];
  await mockApi(page, { requests });
  await page.route('**/trips/', (route) => route.fulfill({ contentType: 'text/html', body: '<title>Trips</title>' }));
  await page.goto('/trip/?id=1');
  await page.getByRole('button', { name: 'More trip actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete trip…' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('2 weeks in Norway');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(writes(requests)).toHaveLength(0);

  await page.getByRole('button', { name: 'More trip actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete trip…' }).click();
  await page.getByRole('button', { name: 'Delete trip' }).click();
  await expect(page).toHaveURL(/\/trips\/$/);
  expect(writes(requests)[0]).toMatchObject({ method: 'DELETE', path: '/api/trips/1' });
});

test('a failed delete keeps the dialog open with a message', async ({ page }) => {
  await mockApi(page, { writeStatus: 500 });
  await page.goto('/trip/?id=1');
  await page.getByRole('button', { name: 'More trip actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete trip…' }).click();
  await page.getByRole('button', { name: 'Delete trip' }).click();
  await expect(page.getByRole('alertdialog').getByRole('alert')).toContainText('didn’t work');
});

test('returning to the tab refreshes the trip when nothing is being saved', async ({ page }) => {
  const { sampleDetails } = require('./fake-api');
  const details = JSON.parse(JSON.stringify({ 1: sampleDetails[1] }));
  details[1].trip.startDate = sampleDetails[1].trip.startDate;
  await mockApi(page, { details });
  await page.goto('/trip/?id=1');
  await expect(page.locator('#trip-name')).toHaveText('2 weeks in Norway');
  details[1].trip.name = 'Changed elsewhere';
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('#trip-name')).toHaveText('Changed elsewhere');
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 800 } });
  test('stop controls are tappable and nothing scrolls sideways', async ({ page }) => {
    await mockApi(page);
    await page.goto('/trip/?id=1');
    await page.getByRole('tab', { name: 'Stops' }).click();
    const plus = page.getByRole('button', { name: 'More planned days for Oslo' });
    const box = await plus.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
});

test('stop controls appear on hover and keyboard focus on desktop', async ({ page }) => {
  await mockApi(page);
  await page.goto('/trip/?id=1');
  const row = page.locator('#route-list .stop-row').first();
  const controls = row.locator('.stop-controls');
  await expect(controls).toHaveCSS('opacity', '0');
  await row.hover();
  await expect(controls).toHaveCSS('opacity', '1');
  await page.mouse.move(0, 0);
  await expect(controls).toHaveCSS('opacity', '0');
  await page.getByRole('button', { name: 'More planned days for Oslo' }).focus();
  await expect(controls).toHaveCSS('opacity', '1');
});
