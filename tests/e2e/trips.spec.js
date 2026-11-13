const { test, expect } = require('@playwright/test');
const { installFakeFirebase, fakeCalls } = require('./fake-firebase');
const { mockApi, signIn } = require('./fake-api');

test.beforeEach(async ({ page }) => {
  await installFakeFirebase(page);
  await page.route('**/login/*', (route) => route.fulfill({ contentType: 'text/html', body: '<title>Login</title>' }));
});

test('signed-out visitors are sent to log in and brought back', async ({ page }) => {
  await page.goto('/trips/');
  await expect(page).toHaveURL(/\/login\/\?next=%2Ftrips%2F$/);
});

test.describe('trips list', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('shows owned trips as cards with status, dates and owner line', async ({ page }) => {
    const requests = [];
    await mockApi(page, { requests });
    await page.goto('/trips/');

    await expect(page.locator('#page-sub')).toHaveText('4 trips you own');
    await expect(page.locator('#tab-mine .count')).toHaveText('4');
    await expect(page.locator('#tab-shared .count')).toHaveText('2');
    const cards = page.locator('a.tcard');
    await expect(cards).toHaveCount(4);

    const norway = cards.filter({ hasText: '2 weeks in Norway' });
    await expect(norway.locator('.badge')).toHaveText('Active');
    await expect(norway).toContainText('Starts 1 Jan 2020');
    await expect(norway).toHaveAttribute('href', '/trip/?id=1');

    const scotland = cards.filter({ hasText: 'Scotland' });
    await expect(scotland.locator('.badge')).toHaveText('Upcoming');
    await expect(scotland).toContainText('Owned by you · shared with 2');

    const rome = cards.filter({ hasText: 'Rome' });
    await expect(rome.locator('.badge')).toHaveText('Draft');
    await expect(rome).toContainText('Dates not set');

    const trips = requests.find((r) => r.path === '/api/trips');
    expect(trips.search).toBe('?includeShared=true');
    expect(trips.authorization).toBe('Bearer fake-token');
  });

  test('shared tab lists trips shared with the user', async ({ page }) => {
    await mockApi(page);
    await page.goto('/trips/');
    await page.getByRole('tab', { name: /Shared with me/ }).click();
    await expect(page.locator('#page-sub')).toHaveText('2 trips shared with you');
    await expect(page.locator('a.tcard')).toHaveCount(2);
    await expect(page.locator('a.tcard', { hasText: 'Lisbon' })).toContainText('Shared by Olena');
    await expect(page.getByRole('tab', { name: /Shared with me/ })).toHaveAttribute('aria-selected', 'true');
  });

  test('status chips and search filter the list', async ({ page }) => {
    await mockApi(page);
    await page.goto('/trips/');
    await page.getByRole('button', { name: 'Upcoming' }).click();
    await expect(page.locator('a.tcard')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Upcoming' })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'All' }).click();
    await page.getByLabel('Search trips').fill('  rom ');
    await expect(page.locator('a.tcard')).toHaveCount(1);
    await expect(page.locator('a.tcard')).toContainText('Rome');

    await page.getByLabel('Search trips').fill('zzz');
    await expect(page.getByRole('heading', { name: 'No trips match your search' })).toBeVisible();
    await page.getByRole('button', { name: 'Clear search and filters' }).click();
    await expect(page.locator('a.tcard')).toHaveCount(4);
  });

  test('list view is a table and the choice is remembered', async ({ page }) => {
    await mockApi(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/trips/');
    await page.getByRole('button', { name: 'List' }).click();
    await expect(page.getByRole('columnheader', { name: 'Trip' })).toBeVisible();
    await expect(page.getByRole('row')).toHaveCount(5);
    await expect(page.getByRole('link', { name: 'Scotland' })).toHaveAttribute('href', '/trip/?id=2');

    await page.reload();
    await expect(page.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('columnheader', { name: 'Owner' })).toBeVisible();
  });

  test('trip names are shown as text, never as HTML', async ({ page }) => {
    await mockApi(page, { trips: [{ id: 9, name: '<img src=x onerror="window.pwned=1">', isDraft: true }] });
    await page.goto('/trips/');
    await expect(page.locator('a.tcard h2')).toHaveText('<img src=x onerror="window.pwned=1">');
    expect(await page.evaluate(() => window.pwned)).toBeUndefined();
  });

  test('empty states', async ({ page }) => {
    await mockApi(page, { trips: [] });
    await page.goto('/trips/');
    await expect(page.getByRole('heading', { name: 'No trips yet' })).toBeVisible();
    await page.getByRole('tab', { name: /Shared with me/ }).click();
    await expect(page.getByRole('heading', { name: 'Nothing shared with you yet' })).toBeVisible();
  });

  test('a server error offers a retry that works', async ({ page }) => {
    let fail = true;
    await mockApi(page);
    await page.route('https://api.test/api/trips*', (route) => (fail
      ? route.fulfill({ status: 500, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"error":"boom"}' })
      : route.fallback()));
    await page.goto('/trips/');
    await expect(page.getByRole('alert')).toContainText('We couldn’t load your trips');
    fail = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.locator('a.tcard')).toHaveCount(4);
  });

  test('an unauthorised API response signs the user out and goes to log in', async ({ page }) => {
    await mockApi(page, { tripsStatus: 401 });
    await page.goto('/trips/');
    await expect(page).toHaveURL(/\/login\/\?next=%2Ftrips%2F$/);
  });

  test('the shared-with count is optional: the page works if that call fails', async ({ page }) => {
    await mockApi(page);
    await page.route('https://api.test/api/trip-shares/by', (route) => route.fulfill({ status: 500, headers: { 'access-control-allow-origin': '*' }, body: '' }));
    await page.goto('/trips/');
    await expect(page.locator('a.tcard')).toHaveCount(4);
    await expect(page.locator('a.tcard', { hasText: 'Scotland' })).not.toContainText('shared with');
  });
});

test.describe('account menu and banner', () => {
  test('menu shows name and email, closes on Escape, logs out', async ({ page }) => {
    await signIn(page);
    await mockApi(page);
    await page.goto('/trips/');
    const button = page.getByRole('button', { name: 'Account menu' });
    await expect(button).toHaveText('O');
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#account-name')).toHaveText('Olena Test');
    await expect(page.locator('#account-email')).toHaveText('olena@example.com');
    await expect(page.getByRole('link', { name: 'Profile' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#account-menu')).toBeHidden();
    await expect(button).toBeFocused();

    await button.click();
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login\/$/);
    expect(await page.evaluate(() => sessionStorage.getItem('fakeUser'))).toBeNull();
  });

  test('unverified users get a banner with a working resend', async ({ page }) => {
    await signIn(page, { email: 'new@example.com', displayName: 'New', emailVerified: false });
    await mockApi(page);
    await page.goto('/trips/');
    await expect(page.locator('.banner')).toContainText('Verify your email');
    await page.getByRole('button', { name: 'Resend email' }).click();
    await expect(page.locator('.banner')).toContainText('Sent. Check your inbox.');
    expect((await fakeCalls(page)).map((c) => c[0])).toContain('sendEmailVerification');
  });

  test('verified users see no banner', async ({ page }) => {
    await signIn(page);
    await mockApi(page);
    await page.goto('/trips/');
    await expect(page.locator('a.tcard')).toHaveCount(4);
    await expect(page.locator('.banner')).toHaveCount(0);
  });
});

test.describe('profile', () => {
  test('shows the backend profile and logs out', async ({ page }) => {
    await signIn(page);
    await mockApi(page);
    await page.goto('/profile/');
    await expect(page.locator('#profile-name')).toHaveText('Olena From API');
    await expect(page.locator('#profile-email')).toHaveText('olena@example.com');
    await page.locator('#profile-logout').click();
    await expect(page).toHaveURL(/\/login\/$/);
  });

  test('falls back to Firebase values when the API is down', async ({ page }) => {
    await signIn(page);
    await page.route('https://api.test/api/**', (route) => route.abort());
    await page.goto('/profile/');
    await expect(page.locator('#profile-name')).toHaveText('Olena Test');
  });
});

test.describe('responsive', () => {
  for (const width of [360, 390, 768, 1024, 1440]) {
    for (const view of ['cards', 'list']) {
      for (const scheme of ['light', 'dark']) {
        test(`no sideways scroll at ${width}px, ${view}, ${scheme}`, async ({ page }) => {
          await page.emulateMedia({ colorScheme: scheme });
          await page.addInitScript((v) => localStorage.setItem('plainerTripsView', v), view);
          await signIn(page);
          await mockApi(page, { trips: [{ id: 1, name: 'A very long trip name that keeps going and going to test truncation', startDate: '2099-06-12T00:00:00Z', isDraft: false }] });
          await page.setViewportSize({ width, height: 900 });
          await page.goto('/trips/');
          await expect(page.locator(view === 'cards' ? 'a.tcard' : 'tr.trow')).toHaveCount(1);
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          expect(overflow).toBeLessThanOrEqual(0);
        });
      }
    }
  }

  test('phone hides the header nav links and keeps touch targets large', async ({ page }) => {
    await signIn(page);
    await mockApi(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/trips/');
    await expect(page.locator('.app-nav')).toBeHidden();
    const box = await page.getByRole('tab', { name: /My trips/ }).boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  });
});
