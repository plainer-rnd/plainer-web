const { test, expect } = require('@playwright/test');
const { installFakeFirebase } = require('./fake-firebase');
const { mockApi, signIn, KNOWN_LINK } = require('./fake-api');

const PAGE = `/join-shared-trip?code=${KNOWN_LINK}`;
const writes = (requests) => requests.filter((r) => r.method !== 'GET');
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

test.describe('opened on a computer without logging in', () => {
  test.beforeEach(async ({ page }) => {
    await installFakeFirebase(page);
    await page.route(/\/login\/\?next=/, (route) => route.fulfill({ contentType: 'text/html', body: '<title>Login</title>' }));
  });

  test('shows the trip read-only with one action: log in to add it to the list', async ({ page }) => {
    const requests = [];
    await mockApi(page, { requests });
    await page.goto(PAGE);
    await expect(page.locator('#join-name')).toHaveText('2 weeks in Norway');
    await expect(page.locator('#join-meta')).toContainText('3 stops · 3 days');
    // the trip: days, route and map pins
    await expect(page.locator('#days-list .ghead b')).toHaveText(['Oslo · 2 days', 'Bergen · 1 day', 'Flåm · 0 days']);
    await expect(page.locator('#route-list .stop-row')).toHaveCount(3);
    await expect(page.locator('.map-pin')).toHaveText(['1', '2', '3']);
    await expect(page.locator('#days-list')).toContainText('Akershus Fortress.'); // the first day is open
    // read-only: nothing to edit, share, export or add
    await expect(page.locator('.editable, .stepper, .action-btn, #add-stop, #share-btn, #export-btn, #assistant-btn')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Edit|Share|Export|Add a day/ })).toHaveCount(0);
    // the one action
    const cta = page.getByRole('link', { name: 'Log in to add this trip to your list' });
    await expect(cta).toHaveCount(1);
    const href = new URL(await cta.getAttribute('href'), 'http://x');
    expect(href.pathname).toBe('/login/');
    expect(href.searchParams.get('next')).toBe(`/join-shared-trip?code=${KNOWN_LINK}`);
    await expect(page.locator('#join-app a:not(.leaflet-container *)')).toHaveCount(1); // the log-in link is the only link in the trip view (the map's own credit links aside)
    // anonymous: no token, and only the preview was asked for
    const calls = requests.filter((r) => r.path.startsWith('/api/'));
    expect(calls.map((r) => r.path)).toEqual([`/api/links/${KNOWN_LINK}/preview`]);
    expect(calls[0].authorization).toBeUndefined();
  });

  test('the page keeps the link code out of Referer and out of caches', async ({ page }) => {
    await mockApi(page);
    await page.goto(PAGE);
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  });

  test('days expand and collapse, and hovering a stop lights it on the map', async ({ page }) => {
    await mockApi(page);
    await page.goto(PAGE);
    await expect(page.locator('.map-pin')).toHaveCount(3);
    const second = page.getByRole('button', { name: 'Expand day 2' });
    await second.click();
    await expect(page.getByRole('button', { name: 'Collapse day 2' })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#days-list')).toContainText('National');
    await page.locator('#route-list .stop-row', { hasText: 'Bergen' }).hover();
    await expect(page.locator('.leaflet-marker-icon[aria-label$="Bergen"]')).toHaveClass(/is-active/);
  });

  test('stop and trip names are shown as text, never as markup', async ({ page }) => {
    const details = JSON.parse(JSON.stringify(require('./fake-api').sampleDetails));
    const evil = '<img src=x onerror="window.pwned=1">Evil';
    details[1].trip = { ...details[1].trip, name: evil };
    details[1].stops.find((s) => s.location.name === 'Oslo').location.name = evil;
    await mockApi(page, { details });
    await page.goto(PAGE);
    await expect(page.locator('#join-name')).toHaveText(evil);
    await expect(page.locator('#route-list')).toContainText(evil);
    expect(await page.evaluate(() => window.pwned)).toBeUndefined();
  });

  test('an unknown or revoked link says it has expired', async ({ page }) => {
    await mockApi(page);
    await page.goto('/join-shared-trip?code=11111111-1111-4111-8111-111111111111');
    await expect(page.getByRole('heading', { name: 'This link has expired' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Ask the person who shared the trip for a new link');
    await expect(page.locator('#join-app')).toBeHidden();
  });

  test('a missing or malformed code is explained without calling the server', async ({ page }) => {
    const requests = [];
    await mockApi(page, { requests });
    for (const url of ['/join-shared-trip', '/join-shared-trip?code=nope', '/join-shared-trip?code=<script>']) {
      await page.goto(url);
      await expect(page.getByRole('heading', { name: 'This link doesn’t look right' })).toBeVisible();
    }
    expect(requests.filter((r) => r.path.startsWith('/api/'))).toHaveLength(0);
  });

  test('a server error offers Try again, which loads the trip', async ({ page }) => {
    let fail = true;
    await mockApi(page);
    await page.route(/\/api\/links\/.*\/preview/, (route) => {
      if (fail) { fail = false; return route.fulfill({ status: 500, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"error":{"message":"boom"}}' }); }
      return route.fallback();
    });
    await page.goto(PAGE);
    await expect(page.getByRole('heading', { name: 'We couldn’t load this trip' })).toBeVisible();
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.locator('#join-name')).toHaveText('2 weeks in Norway');
  });

  test('still works when the map library can’t load', async ({ page }) => {
    await mockApi(page);
    await page.route('https://cdnjs.cloudflare.com/ajax/libs/leaflet/**', (route) => route.abort());
    await page.goto(PAGE);
    await expect(page.locator('#join-name')).toBeVisible();
    await expect(page.locator('#pane-map')).toBeHidden();
  });

  test('logging in brings you back to the trip; the sign-up page keeps the way back too', async ({ page }) => {
    await mockApi(page);
    const next = encodeURIComponent(`/join-shared-trip?code=${KNOWN_LINK}`);
    await page.unroute(/\/login\/\?next=/);
    await page.goto(`/login/?next=${next}`);
    const expected = `next=${next}`;
    const signup = page.getByRole('link', { name: 'Create an account' });
    await expect(signup).toHaveAttribute('href', `/signup/?${expected}`);
    await signup.click();
    await expect(page).toHaveURL(new RegExp('/signup/\\?next='));
    await expect(page.getByRole('link', { name: 'Log in' }).last()).toHaveAttribute('href', `/login/?${expected}`);
  });

  test('the plain login and sign-up pages still link to each other without a next page', async ({ page }) => {
    await mockApi(page);
    await page.unroute(/\/login\/\?next=/);
    await page.goto('/login/');
    await expect(page.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/signup/');
  });
});

test.describe('already signed in', () => {
  test.beforeEach(async ({ page }) => {
    await installFakeFirebase(page);
    await signIn(page);
    await page.route(/\/trip\/\?id=/, (route) => route.fulfill({ contentType: 'text/html', body: '<title>Trip</title>' }));
  });

  test('the one action is Add to my trips: it joins the trip and opens it', async ({ page }) => {
    const requests = [];
    await mockApi(page, { requests });
    await page.goto(PAGE);
    await expect(page.locator('#join-name')).toHaveText('2 weeks in Norway');
    await expect(page.getByRole('link', { name: /Log in/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Add to my trips' }).click();
    await expect(page).toHaveURL(/\/trip\/\?id=5$/);
    const join = requests.find((r) => r.path === `/api/links/${KNOWN_LINK}`);
    expect(join.method).toBe('GET');
    expect(join.authorization).toBe('Bearer fake-token');
  });

  test('a failure shows the server’s message and can be retried', async ({ page }) => {
    await mockApi(page, { applyStatus: 400, applyMessage: 'You can’t join this trip.' });
    await page.goto(PAGE);
    await page.getByRole('button', { name: 'Add to my trips' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'You can’t join this trip.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add to my trips' })).toBeEnabled();
  });

  test('an expired link when joining says so', async ({ page }) => {
    await mockApi(page, { applyStatus: 404 });
    await page.goto(PAGE);
    await page.getByRole('button', { name: 'Add to my trips' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'expired' })).toBeVisible();
  });
});

test.describe('on an iPhone', () => {
  test.use({ userAgent: IPHONE, viewport: { width: 390, height: 800 }, hasTouch: true });
  test.beforeEach(async ({ page }) => { await installFakeFirebase(page); });

  test('offers the app first, and the trip as a second choice', async ({ page }) => {
    await mockApi(page);
    await page.goto(PAGE);
    await expect(page.locator('#app-landing')).toBeVisible();
    await expect(page.locator('#join-app')).toBeHidden();
    await expect(page.getByRole('link', { name: 'Open in the Plainer app' })).toHaveAttribute('href', `plainer://join-shared-trip?code=${KNOWN_LINK}`);
    await expect(page.getByRole('link', { name: 'Get Plainer on the App Store' })).toHaveAttribute('href', /apps\.apple\.com/);
    await expect(page.locator('#app-landing')).toContainText('2 weeks in Norway');
    await page.getByRole('button', { name: 'Just view the trip here' }).click();
    await expect(page.locator('#join-app')).toBeVisible();
    await expect(page.locator('#app-landing')).toBeHidden();
    await expect(page.getByRole('link', { name: 'Log in to add this trip to your list' })).toBeVisible();
  });

  test('an expired link doesn’t push the app', async ({ page }) => {
    await mockApi(page);
    await page.goto('/join-shared-trip?code=11111111-1111-4111-8111-111111111111');
    await expect(page.getByRole('heading', { name: 'This link has expired' })).toBeVisible();
    await expect(page.getByRole('link', { name: /App Store/ })).toHaveCount(0);
  });

  test('buttons are 44px tall and the page fits the screen', async ({ page }) => {
    await mockApi(page);
    await page.goto(PAGE);
    for (const name of ['Open in the Plainer app', 'Get Plainer on the App Store']) {
      expect((await page.getByRole('link', { name }).boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
});

test.describe('on an Android phone', () => {
  test.use({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36', viewport: { width: 390, height: 800 } });
  test('the app is iPhone-only, so the trip is shown right away', async ({ page }) => {
    await installFakeFirebase(page);
    await mockApi(page);
    await page.goto(PAGE);
    await expect(page.locator('#join-name')).toBeVisible();
    await expect(page.locator('#app-landing')).toBeHidden();
    expect((await page.getByRole('link', { name: 'Log in to add this trip to your list' }).boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
});

test.describe('Share by link in the Share dialog', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:4173' }).catch(() => {});
    await installFakeFirebase(page);
    await signIn(page);
  });

  async function openShare(page, options = {}) {
    await mockApi(page, options);
    await page.goto('/trip/?id=1');
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    return page.getByRole('dialog', { name: 'Share trip' });
  }

  test('creates a link, shows it, and copies it', async ({ page }) => {
    const requests = [];
    const dialog = await openShare(page, { requests });
    await expect(dialog).toContainText('No link yet');
    await dialog.getByRole('button', { name: 'Create link' }).click();
    const field = dialog.getByLabel('Link to this trip');
    await expect(field).toHaveValue(/\/join-shared-trip\?code=[0-9a-f-]{36}$/);
    const post = writes(requests).find((r) => r.path === '/api/links');
    expect(post.body).toEqual({ tripId: 1, accessMode: 'View' });
    await dialog.getByRole('button', { name: 'Copy link' }).click();
    await expect(dialog.getByRole('status').filter({ hasText: /copied|Ctrl/ })).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
    if (copied !== null) expect(copied).toBe(await field.inputValue());
  });

  test('an existing link is shown straight away', async ({ page }) => {
    const code = '22222222-2222-4222-8222-222222222222';
    const dialog = await openShare(page, { links: [{ id: 5, tripId: 1, code, createdAt: '2026-11-01T00:00:00Z' }, { id: 6, tripId: 2, code: '33333333-3333-4333-8333-333333333333', createdAt: '2026-11-01T00:00:00Z' }] });
    await expect(dialog.getByLabel('Link to this trip')).toHaveValue(new RegExp(`/join-shared-trip\\?code=${code}$`));
    await expect(dialog.getByRole('button', { name: 'Create link' })).toHaveCount(0);
  });

  test('Regenerate asks first, deletes the old link and shows a new one', async ({ page }) => {
    const requests = [];
    const code = '22222222-2222-4222-8222-222222222222';
    const dialog = await openShare(page, { requests, links: [{ id: 5, tripId: 1, code, createdAt: '2026-11-01T00:00:00Z' }] });
    await dialog.getByRole('button', { name: 'Regenerate' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('everyone who joined with it will lose access');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
    expect(writes(requests).filter((r) => r.path.startsWith('/api/links'))).toHaveLength(0);
    await dialog.getByRole('button', { name: 'Regenerate' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Regenerate' }).click();
    await expect(dialog.getByLabel('Link to this trip')).not.toHaveValue(new RegExp(code));
    await expect(dialog.getByLabel('Link to this trip')).toHaveValue(/code=[0-9a-f-]{36}$/);
    const sent = writes(requests).filter((r) => r.path.startsWith('/api/links')).map((r) => `${r.method} ${r.path}`);
    expect(sent).toEqual(['DELETE /api/links/5', 'POST /api/links']);
  });

  test('Turn off link deletes it and offers to create one again', async ({ page }) => {
    const requests = [];
    const dialog = await openShare(page, { requests, links: [{ id: 5, tripId: 1, code: '22222222-2222-4222-8222-222222222222', createdAt: '2026-11-01T00:00:00Z' }] });
    await dialog.getByRole('button', { name: 'Turn off link' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Turn off' }).click();
    await expect(dialog.getByRole('button', { name: 'Create link' })).toBeVisible();
    expect(writes(requests).some((r) => r.method === 'DELETE' && r.path === '/api/links/5')).toBe(true);
    expect(writes(requests).some((r) => r.method === 'POST' && r.path === '/api/links')).toBe(false);
  });

  test('a failed create shows a message and can be retried', async ({ page }) => {
    const dialog = await openShare(page, { linkCreateStatus: 500 });
    await dialog.getByRole('button', { name: 'Create link' }).click();
    await expect(dialog.getByRole('alert').filter({ hasText: 'Couldn’t create the link' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Create link' })).toBeEnabled();
  });

  test('the link works end to end: what the dialog shows opens the shared trip page', async ({ page, context }) => {
    const dialog = await openShare(page, { links: [{ id: 5, tripId: 1, code: KNOWN_LINK, createdAt: '2026-11-01T00:00:00Z' }] });
    const url = await dialog.getByLabel('Link to this trip').inputValue();
    const other = await context.newPage();
    await installFakeFirebase(other);
    await mockApi(other, { links: [{ id: 5, tripId: 1, code: KNOWN_LINK, createdAt: '2026-11-01T00:00:00Z' }] });
    await other.goto(url);
    await expect(other.locator('#join-name')).toHaveText('2 weeks in Norway');
  });
});
